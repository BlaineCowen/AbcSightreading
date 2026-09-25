const RAMP_S = 0.02;

/**
 * Single-voice note player with click-free start/stop ramps. Owns its own
 * AudioContext (created lazily on first play, which must be a user gesture)
 * so it works before the microphone engine has started.
 */
export class NotePlayer {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  get playing(): boolean {
    return this.osc !== null;
  }

  play(freq: number, volume = 0.25) {
    if (this.osc) {
      this.setFrequency(freq);
      return;
    }
    const ctx = (this.ctx ??= new AudioContext());
    if (ctx.state !== "running") void ctx.resume();
    const now = ctx.currentTime;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(volume, now + RAMP_S);
    this.gain.connect(ctx.destination);

    this.osc = ctx.createOscillator();
    this.osc.type = "triangle";
    this.osc.frequency.setValueAtTime(freq, now);
    this.osc.connect(this.gain);
    this.osc.start(now);
  }

  setFrequency(freq: number) {
    if (!this.ctx) return;
    this.osc?.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.01);
  }

  stop() {
    if (!this.osc || !this.gain || !this.ctx) return;
    const osc = this.osc;
    const gain = this.gain;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + RAMP_S);
    osc.stop(now + RAMP_S);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    this.osc = null;
    this.gain = null;
  }

  dispose() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
