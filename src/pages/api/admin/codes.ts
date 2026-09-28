import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { isAdmin } from "../../../lib/server/admin";
import { checkNewAccessCode } from "../../../lib/codes";

/** Access codes, for the owner. GET -> list; POST { code, plan, days, maxUses?, expiresAt?, note? } -> made. */
export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  const codes = await prisma.accessCode.findMany({ orderBy: { createdAt: "desc" } });
  return json(codes.map((c) => ({ ...c, expiresAt: c.expiresAt?.getTime() ?? null, createdAt: c.createdAt.getTime() })));
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  const checked = checkNewAccessCode(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  if (await prisma.accessCode.findUnique({ where: { code: checked.value.code } })) return json({ error: "That code is taken." }, 409);
  const c = await prisma.accessCode.create({ data: checked.value });
  return json({ id: c.id, code: c.code }, 201);
};
