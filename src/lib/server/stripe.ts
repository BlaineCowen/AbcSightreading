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
