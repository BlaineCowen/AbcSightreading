import { prisma } from "./db";
import { founderEndsAt } from "../founders";

/**
 * A teacher who comes in through their district's ClassLink gets Pro free
 * this school year (Blaine, 16 October 2026), the same end as the founding
 * teachers' Educator (src/lib/founders.ts), so the home page can offer them
 * Educator as a founder. An AccessGrant under the access code
 * CLASSLINK_CODE, which has no uses (maxUses 0), so typing it gives nothing.
 * Once per account: the unique (userId, codeId) keeps a second one out.
 */
export const CLASSLINK_CODE = "CLASSLINKTEACHERS";

export async function grantClasslinkPro(userId: string) {
  const code = await prisma.accessCode.upsert({
    where: { code: CLASSLINK_CODE },
    update: {},
    create: {
      code: CLASSLINK_CODE,
      plan: "pro",
      days: 0,
      maxUses: 0,
      note: "Teachers signing in through ClassLink: Pro free through 31 May 2027. Given at sign-in, never typed.",
    },
  });
  await prisma.accessGrant
    .create({ data: { userId, codeId: code.id, plan: "pro", expiresAt: founderEndsAt() } })
    .catch((e: { code?: string }) => {
      if (e.code !== "P2002") throw e;
    });
}

/** Whether this account signs in through ClassLink. */
export const viaClasslink = async (userId: string) =>
  !!(await prisma.account.findFirst({ where: { userId, providerId: "classlink" }, select: { id: true } }));
