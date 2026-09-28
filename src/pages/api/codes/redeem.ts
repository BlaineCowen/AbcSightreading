import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { CodeError, redeemAccessCode } from "../../../lib/server/codes";

/** POST { code } -> { plan, expiresAt }: an access code's plan on this account. */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  try {
    return json(await redeemAccessCode(user.id, ((await readJson(request)) as { code?: unknown } | undefined)?.code));
  } catch (e) {
    if (e instanceof CodeError) return json({ error: e.message }, e.status);
    throw e;
  }
};
