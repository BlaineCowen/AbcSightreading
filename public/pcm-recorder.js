// Records the microphone as it is, for the Ensemble tab (src/lib/ensemble-tuning/recorder.ts):
// the first channel's samples at the context's own rate, posted in batches of
// about 4096, each with its peak for the level meter. Nothing is dropped or
// overlapped, so the batches joined are the take.
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(4096);
    this.filled = 0;
    this.peak = 0;
    // "flush": the part batch too, as the take ends.
    this.port.onmessage = () => {
      this.port.postMessage({ samples: this.batch.slice(0, this.filled), peak: this.peak, last: true });
      this.filled = 0;
    };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      this.batch[this.filled++] = v;
      const a = v < 0 ? -v : v;
      if (a > this.peak) this.peak = a;
      if (this.filled === this.batch.length) {
        this.port.postMessage({ samples: this.batch, peak: this.peak }, [this.batch.buffer]);
        this.batch = new Float32Array(4096);
        this.filled = 0;
        this.peak = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
