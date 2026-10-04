/**
 * The parts of soundtouchjs (LGPL-2.1, no types of its own) the play-along
 * tempo control uses: an offline tempo stretch with the pitch kept
 * (src/lib/play-along/stretch.ts).
 */
declare module "soundtouchjs" {
  export class SoundTouch {
    /** 1 is unchanged; 1.1 is ten percent faster, pitch kept. */
    tempo: number;
    /** The WSOLA stage: its slice, seek window and overlap lengths, in ms (0 keeps the automatic one). */
    stretch: { setParameters(sampleRate: number, sequenceMs: number, seekWindowMs: number, overlapMs: number): void };
  }
  /** Something the filter can read stereo frames from, interleaved. */
  export interface FrameSource {
    extract(target: Float32Array, numFrames?: number, position?: number): number;
  }
  export class SimpleFilter {
    constructor(source: FrameSource, pipe: SoundTouch, callback?: () => void);
    /** Fills `target` with up to `numFrames` interleaved stereo frames; returns how many. */
    extract(target: Float32Array, numFrames?: number): number;
  }
}
