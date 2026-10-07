import { downloadFile } from "./download";

/**
 * A Grade run, saved for review: the microphone recorded over the run, and
 * everything the grading used (the exercise, its tempo and settings, the pitch
 * track with its times, every note's result), so a run someone thinks deserved
 * more can be replayed offline against what they really sang.
 *
 * The recording is a second stream on the same microphone, so the detection
 * code - kept identical to the standalone tuner's - is not touched. It asks
 * for no echo cancellation, where the tuner's stream keeps it: the canceller
 * turns the microphone down whenever the speakers sound, so with Grade's click
 * on every beat (its default) the take came back dipping on each beat, and
 * "Hear your take" played a voice cutting out with no click to explain it
 * (Blaine, 7 October 2026). Without it the take is the room as sung, click
 * and all; Chrome opens the two streams side by side, each with its own
 * settings. Noise suppression and automatic gain stay off. Its first moment is stamped on
 * the page's clock (performance.now), the clock the pitch track and the
 * exercise's timeline use.
 */

export type GradeRecording = { stop: () => Promise<{ blob: Blob; startedAt: number; mime: string } | null> };

export async function startGradeRecording(): Promise<GradeRecording | null> {
  if (typeof MediaRecorder === "undefined") return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    let startedAt = 0;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const started = new Promise<void>((resolve) => (rec.onstart = () => ((startedAt = performance.now()), resolve())));
    rec.start(250);
    await started;
    return {
      stop: () =>
        new Promise((resolve) => {
          if (rec.state === "inactive") return resolve(null);
          rec.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime }), startedAt, mime: rec.mimeType || mime });
          };
          rec.stop();
        }),
    };
  } catch {
    return null;
  }
}

type RunAudio = { blob: Blob; startedAt: number; mime: string } | null;

/** A run's two files, named for the moment: grade-<date>.json and grade-<date>.webm (or .m4a). */
function runFiles(run: Record<string, unknown>, audio: RunAudio) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ext = audio?.mime.includes("mp4") ? "m4a" : "webm";
  const json = JSON.stringify({ ...run, audio: audio ? { file: `grade-${stamp}.${ext}`, startedAt: audio.startedAt, mime: audio.mime } : null }, null, 1);
  return { stamp, ext, json };
}

/** Download both files. */
export function saveGradeRun(run: Record<string, unknown>, audio: RunAudio) {
  const { stamp, ext, json } = runFiles(run, audio);
  downloadFile(json, `grade-${stamp}.json`, "application/json");
  if (audio) setTimeout(() => downloadFile(audio.blob, `grade-${stamp}.${ext}`, audio.mime), 400);
}

/**
 * Send both files to the private grade-runs store (/api/grade-runs) as
 * grade-runs/<date>-<note>/run.json and its recording. `note` is what the
 * singer says about it.
 */
export async function sendGradeRun(run: Record<string, unknown>, audio: RunAudio, note: string): Promise<string> {
  const { upload } = await import("@vercel/blob/client");
  const { stamp, ext, json } = runFiles({ ...run, note }, audio);
  const slug = note.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const dir = `grade-runs/${stamp}${slug ? `-${slug}` : ""}`;
  const opts = { access: "private" as const, handleUploadUrl: "/api/grade-runs" };
  await upload(`${dir}/run.json`, new Blob([json], { type: "application/json" }), { ...opts, contentType: "application/json" });
  if (audio) await upload(`${dir}/recording.${ext}`, audio.blob, { ...opts, contentType: audio.mime.split(";")[0], multipart: audio.blob.size > 8e6 });
  return dir;
}
