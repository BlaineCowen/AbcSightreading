import type Stripe from "stripe";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { stripe, taxReady, SEATS_PER_PACK } from "./stripe";
import { becomeEducator } from "./educator";
import { sendAccountEmail } from "./auth-email";
import { QUOTE_DAYS, quoteItems, type QuoteRequest } from "../quote";

/**
 * School quotes against Stripe. The whole purchase-order round trip:
 *
 * 1. `createSchoolQuote` - a Stripe customer for the school (its purchasing
 *    contact, billing address and tax exemption), a finalized Stripe quote for
 *    the Educator year and any seat packs, net 30, and the PDF emailed to the
 *    teacher to pass on.
 * 2. `acceptSchoolQuote` - the teacher enters the purchase order number. The
 *    quote is accepted, which starts the subscription; its first invoice
 *    carries the PO number and goes to the purchasing contact now. Educator,
 *    and the seats, start the same moment - as schools expect, the plan runs
 *    on the PO while the invoice is paid.
 *
 * Renewal is Stripe's: a year on, the next invoice goes to the same contact.
 */

/** At most this many open quotes per teacher, so the form cannot be used to mail strangers. */
const MAX_OPEN = 5;

export class QuoteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function priceIds() {
  const { data } = await stripe!.prices.list({ lookup_keys: ["educator_yearly", "seat_pack_25"], limit: 10 });
  return new Map(data.map((p) => [p.lookup_key!, p.id]));
}

export async function quotePdf(stripeQuoteId: string): Promise<Buffer> {
  const stream = await stripe!.quotes.pdf(stripeQuoteId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function createSchoolQuote(user: { id: string; name: string; email: string }, req: QuoteRequest) {
  if (!stripe) throw new QuoteError("Quotes are not available here.", 503);
  const open = await prisma.quote.count({ where: { userId: user.id, status: "open", expiresAt: { gt: new Date() } } });
  if (open >= MAX_OPEN) throw new QuoteError(`You have ${open} open quotes. Cancel one before asking for another.`, 409);

  const prices = await priceIds();
  const items = quoteItems(req.packs).map((i) => {
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
  const metadata = { kind: "school_quote", userId: user.id, packs: String(req.packs) };
  const draft = await stripe.quotes.create({
    customer: customer.id,
    line_items: items,
    collection_method: "send_invoice",
    invoice_settings: { days_until_due: 30 },
    automatic_tax: { enabled: await taxReady() },
    expires_at: Math.floor(Date.now() / 1000) + QUOTE_DAYS * 86_400,
    header: "abc Sight Reading: Educator plan",
    description:
      `For ${req.school}${req.district ? `, ${req.district}` : ""}. Attention: ${req.contactName}.\n` +
      `Account holder: ${user.name} (${user.email}).\n` +
      `One year of the Educator plan: unlimited sight-reading exercises, practice tools, and ${seats} secure student accounts` +
      ` for all age groups. Renews yearly by invoice; cancel any time before renewal.`,
    footer:
      "Please put this quote number on the purchase order. Payment: net 30 by ACH, card or check through the invoice's payment link. " +
      (req.taxExempt ? "Quoted tax-exempt: please send your exemption certificate (Texas: Form 01-339) with the PO. " : "") +
      "W-9 available on request.",
    metadata,
    subscription_data: { metadata },
  });
  const quote = await stripe.quotes.finalizeQuote(draft.id);

  const row = await prisma.quote.create({
    data: {
      userId: user.id,
      stripeQuoteId: quote.id,
      stripeCustomerId: customer.id,
      number: quote.number,
      school: req.school,
      contactEmail: req.contactEmail,
      packs: req.packs,
      taxExempt: req.taxExempt,
      amountTotal: quote.amount_total,
      expiresAt: new Date((quote.expires_at ?? 0) * 1000),
    },
  });

  // The PDF to the teacher, who sends it on - the site never mails a
  // purchasing office on a stranger's word.
  const pdf = await quotePdf(quote.id).catch(() => null);
  await sendAccountEmail(
    user.email,
    `Your quote ${quote.number} for abc Sight Reading`,
    [
      `Here is quote ${quote.number} for ${req.school}: ${dollars(quote.amount_total)}, good until ${row.expiresAt.toDateString()}.`,
      "",
      `Send it to ${req.contactName} (${req.contactEmail}) for a purchase order. When you have the PO number,`,
      "enter it on your account page - the Educator plan starts right away, and the invoice goes to",
      `${req.contactEmail}, due in 30 days.`,
      "",
      "The quote is also on your account page, under Plan.",
    ].join("\n"),
    pdf ? [{ filename: `${quote.number}.pdf`, content: pdf }] : undefined
  ).catch((e) => console.error("[quotes] could not email the quote:", e));

  return row;
}

export async function acceptSchoolQuote(user: { id: string; name: string; email: string }, quoteId: string, poNumber: string) {
  if (!stripe) throw new QuoteError("Quotes are not available here.", 503);
  const row = await prisma.quote.findFirst({ where: { id: quoteId, userId: user.id } });
  if (!row) throw new QuoteError("No such quote.", 404);
  if (row.status !== "open") throw new QuoteError("That quote has already been used or cancelled.", 409);
  if (row.expiresAt < new Date()) throw new QuoteError("That quote has expired. Ask for a new one.", 409);

  const accepted = await stripe.quotes.accept(row.stripeQuoteId);
  const subscriptionId = typeof accepted.subscription === "string" ? accepted.subscription : accepted.subscription?.id;
  if (!subscriptionId) throw new QuoteError("Stripe did not start the subscription.", 502);
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });

  // The PO number on the invoice, and the invoice out now rather than in
  // Stripe's usual hour.
  let invoiceUrl: string | null = null;
  const invoice = sub.latest_invoice as Stripe.Invoice | null;
  if (invoice?.id) {
    await stripe.invoices.update(invoice.id, { custom_fields: [{ name: "PO number", value: poNumber }] });
    let sent = invoice;
    if (invoice.status === "draft") sent = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });
    sent = await stripe.invoices.sendInvoice(sent.id!).catch(() => sent);
    invoiceUrl = sent.hosted_invoice_url ?? null;
  }

  const item = sub.items.data[0];
  const periodEnd = new Date(item.current_period_end * 1000);
  await prisma.subscription.upsert({
    where: { id: `quote_${row.id}` },
    create: {
      id: `quote_${row.id}`,
      plan: "educator",
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

  const updated = await prisma.quote.update({
    where: { id: row.id },
    data: { status: "accepted", poNumber, acceptedAt: new Date(), stripeSubscriptionId: sub.id, invoiceUrl },
  });

  // Word to the owner, so a PO never goes unnoticed.
  const owner = serverEnv("FEEDBACK_TO");
  if (owner) {
    await sendAccountEmail(
      owner,
      `PO ${poNumber}: ${row.school}, Educator (${row.number})`,
      [
        `${user.name} (${user.email}) entered PO ${poNumber} for quote ${row.number}.`,
        `School: ${row.school}. Invoice to: ${row.contactEmail}. ${dollars(row.amountTotal)}${row.taxExempt ? ", tax-exempt - file their certificate" : ""}.`,
        `Seat packs: ${row.packs}.`,
        invoiceUrl ? `Invoice: ${invoiceUrl}` : "",
      ].join("\n")
    ).catch((e) => console.error("[quotes] could not notify:", e));
  }
  return updated;
}

export async function cancelSchoolQuote(userId: string, quoteId: string) {
  const row = await prisma.quote.findFirst({ where: { id: quoteId, userId } });
  if (!row) throw new QuoteError("No such quote.", 404);
  if (row.status !== "open") throw new QuoteError("Only an open quote can be cancelled.", 409);
  await stripe?.quotes.cancel(row.stripeQuoteId).catch(() => {});
  await prisma.quote.update({ where: { id: row.id }, data: { status: "canceled" } });
}
