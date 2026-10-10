import { strToU8, zipSync } from "fflate";
import type { PieceScore } from "./model";
import type { PartSettings, PieceSummary } from "./rules";

/**
 * The page's side of a teacher's pieces: uploading (compressed first, so a
 * large score fits the server's request limit) and loading one back.
 */

/** A .musicxml or .xml file as a compressed .mxl; an .mxl as it is. */
export async function asMxl(file: File): Promise<{ bytes: Uint8Array; name: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { bytes, name: file.name };
  const inner = "score.musicxml";
  const zipped = zipSync({
    mimetype: [strToU8("application/vnd.recordare.musicxml"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="${inner}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`,
    ),
    [inner]: bytes,
  });
  return { bytes: zipped, name: file.name };
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // not JSON
  }
  return fallback;
}

export async function uploadPiece(file: File): Promise<PieceSummary> {
  const { bytes, name } = await asMxl(file);
  const res = await fetch("/api/pieces", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(name) },
    body: bytes,
  });
  if (!res.ok) throw new Error(await errorOf(res, "That file could not be added. Try again."));
  return res.json();
}

export async function listPieces(): Promise<PieceSummary[]> {
  const res = await fetch("/api/pieces");
  if (!res.ok) throw new Error(await errorOf(res, "Your music could not be loaded."));
  return res.json();
}

export async function loadPiece(id: string): Promise<{ piece: PieceSummary; parts: PartSettings; score: PieceScore }> {
  const [meta, music] = await Promise.all([fetch(`/api/pieces/${id}`), fetch(`/api/pieces/${id}/score`)]);
  if (!meta.ok) throw new Error(await errorOf(meta, "This piece could not be opened."));
  if (!music.ok) throw new Error(await errorOf(music, "This piece's music could not be loaded."));
  const { piece, parts } = await meta.json();
  return { piece, parts, score: await music.json() };
}

export async function updatePiece(id: string, change: { title?: string; parts?: PartSettings }): Promise<void> {
  const res = await fetch(`/api/pieces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!res.ok) throw new Error(await errorOf(res, "That change could not be saved."));
}

export async function deletePiece(id: string): Promise<void> {
  const res = await fetch(`/api/pieces/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorOf(res, "That piece could not be deleted."));
}

// ── Graded attempts (attempts.ts) ─────────────────────────────────────────

export type AttemptRow = import("./attempts").AttemptSummary & { studentId?: string; studentName?: string };

export async function listAttempts(assignmentId: string): Promise<{ role: "teacher" | "student"; max: number | null; attempts: AttemptRow[] }> {
  const res = await fetch(`/api/assignments/${assignmentId}/attempts`);
  if (!res.ok) throw new Error(await errorOf(res, "The attempts could not be loaded."));
  return res.json();
}

export async function startAttempt(assignmentId: string, partId: string): Promise<{ attempt: AttemptRow; used: number; max: number | null }> {
  const res = await fetch(`/api/assignments/${assignmentId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partId }),
  });
  if (!res.ok) throw new Error(await errorOf(res, "The attempt could not be started."));
  return res.json();
}

export async function finishAttempt(assignmentId: string, attemptId: string, result: object): Promise<AttemptRow> {
  const res = await fetch(`/api/assignments/${assignmentId}/attempts/${attemptId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!res.ok) throw new Error(await errorOf(res, "The score could not be sent."));
  return res.json();
}

/** The take, straight to the private Blob store (signed by /api/attempt-takes), then attached to the attempt. */
export async function sendTake(assignmentId: string, attemptId: string, audio: { blob: Blob; mime: string }): Promise<void> {
  const { takePath } = await import("./attempts");
  const path = takePath(assignmentId, attemptId, audio.mime);
  if (!path) throw new Error("This browser's recording cannot be kept.");
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(path, audio.blob, {
    access: "private",
    handleUploadUrl: "/api/attempt-takes",
    contentType: audio.mime.split(";")[0],
  });
  const res = await fetch(`/api/assignments/${assignmentId}/attempts/${attemptId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ take: blob.pathname }),
  });
  if (!res.ok) throw new Error(await errorOf(res, "The recording could not be sent."));
}

export async function loadAttempt(attemptId: string): Promise<AttemptRow & { assignmentId: string; marks: import("./attempts").Mark[] }> {
  const res = await fetch(`/api/attempts/${attemptId}`);
  if (!res.ok) throw new Error(await errorOf(res, "That attempt could not be opened."));
  return res.json();
}
