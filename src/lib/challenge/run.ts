import {
  ATTEMPT_MS,
  CONFIRM_MS,
  CREDIT_MS,
  HOLD_GRACE_MS,
  SETTLE_MS,
  STRICTNESS,
  centsOffAnyOctave,
  noteScore,
  type Outcome,
} from "../grade";

/**
 * One go at a challenge, judged as Grade's Note by note judges (grade-runner
 * `tick`): each note waits until it is sung and held in tune (any octave)
 * for CREDIT_MS, with HOLD_GRACE_MS for a consonant or a vibrato swing; the
 * first pitch held ATTEMPT_MS decides "right first time"; singing in the
 * first SETTLE_MS is the last note dying away. Scored by `noteScore`, so a
 * challenge and Grade agree. Time is passed in, so tests can drive it.
 *
 * Easy's tolerance by default: this is for anyone, on a phone.
 */

export type ChallengeResult = { midi: number; outcome: Outcome; cents: number | null; score: number };

export type ChallengeView = {
  index: number;
  /** 0..1 of the current note's hold. */
  hold: number;
  /** Cents from the note in any octave, null when nothing is heard. */
  cents: number | null;
  credited: boolean;
  /** The current note's, once credited. */
  outcome: Outcome | null;
  done: boolean;
  results: ChallengeResult[];
  total: number;
  firsts: number;
};

export class ChallengeRun {
  private index = 0;
  private presentedAt: number;
  private lastTick: number;
  private holdMs = 0;
  private offSince: number | null = null;
  private creditedAt = 0;
  private steady: { midi: number; since: number } | null = null;
  private firstTry: { right: boolean } | null = null;
  private heardNote = false;
  private helpUntil = 0;
  private held: number[] = [];
  private results: ChallengeResult[] = [];
  private outcome: Outcome | null = null;
  private finished = false;

  constructor(
    private notes: number[],
    now: number,
    private tolerance = STRICTNESS.easy.cents,
    private freeCents = STRICTNESS.easy.freeCents,
  ) {
    this.presentedAt = this.lastTick = now;
  }

  get current(): number | null {
    return this.finished ? null : this.notes[this.index];
  }

  /** The note was played to the singer: it can score no more than help allows, and nothing is heard while it sounds. */
  help(now: number, ms: number) {
    this.heardNote = true;
    this.helpUntil = now + ms;
  }

  skip(now: number) {
    if (this.finished || this.creditedAt) return;
    this.record("skipped", null);
    this.next(now);
  }

  /** `sung`: the pitch heard now as a MIDI number with cents, or null. */
  tick(now: number, sung: number | null): ChallengeView {
    const dt = Math.min(now - this.lastTick, 200);
    this.lastTick = now;
    if (this.finished) return this.view(null);
    if (this.creditedAt) {
      if (now - this.creditedAt >= CONFIRM_MS) this.next(now);
      return this.view(null);
    }
    if (now < this.helpUntil) {
      this.steady = null;
      return this.view(null);
    }
    const target = this.notes[this.index];
    const heard = sung !== null && now - this.presentedAt >= SETTLE_MS ? sung : null;
    const cents = heard !== null ? centsOffAnyOctave(heard, target) : null;
    const onTarget = cents !== null && Math.abs(cents) <= this.tolerance;

    if (heard === null) this.steady = null;
    else if (!this.steady || Math.abs(heard - this.steady.midi) > 0.5) this.steady = { midi: heard, since: now };
    else if (!this.firstTry && now - this.steady.since >= ATTEMPT_MS) {
      this.firstTry = { right: Math.abs(centsOffAnyOctave(this.steady.midi, target)) <= this.tolerance };
    }

    if (onTarget) {
      this.holdMs += dt;
      this.held.push(cents!);
      this.offSince = null;
    } else if (this.holdMs > 0) {
      this.offSince ??= now;
      if (now - this.offSince > HOLD_GRACE_MS) {
        this.holdMs = 0;
        this.held = [];
        this.offSince = null;
      }
    }
    if (this.holdMs >= CREDIT_MS) {
      const sorted = [...this.held].sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1] ?? cents;
      const outcome: Outcome = this.heardNote ? "helped" : this.firstTry && !this.firstTry.right ? "corrected" : "first";
      this.record(outcome, median);
      this.outcome = outcome;
      this.creditedAt = now;
      return this.view(cents);
    }
    return this.view(cents);
  }

  private record(outcome: Outcome, cents: number | null) {
    const midi = this.notes[this.index];
    const help = { heardNote: this.heardNote, heardKey: false };
    this.results.push({ midi, outcome, cents, score: noteScore({ outcome, cents, help }, this.freeCents) });
  }

  private next(now: number) {
    if (this.index + 1 >= this.notes.length) {
      this.finished = true;
      return;
    }
    this.index++;
    this.presentedAt = now;
    this.holdMs = 0;
    this.held = [];
    this.offSince = null;
    this.creditedAt = 0;
    this.steady = null;
    this.firstTry = null;
    this.heardNote = false;
    this.helpUntil = 0;
    this.outcome = null;
  }

  private view(cents: number | null): ChallengeView {
    return {
      index: this.index,
      hold: this.creditedAt ? 1 : Math.min(1, this.holdMs / CREDIT_MS),
      cents,
      credited: !!this.creditedAt,
      outcome: this.creditedAt ? this.outcome : null,
      done: this.finished,
      results: this.results,
      total: this.results.reduce((a, r) => a + r.score, 0),
      firsts: this.results.filter((r) => r.outcome === "first").length,
    };
  }
}
