import type { APIRoute } from "astro";
import { currentUser, json } from "../../../../lib/server/api";
import { roleIn } from "../../../../lib/server/practice";
import { classPortfolio } from "../../../../lib/server/attempts";

/** GET -> { checkpoints, students, tries }: the class's sight-reading portfolio (portfolio.ts). Its teacher only. */
export const GET: APIRoute = async ({ request, params }) => {
  const user = await currentUser(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if ((await roleIn(user.id, params.id!)) !== "teacher") return json({ error: "No such class." }, 404);
  return json(await classPortfolio(params.id!));
};
