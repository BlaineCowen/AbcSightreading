/**
 * Whether a user has the paid plan.
 *
 * Everything is free for now, so this says yes to everyone signed in. It is
 * the one place the yearly subscription will be checked once billing is on
 * (Better Auth's Stripe plugin adds the subscription table) - gate features by
 * calling this, never by reading billing fields directly.
 */
export function hasPremium(_user: { id: string }): boolean {
  return true;
}
