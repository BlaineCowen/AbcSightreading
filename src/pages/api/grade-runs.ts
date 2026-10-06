import type { APIRoute } from "astro";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser, json } from "../../lib/server/api";
import { serverEnv } from "../../lib/server/env";
import { hasPremium } from "../../lib/server/plan";
import { accountTypeFor } from "../../lib/server/students";

/**
 * "Send this run" (Grade): the browser uploads a run - its results and a
 * recording of the microphone over it - straight into the private
 * `grade-runs` Blob store, so a run someone thinks was graded wrongly can be
 * replayed and the grading tuned. Nothing is recorded on the server unless
 * they press Send. This route only signs the uploads: a signed-in account
 * with Grade (Pro or better), never a student account (they may be under
 * 13; their pages carry no feedback form either), JSON or audio, under
 * grade-runs/, no bigger than MAX_BYTES.
 */
const MAX_BYTES = 60 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  const token = serverEnv("BLOB_READ_WRITE_TOKEN");
  if (!token) return json({ error: "Runs cannot be sent from here." }, 503);
  const body = (await request.json()) as HandleUploadBody;
  // The upload-completed callback comes from Vercel, not a browser: no session there.
  if (body.type === "blob.generate-client-token") {
    const user = await currentUser(request);
    if (!user) return json({ error: "Sign in first." }, 401);
    if ((await accountTypeFor(user)) === "student") return json({ error: "Not for student accounts." }, 403);
    if (!(await hasPremium(user))) return json({ error: "Grade is part of Pro." }, 403);
  }
  try {
    const result = await handleUpload({
      token,
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^grade-runs\/[\w.-]+\/[\w.-]+$/.test(pathname)) throw new Error("Bad path.");
        return {
          allowedContentTypes: ["application/json", "audio/webm", "audio/mp4", "audio/ogg", "video/webm"],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false,
        };
      },
    });
    return json(result);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
};
