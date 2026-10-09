/**
 * A piano for the keys a player presses and for hearing a take back: the
 * same grand piano samples abcjs plays the exercise on (FluidR3, through the
 * page's /api/soundfont proxy), one per key, with a key-up that lets the
 * note go (a short release, as a damper falls) rather than cutting it.
 *
 * It plays on the AudioContext it is given, so the take, its click and the
 * live keys share one clock. Everything it starts is tracked, so `stopAll`
 * silences it at once (Stop has to stop the sound, not just the run).
 */
const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
/** The soundfont's range: A0 to C8. */
const LOW = 21;
const HIGH = 108;
const RELEASE_S = 0.25;

export class PianoVoice {
  private buffers = new Map<number, AudioBuffer>();
  private loading = new Map<number, Promise<AudioBuffer | null>>();
  private sounding = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }[]>();
  private all = new Set<AudioBufferSourceNode>();
  readonly out: GainNode;

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
  }

  private load(midi: number): Promise<AudioBuffer | null> {
    if (midi < LOW || midi > HIGH) return Promise.resolve(null);
    const known = this.loading.get(midi);
    if (known) return known;
    const name = `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
    const p = fetch(`/api/soundfont/acoustic_grand_piano-mp3/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then((buf) => (this.buffers.set(midi, buf), buf))
      .catch(() => null);
    this.loading.set(midi, p);
    return p;
  }

  /** Fetch these keys' samples now, so the first press of each sounds at once. */
  async preload(midis: number[]): Promise<void> {
    await Promise.all([...new Set(midis)].map((m) => this.load(m)));
  }

  /** A key down, now or at `when` (the context's clock). A key not loaded yet is fetched and sounds from then. */
  noteOn(midi: number, velocity = 80, when = 0) {
    const buf = this.buffers.get(midi);
    if (!buf) {
      void this.load(midi).then((b) => b && when === 0 && this.noteOn(midi, velocity));
      return;
    }
    const at = Math.max(when, this.ctx.currentTime);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    // Velocity as loudness, gently: a light touch is quieter, never silent.
    gain.gain.setValueAtTime(0.25 + 0.75 * (velocity / 127) ** 1.5, at);
    src.connect(gain).connect(this.out);
    src.start(at);
    this.all.add(src);
    src.onended = () => this.all.delete(src);
    const list = this.sounding.get(midi) ?? [];
    list.push({ src, gain });
    this.sounding.set(midi, list);
  }

  /** A key up: the note lets go over a short release. */
  noteOff(midi: number, when = 0) {
    const list = this.sounding.get(midi);
    if (!list?.length) return;
    const { src, gain } = list.shift()!;
    const at = Math.max(when, this.ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, at);
    gain.gain.linearRampToValueAtTime(0, at + RELEASE_S);
    src.stop(at + RELEASE_S + 0.02);
  }

  /** Silence everything sounding or scheduled, now. */
  stopAll() {
    for (const src of this.all) {
      try { src.stop(); } catch {}
    }
    this.all.clear();
    this.sounding.clear();
  }

  set muted(m: boolean) {
    this.out.gain.setValueAtTime(m ? 0 : 1, this.ctx.currentTime);
  }
}
