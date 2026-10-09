import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { hasPremium } from "../../../lib/server/plan";
import { accountTypeFor } from "../../../lib/server/students";
import { PieceError, createPiece, listPieces } from "../../../lib/server/pieces";
import { MAX_UPLOAD_BYTES } from "../../../lib/pieces/rules";

/**
 * A teacher's own music (src/lib/pieces/).
 *
 * GET                                  -> PieceSummary[], newest first
 * POST <the .mxl bytes>, x-file-name   -> the new PieceSummary
 *
 * The page sends the file compressed (it zips a plain .musicxml first), so
 * the body stays under the function's 4.5 MB limit. Pro, never a student.
 */

async function allowed(request: Request) {
  const user = await currentUser(request);
  if (!user) return { error: json({ error: "Sign in first." }, 401) };
  if ((await accountTypeFor(user)) === "student") return { error: json({ error: "Not for student accounts." }, 403) };
  if (!(await hasPremium(user))) return { error: json({ error: "Your own music is part of Pro." }, 403) };
  return { user };
}

export const GET: APIRoute = async ({ request }) => {
  const a = await allowed(request);
  if (a.error) return a.error;
  return json(await listPieces(a.user.id));
};

export const POST: APIRoute = async ({ request }) => {
  const a = await allowed(request);
  if (a.error) return a.error;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES) return json({ error: "That file is too large. Pieces can be up to 4 MB once compressed." }, 413);
  let name = "Untitled.mxl";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? name);
  } catch {
    // keep the default
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  try {
    return json(await createPiece(a.user.id, bytes, name), 201);
  } catch (e) {
    if (e instanceof PieceError) return json({ error: e.message }, e.status);
    throw e;
  }
};
