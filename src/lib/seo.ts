/**
 * The public pages search engines should know about, for the sitemap. Pages
 * that are accounts, tools or dev scratchpads are left out here and marked
 * noindex on the page (Layout's `noindex`).
 */
export const PUBLIC_PAGES = [
  "/",
  "/choral-sightreading",
  "/sightreading",
  "/uil-sight-reading",
  "/pricing",
  "/sight-reading-factory-alternative",
  "/tuner",
];

/** The plans as the pricing page and structured data state them. Keep in step with src/lib/plan.ts. */
export const PLAN_OFFERS = [
  { name: "Free", price: "0", description: "10 exercises a month without an account, 50 with a free account" },
  { name: "Pro", price: "19.99", description: "Unlimited exercises, the practice tools and abcTuner, for a year" },
  { name: "Educator", price: "99", description: "Everything in Pro, plus classes, assignments, practice time and 100 student accounts, for a year" },
];
