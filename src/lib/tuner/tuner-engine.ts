import type { DetectedPitch, EngineStatus, TunerFrame } from "./types";
import { A4_DEFAULT, clampA4, freqToNote } from "./pitch";
import { analyzeHarmonics, dbfs, rms } from "./harmonics";
import { detectCandidates } from "./autocorrelation";
import { PitchTracker, type Sensitivity } from "./pitch-tracker";

const FFT_SIZE = 8192;

/**
 * Owns the AudioContext, mic stream, accumulator worklet and analyser tap.
 * Emits one TunerFrame per 2048-sample buffer (~23 Hz at 48 kHz).
 */
export class TunerEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private spectrum: Float32Array<ArrayBuffer> | null = null;
  private sink: GainNode | null = null;
  private onFrameCallback: ((frame: TunerFrame) => void) | null = null;
  /** Frames actually delivered by the worklet — 0 means the graph never ran. */
  frameCount = 0;

  private a4 = A4_DEFAULT;
  private tracker = new PitchTracker();

  status: EngineStatus = "idle";

  get context(): AudioContext | null {
    return this.audioContext;
  }

  setA4(hz: number) {
    this.a4 = clampA4(hz);
  }

  setSensitivity(sensitivity: Sensitivity) {
    this.tracker.setSensitivity(sensitivity);
  }

  /** Tell the detector the app is sounding a note, so it can stay quiet. */
  setSelfPlaying(playing: boolean) {
    this.tracker.setSelfPlaying(playing);
  }

  onFrame(callback: (frame: TunerFrame) => void) {
    this.onFrameCallback = callback;
  }

  async start(): Promise<void> {
    if (this.status === "running" || this.status === "starting") return;
    this.status = "starting";
    this.frameCount = 0;
    try {
      // Ask for the mic first: iOS gives a silent input stream if the
      // AudioContext is created before permission is granted.
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Echo cancellation stays ON: the app plays reference notes and
          // metronome clicks through the speaker, and on a phone that bleeds
          // straight back into the mic. Autocorrelation locks onto the
          // combined period of voice + speaker and reports a note that is
          // neither. AGC is the one that caused trouble (it pumped the gaps
          // between notes up to singing level), so only that stays off.
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const ctx = new AudioContext();
      this.audioContext = ctx;
      await ctx.resume();
      await ctx.audioWorklet.addModule("/tuner-accumulator.js");

      const source = ctx.createMediaStreamSource(this.mediaStream);

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.6;
      this.spectrum = new Float32Array(this.analyser.frequencyBinCount);

      this.workletNode = new AudioWorkletNode(ctx, "audio-accumulator");
      this.workletNode.port.onmessage = this.handleMessage.bind(this);

      source.connect(this.analyser);
      source.connect(this.workletNode);
      // Safari/iOS only pulls a graph that reaches the destination, so an
      // AudioWorkletNode with a dangling output never runs — no frames at all.
      // Route it through a silent gain to keep the graph alive.
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;
      this.workletNode.connect(this.sink);
      this.sink.connect(ctx.destination);

      // Autoplay policy can leave it suspended even after the first resume.
      if (ctx.state !== "running") await ctx.resume();

      this.status = "running";
    } catch (error) {
      this.status = "error";
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.workletNode?.disconnect();
    this.analyser?.disconnect();
    this.sink?.disconnect();
    this.audioContext?.close().catch(() => {});
    this.mediaStream = null;
    this.workletNode = null;
    this.analyser = null;
    this.sink = null;
    this.audioContext = null;
    this.tracker.reset();
    if (this.status !== "error") this.status = "idle";
  }

  private handleMessage(event: MessageEvent) {
    if (!this.onFrameCallback || event.data.type !== "buffer") return;
    this.frameCount++;
    const buffer: Float32Array = event.data.buffer;
    const level = rms(buffer);
    const levelDb = dbfs(level);
    const now = performance.now();

    let pitch: DetectedPitch | null = null;
    let harmonics = null;

    // Skip the O(n·lags) detector on near-silence; the tracker still sees the level.
    const candidates =
      levelDb > this.tracker.silenceDb
        ? detectCandidates(buffer, this.audioContext!.sampleRate)
        : [];
    const frequency = this.tracker.update(candidates, levelDb, now);
    if (frequency !== null) {
      const { name, octave, cents } = freqToNote(frequency, this.a4);
      pitch = { frequency, name, octave, cents, clarity: this.tracker.lastClarity };
    }

    if (pitch && this.analyser && this.spectrum && this.audioContext) {
      this.analyser.getFloatFrequencyData(this.spectrum);
      harmonics = analyzeHarmonics(
        this.spectrum,
        this.audioContext.sampleRate,
        FFT_SIZE,
        pitch.frequency
      );
    }

    this.onFrameCallback({
      pitch,
      rms: level,
      dbfs: levelDb,
      harmonics,
      detection: {
        reason: this.tracker.lastReason,
        clarity: this.tracker.lastClarity,
        noiseFloorDb: this.tracker.noiseFloorDb,
      },
    });
  }
}
