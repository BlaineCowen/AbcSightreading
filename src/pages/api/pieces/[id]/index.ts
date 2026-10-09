import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { deletePiece, pieceFor, summaryOf } from "../../../../lib/server/pieces";
import { checkPieceUpdate } from "../../../../lib/pieces/rules";

/**
 * One of my pieces.
 *
 * GET               -> { piece: PieceSummary, parts: PartSettings }
 * PATCH { title?, parts? } -> the same, as it now is
 * DELETE            -> { ok: true }
 *
 * Matched on id and owner: someone else's piece answers exactly like one
 * that does not exist.
 */

const missing = () => json({ error: "No such piece." }, 404);

export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const piece = await pieceFor(user.id, params.id!);
  if (!piece) return missing();
  return json({ piece: summaryOf(piece), parts: piece.parts });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const piece = await pieceFor(user.id, params.id!);
  if (!piece) return missing();
  const change = checkPieceUpdate(await readJson(request), Object.keys((piece.parts ?? {}) as object));
  if (!change.ok) return json({ error: change.error }, 400);
  const updated = await prisma.piece.update({
    where: { id: piece.id },
    data: { title: change.value.title, parts: change.value.parts },
  });
  return json({ piece: summaryOf(updated), parts: updated.parts });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return (await deletePiece(user.id, params.id!)) ? json({ ok: true }) : missing();
};
