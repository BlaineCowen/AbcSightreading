import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/db";
import { PieceError, deletePiece, pieceFor, pieceForReader, summaryOf } from "../../../../lib/server/pieces";
import { PIECE_KEY, checkPieceUpdate, pieceSettingsOf, storedPartIds, storedParts } from "../../../../lib/pieces/rules";

/**
 * One of my pieces.
 *
 * GET               -> { piece: PieceSummary, parts: PartSettings, settings: PieceSettings }
 * PATCH { title?, parts?, settings? } -> the same, as it now is
 *
 * The piece's own settings (key, practice mixes) are kept in `parts` under
 * PIECE_KEY (rules.ts) and answered apart from the parts.
 * DELETE            -> { ok: true }
 *
 * Matched on id and owner: someone else's piece answers exactly like one
 * that does not exist.
 */

const missing = () => json({ error: "No such piece." }, 404);

export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  // Its owner, or a student it is assigned to.
  const piece = await pieceForReader(user.id, params.id!);
  if (!piece) return missing();
  return json({ piece: summaryOf(piece), parts: storedParts(piece.parts), settings: pieceSettingsOf(piece.parts) });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const piece = await pieceFor(user.id, params.id!);
  if (!piece) return missing();
  const change = checkPieceUpdate(await readJson(request), storedPartIds(piece.parts));
  if (!change.ok) return json({ error: change.error }, 400);
  const { title, parts, settings } = change.value;
  const stored =
    parts || settings
      ? { ...(parts ?? storedParts(piece.parts)), [PIECE_KEY]: settings ?? pieceSettingsOf(piece.parts) }
      : undefined;
  const updated = await prisma.piece.update({ where: { id: piece.id }, data: { title, parts: stored } });
  return json({ piece: summaryOf(updated), parts: storedParts(updated.parts), settings: pieceSettingsOf(updated.parts) });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  try {
    return (await deletePiece(user.id, params.id!)) ? json({ ok: true }) : missing();
  } catch (e) {
    if (e instanceof PieceError) return json({ error: e.message }, e.status);
    throw e;
  }
};
