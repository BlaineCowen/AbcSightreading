import type { APIRoute } from "astro";
import { auth } from "../../../lib/server/auth";

/** Every Better Auth endpoint: sign-up, sign-in, reset, Google callback... */
export const ALL: APIRoute = ({ request }) => auth.handler(request);
