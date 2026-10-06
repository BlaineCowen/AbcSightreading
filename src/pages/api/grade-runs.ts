import type { APIRoute } from "astro";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser, json } from "../../lib/server/api";
import { serverEnv } from "../../lib/server/env";

/**
 * "Send this run" (Grade, on previews): the browser uploads a saved run - its
 * JSON and the room's recording - straight into the private `grade-runs` Blob
 * store, so it can be replayed offline without anyone moving files about.
 * This route only signs the uploads: signed in, never on production (the
 * store is connected to Preview and Development only), JSON or audio, under
 * grade-runs/, and no bigger than MAX_BYTES.
 */
const MAX_BYTES = 60 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  if (serverEnv("VERCEL_ENV") === "production") return json({ error: "Not here." }, 404);
  const token = serverEnv("BLOB_READ_WRITE_TOKEN");
  if (!token) return json({ error: "No store for runs on this deployment." }, 503);
  const body = (await request.json()) as HandleUploadBody;
  // The upload-completed callback comes from Vercel, not a browser: no session there.
  const user = body.type === "blob.generate-client-token" ? await currentUser(request) : null;
  if (body.type === "blob.generate-client-token" && !user) return json({ error: "Sign in first." }, 401);
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
          tokenPayload: JSON.stringify({ user: user?.email ?? null }),
        };
      },
    });
    return json(result);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
};
