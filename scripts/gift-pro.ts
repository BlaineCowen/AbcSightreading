/**
 * Give accounts a month of Pro by hand, and tell them (src/lib/server/gift.ts).
 *
 *   bun run scripts/gift-pro.ts a@x.com b@y.com            preview: who, until when, the email
 *   bun run scripts/gift-pro.ts --apply a@x.com            give it (the banner shows on their next visit)
 *   bun run scripts/gift-pro.ts --apply --email a@x.com    give it and send the email
 *   REPLY_TO=me@x.com ...                                  where replies to the email go
 *
 * Refuses an account that already has or had Pro, or that is a student.
 * Writes to the shared database: production's.
 */
import { prisma } from "../src/lib/server/db";
import { giftPro } from "../src/lib/server/gift";
import { sendAccountEmail } from "../src/lib/server/auth-email";
import { complimentary, planFor } from "../src/lib/server/plan";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const email = args.includes("--email");
const emails = args.filter((a) => !a.startsWith("--"));
const replyTo = process.env.REPLY_TO;
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function giftEmail(name: string | null, until: Date, canReply: boolean) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return {
    subject: "You've been upgraded to abcSightReading Pro",
    text: [
      first ? `Hi ${first},` : "Hi,",
      "",
      `Thanks for trying abcSightReading. We've upgraded your account to Pro, free for a month, until ${day(until)}. There's nothing to do and no card needed.`,
      "",
      "Pro gives you unlimited exercises at every UIL level and voicing, Listen and grade (it hears your singers and marks the music), play-along videos, and the practice tools: tuner, metronome, drone and more.",
      "",
      "Sign in at https://www.abc-sightreading.com to try it.",
      ...(canReply ? ["", "Questions or ideas? Just reply to this email."] : []),
      "",
      "Blaine",
      "abcSightReading",
    ].join("\n"),
  };
}

if (!emails.length) {
  console.error("Name the accounts by email.");
  process.exit(1);
}
for (const address of emails) {
  const user = await prisma.user.findFirst({ where: { email: { equals: address, mode: "insensitive" } }, select: { id: true, email: true, name: true, accountType: true } });
  if (!user) { console.log(`${address}: no such account`); continue; }
  const [subs, grants] = await Promise.all([
    prisma.subscription.count({ where: { referenceId: user.id } }),
    prisma.accessGrant.count({ where: { userId: user.id } }),
  ]);
  const plan = await planFor(user.id);
  if (user.accountType === "student" || subs || grants || complimentary(user.email) || plan !== "free") {
    console.log(`${user.email}: skipped (student, or has or had Pro: plan ${plan}, ${subs} subscriptions, ${grants} grants)`);
    continue;
  }
  const until = new Date(Date.now() + 30 * 86_400_000);
  const mail = giftEmail(user.name, until, !!replyTo);
  if (!apply) {
    console.log(`${user.email}: would get Pro until ${day(until)}${email ? ", and this email:" : ""}`);
    if (email) console.log(`  Subject: ${mail.subject}\n  ${mail.text.split("\n").join("\n  ")}\n`);
    continue;
  }
  const grant = await giftPro(user.id);
  console.log(`${user.email}: Pro until ${day(grant.expiresAt)} (grant ${grant.id})`);
  if (email) {
    const sent = giftEmail(user.name, grant.expiresAt, !!replyTo);
    await sendAccountEmail(user.email, sent.subject, sent.text, undefined, replyTo ? { replyTo } : undefined);
    console.log(`  emailed`);
  }
}
await prisma.$disconnect();
