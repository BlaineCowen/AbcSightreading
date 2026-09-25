import type { RawPitch } from "./autocorrelation";

export type Sensitivity = "low" | "medium" | "high";

interface Profile {
  absMinDb: number; // ignore anything quieter than this
  peakMarginDb: number; // and anything this far below the recent loudest level
  onsetClarity: number; // clarity a *new* pitch needs
}

/**
 * `absMinDb` is only a cheap "don't bother running the detector" cutoff. It is
 * deliberately low because raw phone mics (AGC disabled) can deliver full-voice
 * singing near -55 dBFS, and an absolute gate tuned for a desktop mic rejects
 * everything on those devices. The real discrimination is relative — level
 * against the learned noise floor and the recent peak — which is independent of
 * how much gain the device applies.
 */
export const SENSITIVITY_PROFILES: Record<Sensitivity, Profile> = {
  low: { absMinDb: -48, peakMarginDb: 24, onsetClarity: 0.88 },
  medium: { absMinDb: -55, peakMarginDb: 30, onsetClarity: 0.85 },
  high: { absMinDb: -68, peakMarginDb: 36, onsetClarity: 0.8 },
};

/** Why the last frame produced no pitch — surfaced in the UI as a hint. */
export type BlockReason =
  | "silent"
  | "quiet"
  | "unclear"
  | "confirming"
  | "self-playing"
  | null;

const FLOOR_MARGIN_DB = 8; // must be this far above the tracked noise floor
const PEAK_DECAY_DB_PER_S = 5;
const FLOOR_RISE_DB_PER_S = 8; // how fast the floor absorbs steady background
/** Until the first note is found there is nothing to protect, so calibrate fast. */
const FLOOR_CALIBRATE_DB_PER_S = 40;

const CONTINUE_CLARITY = 0.7;
/** Well above the noise floor, a slightly rougher tone is still clearly a note. */
const LOUD_HEADROOM_DB = 25;
const LOUD_ONSET_CLARITY = 0.72;
/** The floor may never come within this of the loudest recent sound. */
const FLOOR_PEAK_HEADROOM_DB = 12;
const SAME_NOTE_CENTS = 80;
const CONFIRM_FRAMES = 2;
const CONFIRM_FRAMES_OCTAVE = 3;
const HOLD_MS = 120;
const HISTORY = 3;
/** A candidate this close to the strongest one wins if it comes first. */
const KEY_MAX_RATIO = 0.9;

const centsBetween = (a: number, b: number) => 1200 * Math.log2(a / b);
const isOctaveRelated = (cents: number) => {
  const r = Math.abs(cents) % 1200;
  return Math.abs(cents) >= 1100 && (r < 100 || r > 1100);
};

/**
 * Turns per-frame raw detections into a stable pitch stream: gates on level
 * relative to the recent signal, lets an existing note continue on modest
 * clarity, but requires a new pitch to be confirmed on consecutive frames
 * before switching — which is what stops quiet noises between notes from
 * flashing octave jumps.
 */
export class PitchTracker {
  private profile = SENSITIVITY_PROFILES.medium;
  private peakDb = -Infinity;
  private floorDb = -Infinity;
  private lastT = 0;
  private held: number | null = null;
  private heldAt = 0;
  private pending: { freq: number; count: number } | null = null;
  private history: number[] = [];
  private hasDetected = false;
  /** True while the app itself is sounding a note through the speaker. */
  private selfPlaying = false;

  /** Diagnostics for the UI: why nothing is showing, and the levels involved. */
  lastReason: BlockReason = null;
  lastClarity = 0;
  get noiseFloorDb() {
    return this.floorDb;
  }

  constructor(sensitivity: Sensitivity = "medium") {
    this.setSensitivity(sensitivity);
  }

  /**
   * While the app sounds a reference note, the mic hears it too. Echo
   * cancellation removes most of it, but whatever leaks through mixes with the
   * voice and autocorrelation then locks onto the *combined* period — a note
   * that is neither. Rather than report that, say nothing.
   */
  setSelfPlaying(playing: boolean) {
    this.selfPlaying = playing;
    if (playing) this.pending = null;
  }

  setSensitivity(sensitivity: Sensitivity) {
    this.profile = SENSITIVITY_PROFILES[sensitivity];
    this.floorDb = this.profile.absMinDb;
  }

  /** Level below which the caller can skip running the detector at all. */
  get silenceDb() {
    return this.profile.absMinDb;
  }

  reset() {
    this.held = null;
    this.pending = null;
    this.history = [];
    this.hasDetected = false;
  }

  /**
   * Candidates arrive ordered by lag, so the first one strong enough is the
   * shortest period that explains the signal — the standard MPM rule, and the
   * reason an octave-down subharmonic (always a strong NSDF peak) does not
   * win. Deliberately *not* biased toward the note already being held: when a
   * competing sound is present the mixture has a genuinely different period,
   * so preferring continuity would only make a wrong reading sticky.
   */
  private choose(candidates: RawPitch[]): RawPitch | null {
    if (candidates.length === 0) return null;
    let best = candidates[0];
    for (const c of candidates) if (c.clarity > best.clarity) best = c;
    return candidates.find((c) => c.clarity >= best.clarity * KEY_MAX_RATIO) ?? best;
  }

  /** @returns the smoothed frequency to display, or null for silence. */
  update(candidates: RawPitch[], dbfs: number, now: number): number | null {
    const raw = this.choose(candidates);
    const { absMinDb, peakMarginDb, onsetClarity } = this.profile;
    const dt = this.lastT ? (now - this.lastT) / 1000 : 0;
    this.lastT = now;
    this.lastClarity = raw?.clarity ?? 0;

    this.peakDb = Math.max(dbfs, this.peakDb - PEAK_DECAY_DB_PER_S * dt);
    const headroom = dbfs - this.floorDb;
    const loudEnough =
      dbfs > absMinDb &&
      headroom > FLOOR_MARGIN_DB &&
      dbfs > this.peakDb - peakMarginDb;
    // A new note has to be clearly periodic, but a loud one has already proved
    // it is not room noise, so it does not have to be pristine.
    const neededClarity =
      headroom >= LOUD_HEADROOM_DB ? LOUD_ONSET_CLARITY : onsetClarity;
    this.lastReason = loudEnough ? null : dbfs > absMinDb ? "quiet" : "silent";

    if (this.selfPlaying) {
      this.lastReason = "self-playing";
      this.pending = null;
      this.held = null;
      this.history = [];
      return null;
    }

    let accepted: number | null = null;
    if (raw && loudEnough) {
      const continuing =
        this.held !== null && Math.abs(centsBetween(raw.frequency, this.held)) < SAME_NOTE_CENTS;
      if (continuing && raw.clarity >= CONTINUE_CLARITY) {
        accepted = raw.frequency;
        this.pending = null;
      } else if (raw.clarity >= neededClarity) {
        this.lastReason = "confirming";
        if (
          this.pending &&
          Math.abs(centsBetween(raw.frequency, this.pending.freq)) < SAME_NOTE_CENTS
        ) {
          this.pending.count++;
        } else {
          this.pending = { freq: raw.frequency, count: 1 };
        }
        const needed =
          this.held !== null && isOctaveRelated(centsBetween(raw.frequency, this.held))
            ? CONFIRM_FRAMES_OCTAVE
            : CONFIRM_FRAMES;
        if (this.pending.count >= needed) {
          accepted = raw.frequency;
          this.pending = null;
          this.history = [];
        }
      } else {
        this.lastReason = "unclear";
        this.pending = null;
      }
    } else if (loudEnough) {
      this.lastReason = "unclear";
      this.pending = null;
    } else {
      this.pending = null;
    }

    if (accepted !== null) {
      this.lastReason = null;
      this.hasDetected = true;
      this.history.push(accepted);
      if (this.history.length > HISTORY) this.history.shift();
      const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
      this.held = avg;
      this.heldAt = now;
      return avg;
    }

    // Briefly hold the last pitch to bridge dropouts between frames.
    if (this.held !== null && now - this.heldAt < HOLD_MS) return this.held;
    this.held = null;
    this.history = [];
    // Learn the noise floor from frames that produced nothing. It drops
    // instantly but rises at a limited rate, so steady background (mains hum,
    // an air vent) gets absorbed over a few seconds while a brief unpitched
    // moment inside a note barely moves it.
    if (Number.isFinite(dbfs)) {
      const rise = this.hasDetected
        ? FLOOR_RISE_DB_PER_S
        : FLOOR_CALIBRATE_DB_PER_S;
      this.floorDb =
        dbfs < this.floorDb ? dbfs : Math.min(dbfs, this.floorDb + rise * dt);
      // Hard stop: the floor may never come within FLOOR_PEAK_HEADROOM_DB of
      // the loudest recent sound. Without this the floor can chase a held note
      // we briefly fail to pitch and the tuner goes deaf until the singer
      // stops; with it, headroom on a loud note always stays above
      // FLOOR_MARGIN_DB, while steady background still gets absorbed.
      this.floorDb = Math.min(this.floorDb, this.peakDb - FLOOR_PEAK_HEADROOM_DB);
    }
    return null;
  }
}
