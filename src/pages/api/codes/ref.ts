import type { APIRoute } from "astro";
import { json } from "../../../lib/server/api";
import { referralFor } from "../../../lib/server/codes";

/** GET -> { code, percentOff } | null: the advertiser discount this visitor's checkout will carry. */
export const GET: APIRoute = async ({ request }) => {
  const r = await referralFor(request.headers.get("cookie"));
  return json(r ? { code: r.code, percentOff: r.percentOff } : null);
};
