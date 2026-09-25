class AudioAccumulator extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.hopSize = 128;
    this.buffer = new Float32Array(this.bufferSize);
    this.nAccumulated = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const inputChannel = input[0];

    // Copy new samples into ring buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.nAccumulated + i] = inputChannel[i];
    }

    this.nAccumulated += inputChannel.length;

    // When we have accumulated enough samples, send them for pitch detection
    if (this.nAccumulated >= this.bufferSize) {
      this.port.postMessage({
        type: "buffer",
        buffer: this.buffer,
      });

      // Reset accumulator
      this.nAccumulated = 0;
      this.buffer.fill(0);
    }

    return true;
  }
}

registerProcessor("audio-accumulator", AudioAccumulator);
