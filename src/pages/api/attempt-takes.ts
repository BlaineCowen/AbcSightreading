import type { APIRoute } from "astro";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser, json } from "../../lib/server/api";
import { serverEnv } from "../../lib/server/env";
import { mayUploadTake } from "../../lib/server/attempts";

/**
 * Signs the upload of a graded attempt's take (the microphone over the run)
 * straight from the browser into the private Blob store, under
 * attempts/<assignment>/<attempt>. Only the student whose attempt it is, for
 * an attempt started in the last two hours with no take yet. The student was
 * told before starting that their teacher hears it and it is kept 90 days.
 */
const MAX_BYTES = 40 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  const token = serverEnv("BLOB_READ_WRITE_TOKEN");
  if (!token) return json({ error: "Takes cannot be kept from here." }, 503);
  const body = (await request.json()) as HandleUploadBody;
  let userId: string | null = null;
  if (body.type === "blob.generate-client-token") {
    const user = await currentUser(request);
    if (!user) return json({ error: "Sign in first." }, 401);
    userId = user.id;
  }
  try {
    const result = await handleUpload({
      token,
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!userId || !(await mayUploadTake(userId, pathname))) throw new Error("Not this attempt.");
        return {
          allowedContentTypes: ["audio/webm", "audio/mp4", "audio/ogg", "video/webm"],
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
