/**
 * Records the play-along canvas and its sound into a video file, in real
 * time: a 1:30 video takes 1:30 to make. MP4 where the browser can write it
 * (Safari, recent Chrome), WebM otherwise.
 */
const TYPES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function videoType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export const extensionFor = (type: string) => (type.startsWith("video/mp4") ? "mp4" : "webm");

export interface Recording {
  /** Ends the recording; resolves with the file. */
  stop(): Promise<Blob>;
  type: string;
}

export function startRecording(canvas: HTMLCanvasElement, audio: MediaStream, fps = 30): Recording {
  const type = videoType();
  if (!type) throw new Error("This browser cannot record video. Try Chrome or Safari.");
  const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...audio.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, {
    mimeType: type,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);
  return {
    type,
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getVideoTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: type.split(";")[0] }));
        };
        recorder.stop();
      }),
  };
}

/** e.g. `play-along-4-4-100bpm-2026-10-02.mp4`. */
export function videoFileName(meter: string, bpm: number, type: string, date = new Date()): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  return `play-along-${meter.replace("/", "-")}-${bpm}bpm-${day}.${extensionFor(type)}`;
}
