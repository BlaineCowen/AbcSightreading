import { signedInUser } from "./auth-client";
import type { Plan } from "./plan";

/**
 * The browser's side of billing. The server decides every plan
 * (src/lib/server/plan.ts); this asks it, and starts checkouts through Better
 * Auth's Stripe plugin (/api/auth/subscription/*).
 */

export type BillingStatus = {
  plan: Plan;
  via: "subscription" | "complimentary" | "class" | null;
  billingEnabled: boolean;
  subscription: { id: string | null; plan: string; status: string; periodEnd: number | null; cancelAtPeriodEnd: boolean } | null;
};

let current: Promise<BillingStatus | null> | null = null;

/** The signed-in account's plan, asked once per page; null when signed out. */
export function billingStatus(refresh = false): Promise<BillingStatus | null> {
  if (refresh) current = null;
  current ??= signedInUser()
    .then(async (u) => {
      if (!u) return null;
      const res = await fetch("/api/billing");
      return res.ok ? ((await res.json()) as BillingStatus) : null;
    })
    .catch(() => null);
  return current;
}

async function post(path: string, body: unknown): Promise<string> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) throw new Error(data?.message ?? data?.error ?? `The server said ${res.status}.`);
  return data.url as string;
}

const here = (hash: string) => `${location.origin}/account${hash}`;

/**
 * Sends the browser to pay for a plan. With `subscriptionId` - Pro becoming
 * Educator - Stripe changes the existing subscription and charges the
 * difference for the rest of the year, rather than starting a second one.
 */
export async function startCheckout(plan: "pro" | "educator", subscriptionId?: string | null) {
  location.href = await post("/api/auth/subscription/upgrade", {
    plan,
    ...(subscriptionId ? { subscriptionId } : {}),
    successUrl: here("?upgraded=" + plan + "#plan"),
    cancelUrl: here("#plan"),
    returnUrl: here("#plan"),
  });
}

/** Stripe's own page for the card, receipts, and cancelling. */
export async function openBillingPortal() {
  location.href = await post("/api/auth/subscription/billing-portal", { returnUrl: here("#plan") });
}

export async function buySeatPacks(packs: number) {
  location.href = await post("/api/billing/seats", { packs });
}
