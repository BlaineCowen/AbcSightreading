import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { attemptFor, takeStream } from "../../../../lib/server/attempts";

/** An attempt's take, played back: the student's own, or one in the teacher's class. Never cached. */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const at = await attemptFor(user.id, params.id!);
  if (!at?.recordingPath) return json({ error: "No take for this attempt." }, 404);
  const got = await takeStream(at.recordingPath);
  if (!got) return json({ error: "The take is no longer kept." }, 404);
  return new Response(got.stream, {
    headers: { "Content-Type": got.blob.contentType ?? "audio/webm", "Cache-Control": "private, no-store" },
  });
};
