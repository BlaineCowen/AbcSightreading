import Stripe from "stripe";
import { serverEnv } from "./env";

/**
 * The Stripe client, or null where billing is not configured (local dev
 * without keys). Everything that charges checks for null and says billing is
 * unavailable rather than failing.
 */
const key = serverEnv("STRIPE_SECRET_KEY");
export const stripe = key ? new Stripe(key) : null;
export const stripeWebhookSecret = serverEnv("STRIPE_WEBHOOK_SECRET");

/** Price lookup keys, the same in the sandbox and live, so no price ids live in code. */
export const PRICES = { pro: "pro_yearly", educator: "educator_yearly", seatPack: "seat_pack_25" } as const;
export const SEATS_PER_PACK = 25;

/**
 * Whether Stripe Tax is set up (it needs the head office address). Until it
 * is, asking Stripe to add tax makes it refuse the checkout or quote, so tax
 * is asked for only once it would work. Checked once per server instance for
 * five minutes.
 */
let taxChecked: { at: number; ready: boolean } | null = null;
export async function taxReady(): Promise<boolean> {
  if (!stripe) return false;
  if (taxChecked && Date.now() - taxChecked.at < 5 * 60_000) return taxChecked.ready;
  try {
    const settings = await stripe.tax.settings.retrieve();
    taxChecked = { at: Date.now(), ready: settings.status === "active" };
  } catch {
    taxChecked = { at: Date.now(), ready: false };
  }
  return taxChecked.ready;
}
