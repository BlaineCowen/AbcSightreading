// Clap grading (src/lib/clap-detect.ts): for every 128-sample block, the power
// above about 1.5 kHz (a one-pole high-pass) and over the whole band, with the
// block's first frame on the audio clock, posted a few blocks at a time; and
// the sound itself, averaged down to about 16 kHz, so a detected sound can be
// told from a chanted syllable afterwards (a vowel has a pitch, a clap none).
class ClapDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    const rc = 1 / (2 * Math.PI * 1500);
    this.a = rc / (rc + 1 / sampleRate);
    this.x1 = 0;
    this.y1 = 0;
    this.batch = 8;
    this.frames = new Float64Array(this.batch);
    this.hi = new Float32Array(this.batch);
    this.full = new Float32Array(this.batch);
    this.n = 0;
    this.down = Math.max(1, Math.round(sampleRate / 16000));
    this.pcm = new Float32Array(Math.ceil((this.batch * 128) / this.down) + 4);
    this.pcmN = 0;
    this.acc = 0;
    this.accN = 0;
    this.pcmFrame0 = -1;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const x = input[0];
    let hi = 0;
    let full = 0;
    for (let i = 0; i < x.length; i++) {
      const y = this.a * (this.y1 + x[i] - this.x1);
      this.x1 = x[i];
      this.y1 = y;
      hi += y * y;
      full += x[i] * x[i];
      if (this.pcmFrame0 < 0) this.pcmFrame0 = currentFrame + i;
      this.acc += x[i];
      if (++this.accN === this.down) {
        this.pcm[this.pcmN++] = this.acc / this.down;
        this.acc = 0;
        this.accN = 0;
      }
    }
    this.frames[this.n] = currentFrame;
    this.hi[this.n] = hi / x.length;
    this.full[this.n] = full / x.length;
    if (++this.n === this.batch) {
      this.port.postMessage({
        frames: this.frames.slice(), hi: this.hi.slice(), full: this.full.slice(), sampleRate,
        pcm: this.pcm.slice(0, this.pcmN), pcmFrame0: this.pcmFrame0, pcmRate: sampleRate / this.down,
      });
      this.n = 0;
      this.pcmN = 0;
      // The next sample's frame, exactly: the averaging carries over between batches.
      this.pcmFrame0 = currentFrame + x.length - this.accN;
    }
    return true;
  }
}
registerProcessor("clap-detector", ClapDetector);
