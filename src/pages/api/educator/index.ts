import type { APIRoute } from "astro";
import { currentUser, json } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import { accountTypeFor, seatInfo, shortUsername } from "../../../lib/server/students";
import { becomeEducator } from "../../../lib/server/educator";
import { hasEducatorPlan } from "../../../lib/server/plan";
import { formatJoinCode } from "../../../lib/join-code";

/**
 * The educator plan.
 *
 * GET  -> { seats, classes: [{ id, name, joinCode, students: [...] }] }
 * POST -> finish becoming an educator once the Educator plan is paid for (the
 *         webhook does this too; this covers arriving back from checkout
 *         before the webhook has), and every class gets a join code.
 */

const notSignedIn = () => json({ error: "Sign in first." }, 401);

export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  if ((await accountTypeFor(user)) !== "educator") return json({ error: "Not an educator account." }, 403);
  const classes = await prisma.class.findMany({
    where: { userId: user.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      joinCode: true,
      enrollments: {
        orderBy: { createdAt: "asc" },
        select: { managed: true, createdAt: true, student: { select: { id: true, name: true, username: true } } },
      },
    },
  });
  return json({
    seats: await seatInfo(user.id),
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      joinCode: c.joinCode ? formatJoinCode(c.joinCode) : null,
      students: c.enrollments.map((e) => ({
        id: e.student.id,
        name: e.student.name,
        username: shortUsername(e.student.username),
        managed: e.managed,
        joinedAt: e.createdAt.getTime(),
      })),
    })),
  });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const type = (await accountTypeFor(user));
  if (type === "student") return json({ error: "Student accounts cannot become educator accounts." }, 403);
  if (!(await hasEducatorPlan(user))) return json({ error: "The Educator plan is not active on this account." }, 402);
  await becomeEducator(user.id);
  return json({ ok: true });
};
