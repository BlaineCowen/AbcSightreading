import type { APIRoute } from "astro";
import { currentUser, json, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { isAdmin } from "../../../lib/server/admin";
import { checkNewAccessCode } from "../../../lib/codes";

/** Access codes, for the owner. GET -> list, with who redeemed each; POST { code, plan, days, maxUses?, expiresAt?, note? } -> made. */
export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  const codes = await prisma.accessCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      grants: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, expiresAt: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  // Who used each code and when, so the owner can keep track of their testers.
  return json(
    codes.map(({ grants, ...c }) => ({
      ...c,
      expiresAt: c.expiresAt?.getTime() ?? null,
      createdAt: c.createdAt.getTime(),
      redeemed: grants.map((g) => ({
        name: g.user.name,
        email: g.user.email,
        at: g.createdAt.getTime(),
        until: g.expiresAt.getTime(),
      })),
    }))
  );
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(await currentUser(request))) return json({ error: "Not found." }, 404);
  const checked = checkNewAccessCode(await readJson(request));
  if (!checked.ok) return json({ error: checked.error }, 400);
  if (await prisma.accessCode.findUnique({ where: { code: checked.value.code } })) return json({ error: "That code is taken." }, 409);
  const c = await prisma.accessCode.create({ data: checked.value });
  return json({ id: c.id, code: c.code }, 201);
};
