import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { PieceError, pieceForReader, scoreBytes } from "../../../../lib/server/pieces";

/**
 * The piece's music: the stored model, sent gzipped as it is kept, which the
 * browser unpacks itself (Content-Encoding). Private: no shared caching.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const piece = await pieceForReader(user.id, params.id!);
  if (!piece) return json({ error: "No such piece." }, 404);
  try {
    const bytes = await scoreBytes(piece.scorePath);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Cache-Control": "private, max-age=0, must-revalidate",
        ETag: `"${piece.id}-${piece.updatedAt.getTime()}"`,
      },
    });
  } catch (e) {
    if (e instanceof PieceError) return json({ error: e.message }, e.status);
    throw e;
  }
};
