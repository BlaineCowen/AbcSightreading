import type Stripe from "stripe";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { stripe, taxReady, SEATS_PER_PACK } from "./stripe";
import { becomeEducator } from "./educator";
import { sendAccountEmail } from "./auth-email";
import { planFor } from "./plan";
import { INVOICE_DAYS, QUOTE_DAYS, invoiceStanding, quoteItems, type QuotePlan, type QuoteRequest } from "../quote";

/**
 * School quotes against Stripe. The whole purchase-order round trip, for Pro
 * or the Educator plan:
 *
 * 1. `createSchoolQuote` - a Stripe customer for the school (its purchasing
 *    contact, billing address and tax exemption), a finalized Stripe quote,
 *    net 30, and the PDF emailed straight to the purchasing addresses the
 *    teacher gave, the teacher copied and replies going to them.
 * 2. `acceptSchoolQuote` - the teacher enters the purchase order number. The
 *    quote is accepted, which starts the subscription; its first invoice
 *    carries the PO number and goes to the purchasing contact now. The plan
 *    starts the same moment: as schools expect, it runs on the PO while the
 *    invoice is paid.
 * 3. `reviewPoInvoices` - daily (/api/cron/po-invoices). A reminder a week
 *    before the invoice is due; unpaid on the day, the subscription is
 *    cancelled, the invoice voided and the plan ends. Renewals the same.
 */

/** At most this many open quotes per teacher, so the form cannot be used to mail strangers. */
const MAX_OPEN = 5;

export class QuoteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Teacher = { id: string; name: string; email: string };

async function priceIds() {
  const { data } = await stripe!.prices.list({ lookup_keys: ["pro_yearly", "educator_yearly", "seat_pack_25"], limit: 10 });
  return new Map(data.map((p) => [p.lookup_key!, p.id]));
}

export async function quotePdf(stripeQuoteId: string): Promise<Buffer> {
  const stream = await stripe!.quotes.pdf(stripeQuoteId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const planName = (plan: string) => (plan === "pro" ? "Pro" : "Educator");
const longDay = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

function planLine(plan: QuotePlan, seats: number) {
  return plan === "pro"
    ? "One year of abc Sight Reading Pro: unlimited sight-reading exercises for choir, the practice tools (tuner, metronome, drone, starting pitches) and abcTuner."
    : `One year of the Educator plan: unlimited sight-reading exercises, practice tools, and ${seats} secure student accounts for all age groups.`;
}

async function notifyOwner(subject: string, lines: string[]) {
  const owner = serverEnv("FEEDBACK_TO");
  if (!owner) return;
  await sendAccountEmail(owner, subject, lines.filter(Boolean).join("\n")).catch((e) => console.error("[quotes] could not notify:", e));
}

export async function createSchoolQuote(user: Teacher, req: QuoteRequest) {
  if (!stripe) throw new QuoteError("Quotes are not available here.", 503);
  // Mail goes to a purchasing office in the teacher's name: only from an
  // address that is theirs.
  // From the database: the session's copy is cached, and would still say
  // "unconfirmed" for minutes after the teacher clicks the link.
  const confirmed = (await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } }))?.emailVerified;
  if (!confirmed) {
    throw new QuoteError("Confirm your email address first (the link is in your inbox), so a quote sent in your name really comes from you.", 403);
  }
  const current = await planFor(user.id);
  if (req.plan === "pro" && current !== "free") throw new QuoteError(`You already have ${planName(current)}.`, 409);
  if (req.plan === "educator" && current === "educator") throw new QuoteError("You already have Educator.", 409);
  const open = await prisma.quote.count({ where: { userId: user.id, status: "open", expiresAt: { gt: new Date() } } });
  if (open >= MAX_OPEN) throw new QuoteError(`You have ${open} open quotes. Cancel one before asking for another.`, 409);

  const prices = await priceIds();
  const items = quoteItems(req.plan, req.packs).map((i) => {
    const price = prices.get(i.price);
    if (!price) throw new QuoteError("Prices are not set up in Stripe.", 503);
    return { price, quantity: i.quantity };
  });

  const billTo = req.district || req.school;
  const customer = await stripe.customers.create({
    name: billTo,
    email: req.contactEmail,
    description: req.district ? `${req.school}, ${req.district}` : req.school,
    address: {
      line1: req.address.line1,
      line2: req.address.line2 || undefined,
      city: req.address.city,
      state: req.address.state,
      postal_code: req.address.postalCode,
      country: "US",
    },
    // A public school or district: no sales tax. Texas asks for Form 01-339
    // on file; the purchasing office sends it with the PO.
    tax_exempt: req.taxExempt ? "exempt" : "none",
    metadata: { kind: "school", userId: user.id, contactName: req.contactName, school: req.school },
  });

  const seats = 100 + req.packs * SEATS_PER_PACK;
  const metadata = { kind: "school_quote", plan: req.plan, userId: user.id, packs: String(req.packs) };
  const draft = await stripe.quotes.create({
    customer: customer.id,
    line_items: items,
    collection_method: "send_invoice",
    invoice_settings: { days_until_due: INVOICE_DAYS },
    automatic_tax: { enabled: await taxReady() },
    expires_at: Math.floor(Date.now() / 1000) + QUOTE_DAYS * 86_400,
    header: `abc Sight Reading: ${req.plan === "pro" ? "Pro" : "Educator plan"}`,
    description:
      `For ${req.school}${req.district ? `, ${req.district}` : ""}. Attention: ${req.contactName}.\n` +
      `Account holder: ${user.name} (${user.email}).\n` +
      `${planLine(req.plan, seats)} Renews yearly by invoice; cancel any time before renewal.`,
    footer:
      `Please put this quote number on the purchase order. Payment: net ${INVOICE_DAYS} by ACH, card or check through the invoice's payment link. ` +
      `If the invoice is not paid by its due date, the plan ends. ` +
      (req.taxExempt ? "Quoted tax-exempt: please send your exemption certificate (Texas: Form 01-339) with the PO. " : "") +
      "W-9 available on request.",
    metadata,
    subscription_data: { metadata },
  });
  const quote = await stripe.quotes.finalizeQuote(draft.id);

  const row = await prisma.quote.create({
    data: {
      userId: user.id,
      plan: req.plan,
      stripeQuoteId: quote.id,
      stripeCustomerId: customer.id,
      number: quote.number,
      school: req.school,
      contactEmail: req.contactEmail,
      sendTo: req.sendTo.join(","),
      packs: req.packs,
      taxExempt: req.taxExempt,
      amountTotal: quote.amount_total,
      expiresAt: new Date((quote.expires_at ?? 0) * 1000),
    },
  });

  // Straight to purchasing, the teacher copied and replies going to them.
  const pdf = await quotePdf(quote.id).catch(() => null);
  const product = req.plan === "pro" ? "abc Sight Reading Pro" : "the abc Sight Reading Educator plan";
  await sendAccountEmail(
    req.sendTo,
    `Quote ${quote.number}: ${product} for ${user.name}, ${req.school}`,
    [
      `Hello ${req.contactName},`,
      "",
      `${user.name} (${user.email}) at ${req.school} would like a year of ${product}, a sight-reading practice tool for choir.`,
      `Quote ${quote.number} is attached: ${dollars(quote.amount_total)}${req.taxExempt ? ", quoted tax-exempt" : ""}, good until ${longDay(row.expiresAt)}.`,
      "",
      `To buy it, please issue a purchase order to abc Sight Reading for quote ${quote.number}, and send the PO number to ${user.name} (reply to this email to reach them).`,
      `Once they enter it, the plan starts and the invoice comes to ${req.contactEmail}, due in ${INVOICE_DAYS} days, payable by ACH, card or check through its payment link. If it is not paid by then, the plan ends.`,
      req.taxExempt ? "Please send your exemption certificate (Texas: Form 01-339) with the PO." : "",
      "A W-9 is available on request.",
      "",
      "Thank you,",
      "abc Sight Reading",
      "https://www.abc-sightreading.com",
    ]
      .filter((l, i, all) => l !== "" || all[i - 1] !== "")
      .join("\n"),
    pdf ? [{ filename: `${quote.number}.pdf`, content: pdf }] : undefined,
    { cc: [user.email], replyTo: user.email }
  ).catch((e) => console.error("[quotes] could not email the quote:", e));

  return row;
}

export async function acceptSchoolQuote(user: Teacher, quoteId: string, poNumber: string) {
  if (!stripe) throw new QuoteError("Quotes are not available here.", 503);
  const row = await prisma.quote.findFirst({ where: { id: quoteId, userId: user.id } });
  if (!row) throw new QuoteError("No such quote.", 404);
  if (row.status !== "open") throw new QuoteError("That quote has already been used or cancelled.", 409);
  if (row.expiresAt < new Date()) throw new QuoteError("That quote has expired. Ask for a new one.", 409);
  const plan = row.plan === "pro" ? "pro" : "educator";

  const accepted = await stripe.quotes.accept(row.stripeQuoteId);
  const subscriptionId = typeof accepted.subscription === "string" ? accepted.subscription : accepted.subscription?.id;
  if (!subscriptionId) throw new QuoteError("Stripe did not start the subscription.", 502);
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });

  // The PO number on the invoice, and the invoice out now rather than in
  // Stripe's usual hour.
  let invoiceUrl: string | null = null;
  let invoiceId: string | null = null;
  let invoiceDueAt: Date | null = null;
  const invoice = sub.latest_invoice as Stripe.Invoice | null;
  if (invoice?.id) {
    await stripe.invoices.update(invoice.id, { custom_fields: [{ name: "PO number", value: poNumber }] });
    let sent = invoice;
    if (invoice.status === "draft") sent = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });
    sent = await stripe.invoices.sendInvoice(sent.id!).catch(() => sent);
    invoiceUrl = sent.hosted_invoice_url ?? null;
    invoiceId = sent.id ?? null;
    invoiceDueAt = sent.due_date ? new Date(sent.due_date * 1000) : new Date(Date.now() + INVOICE_DAYS * 86_400_000);
  }

  const item = sub.items.data[0];
  const periodEnd = new Date(item.current_period_end * 1000);
  await prisma.subscription.upsert({
    where: { id: `quote_${row.id}` },
    create: {
      id: `quote_${row.id}`,
      plan,
      referenceId: user.id,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      periodStart: new Date(item.current_period_start * 1000),
      periodEnd,
      billingInterval: "year",
    },
    update: {},
  });

  if (plan === "educator") {
    if (row.packs > 0) {
      await prisma.seatGrant.upsert({
        where: { stripeCheckoutId: `quote:${row.stripeQuoteId}` },
        create: { userId: user.id, seats: row.packs * SEATS_PER_PACK, expiresAt: periodEnd, stripeCheckoutId: `quote:${row.stripeQuoteId}` },
        update: {},
      });
    }
    await becomeEducator(user.id);

    // A Pro subscription paid by card is covered by Educator now; stop it renewing.
    const pro = await prisma.subscription.findMany({
      where: { referenceId: user.id, plan: "pro", status: { in: ["active", "trialing"] }, stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true },
    });
    for (const p of pro) {
      await stripe.subscriptions.update(p.stripeSubscriptionId!, { cancel_at_period_end: true }).catch(() => {});
    }
  }

  const updated = await prisma.quote.update({
    where: { id: row.id },
    data: { status: "accepted", poNumber, acceptedAt: new Date(), stripeSubscriptionId: sub.id, invoiceUrl, invoiceId, invoiceDueAt },
  });

  // Word to the owner, so a PO never goes unnoticed.
  await notifyOwner(`PO ${poNumber}: ${row.school}, ${planName(plan)} (${row.number})`, [
    `${user.name} (${user.email}) entered PO ${poNumber} for quote ${row.number}.`,
    `School: ${row.school}. Invoice to: ${row.contactEmail}. ${dollars(row.amountTotal)}${row.taxExempt ? ", tax-exempt: file their certificate" : ""}.`,
    plan === "educator" ? `Seat packs: ${row.packs}.` : "",
    invoiceDueAt ? `Due ${longDay(invoiceDueAt)}; the plan ends if it is unpaid then.` : "",
    invoiceUrl ? `Invoice: ${invoiceUrl}` : "",
  ]);
  return updated;
}

export async function cancelSchoolQuote(userId: string, quoteId: string) {
  const row = await prisma.quote.findFirst({ where: { id: quoteId, userId } });
  if (!row) throw new QuoteError("No such quote.", 404);
  if (row.status !== "open") throw new QuoteError("Only an open quote can be cancelled.", 409);
  await stripe?.quotes.cancel(row.stripeQuoteId).catch(() => {});
  await prisma.quote.update({ where: { id: row.id }, data: { status: "canceled" } });
}

/**
 * The daily check of every plan running on a purchase order: note what has
 * been paid, remind a week before an invoice is due, and end the plan when it
 * falls due unpaid. Returns what it did, for the cron's log.
 */
export async function reviewPoInvoices(now = new Date()) {
  if (!stripe) return { checked: 0, paid: 0, reminded: 0, lapsed: 0 };
  const rows = await prisma.quote.findMany({
    where: { status: "accepted", lapsedAt: null, stripeSubscriptionId: { not: null } },
    include: { user: { select: { name: true, email: true } } },
  });
  const done = { checked: rows.length, paid: 0, reminded: 0, lapsed: 0 };

  for (const row of rows) {
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId!, { expand: ["latest_invoice"] });
      if (sub.status === "canceled") {
        // Ended some other way (by hand, in Stripe): stop watching it.
        await prisma.subscription.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status: "canceled" } });
        await prisma.quote.update({ where: { id: row.id }, data: { lapsedAt: now } });
        continue;
      }
      const inv = sub.latest_invoice as Stripe.Invoice | null;
      if (!inv?.id || inv.status === "draft" || inv.status === "void") continue;

      // A new invoice (a renewal): watch that one from the start.
      let state = { invoiceId: row.invoiceId, dueAt: row.invoiceDueAt, paidAt: row.paidAt, remindedAt: row.remindedAt };
      if (inv.id !== row.invoiceId) {
        state = {
          invoiceId: inv.id,
          dueAt: inv.due_date ? new Date(inv.due_date * 1000) : new Date(inv.created * 1000 + INVOICE_DAYS * 86_400_000),
          paidAt: null,
          remindedAt: null,
        };
        await prisma.quote.update({
          where: { id: row.id },
          data: { invoiceId: state.invoiceId, invoiceDueAt: state.dueAt, paidAt: null, remindedAt: null, invoiceUrl: inv.hosted_invoice_url ?? row.invoiceUrl },
        });
      }
      const dueAt = state.dueAt ?? new Date((row.acceptedAt ?? row.createdAt).getTime() + INVOICE_DAYS * 86_400_000);
      const standing = invoiceStanding({ dueAt, paid: inv.status === "paid", reminded: !!state.remindedAt, now });
      const sendTo = row.sendTo ? row.sendTo.split(",") : [row.contactEmail];
      const product = row.plan === "pro" ? "abc Sight Reading Pro" : "the abc Sight Reading Educator plan";

      if (standing === "paid") {
        if (!state.paidAt) {
          await prisma.quote.update({ where: { id: row.id }, data: { paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : now } });
          done.paid++;
        }
      } else if (standing === "remind") {
        await sendAccountEmail(
          sendTo,
          `Reminder: invoice for ${product}, ${row.school}, due ${longDay(dueAt)}`,
          [
            "Hello,",
            "",
            `This is a reminder that the invoice for ${product} for ${row.user.name} at ${row.school} (PO ${row.poNumber ?? "on file"}, quote ${row.number}) is due on ${longDay(dueAt)}.`,
            `If it is still unpaid then, the plan ends.`,
            inv.hosted_invoice_url ? `Pay it here, by ACH, card or check: ${inv.hosted_invoice_url}` : "",
            "",
            "If it has already been paid, thank you, and please ignore this.",
            "",
            "abc Sight Reading",
          ].filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n"),
          undefined,
          { cc: [row.user.email], replyTo: row.user.email }
        ).catch((e) => console.error("[quotes] could not send the reminder:", e));
        await prisma.quote.update({ where: { id: row.id }, data: { remindedAt: now } });
        done.reminded++;
      } else if (standing === "lapse") {
        await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
        await stripe.invoices.voidInvoice(inv.id).catch((e) => console.error("[quotes] could not void", inv.id, e));
        await prisma.subscription.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status: "canceled" } });
        await prisma.seatGrant.updateMany({ where: { stripeCheckoutId: `quote:${row.stripeQuoteId}` }, data: { expiresAt: now } });
        await prisma.quote.update({ where: { id: row.id }, data: { lapsedAt: now } });
        await sendAccountEmail(
          row.user.email,
          `Your ${planName(row.plan)} plan has ended: the school's invoice was not paid`,
          [
            `Hello ${row.user.name},`,
            "",
            `The invoice for ${row.school} (PO ${row.poNumber ?? "on file"}, quote ${row.number}) was not paid by ${longDay(dueAt)}, so your ${planName(row.plan)} plan has ended and the invoice has been cancelled.`,
            "",
            "Your account, presets and classes are all still there. To start again, send a new quote from your account page, or buy Pro by card.",
            "",
            "abc Sight Reading",
          ].join("\n"),
          undefined,
          { cc: sendTo }
        ).catch((e) => console.error("[quotes] could not send the lapse notice:", e));
        await notifyOwner(`Lapsed: ${row.school}, ${planName(row.plan)} (${row.number})`, [
          `${row.user.name} (${row.user.email}): invoice ${inv.number ?? inv.id} unpaid by ${longDay(dueAt)}. Subscription cancelled, invoice voided.`,
        ]);
        done.lapsed++;
      }
    } catch (e) {
      console.error("[quotes] could not review", row.id, e);
    }
  }
  return done;
}
