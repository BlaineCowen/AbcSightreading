// Clap grading (src/lib/clap-detect.ts): for every 128-sample block, the power
// above about 1.5 kHz (a one-pole high-pass) and over the whole band, with the
// block's first frame on the audio clock, posted a few blocks at a time.
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
    }
    this.frames[this.n] = currentFrame;
    this.hi[this.n] = hi / x.length;
    this.full[this.n] = full / x.length;
    if (++this.n === this.batch) {
      this.port.postMessage({ frames: this.frames.slice(), hi: this.hi.slice(), full: this.full.slice(), sampleRate });
      this.n = 0;
    }
    return true;
  }
}
registerProcessor("clap-detector", ClapDetector);
