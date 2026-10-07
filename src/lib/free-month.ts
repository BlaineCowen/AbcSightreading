/**
 * A free month of Pro: no card, nothing to cancel, it simply ends. Once per
 * person, for anyone who has never had Pro (paid, a code, complimentary, or a
 * teacher's class), and guarded against one person making many accounts:
 * the email must be confirmed and not a throwaway address; one per email
 * address however it is dressed up (Gmail ignores dots and "+tags", every
 * provider ignores "+tags"); one per browser; and a few per network a month.
 * Pure rules, tested in tests/unit/free-month.test.ts; the server side is
 * src/lib/server/free-month.ts.
 */

export const FREE_MONTH_DAYS = 30;
/** Claims from one network (address) in FREE_MONTH_DAYS: a school's teachers fit, a farm of accounts does not. */
export const NETWORK_LIMIT = 5;

/**
 * The person behind an address, for "once per person": lower case, "+tag"
 * dropped, and for Gmail the dots too (b.lain.e@gmail.com is blaine@gmail.com)
 * and googlemail.com is gmail.com.
 */
export function emailKey(email: string): string {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return email.trim().toLowerCase();
  let local = email.trim().toLowerCase().slice(0, at);
  let domain = email.trim().toLowerCase().slice(at + 1);
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Throwaway inbox services: an account on one is not a person to give a month to. */
const DISPOSABLE = new Set(
  `mailinator.com mailinator.net mailinator.org guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz
  guerrillamailblock.com sharklasers.com grr.la spam4.me pokemail.net 10minutemail.com 10minutemail.net 10minemail.com
  20minutemail.com temp-mail.org temp-mail.io tempmail.com tempmail.net tempmailo.com tempmail.dev tempr.email tempm.com
  yopmail.com yopmail.net yopmail.fr cool.fr.nf jetable.fr.nf trashmail.com trashmail.de trashmail.net trashmail.me
  throwawaymail.com throwam.com getnada.com nada.email dispostable.com maildrop.cc mailnesia.com mintemail.com
  fakeinbox.com fakemail.net emailondeck.com mohmal.com moakt.com discard.email discardmail.com mailcatch.com
  inboxkitten.com 1secmail.com 1secmail.net 1secmail.org esiix.com wwjmp.com spamgourmet.com mytemp.email
  tempinbox.com burnermail.io anonaddy.me mail.tm mailtm.com emailfake.com email-fake.com fakemailgenerator.com
  getairmail.com mailpoof.com tmail.ws tmpmail.org tmpmail.net linshiyouxiang.net dropmail.me 33mail.com
  spambox.us spamfree24.org mailexpire.com incognitomail.org mytrashmail.com mailnull.com e4ward.com
  harakirimail.com mailforspam.com tempemail.net tempomail.fr instantemailaddress.com temporary-mail.net
  emltmp.com tmpbox.net luxusmail.org minuteinbox.com tempmailaddress.com 33m.co emailtemporanea.net
  crazymailing.com mvrht.net lroid.com yomail.info armyspy.com cuvox.de dayrep.com einrot.com fleckens.hu
  gustr.com jourrapide.com rhyta.com superrito.com teleworm.us`.split(/\s+/).filter(Boolean),
);

export const isDisposable = (email: string) => DISPOSABLE.has(email.trim().toLowerCase().split("@").pop() ?? "");

export type FreeMonthCheck = {
  signedIn: boolean;
  accountType: string;
  emailVerified: boolean;
  email: string;
  /** Any subscription ever, any code grant ever, complimentary, or Pro through a teacher's class now. */
  hadPro: boolean;
  /** Another account (or this one) already claimed it with this email key, this browser, or too often from this network. */
  emailKeyUsed: boolean;
  browserUsed: boolean;
  networkClaims: number;
  enabled: boolean;
};

/** Whether the month can be claimed, and if not, why, in words for the account page. */
export function freeMonthDecision(c: FreeMonthCheck): { ok: true } | { ok: false; reason: string; quiet?: boolean } {
  if (!c.enabled) return { ok: false, reason: "The free month is not on offer right now.", quiet: true };
  if (!c.signedIn) return { ok: false, reason: "Create a free account first.", quiet: true };
  if (c.accountType === "student") return { ok: false, reason: "Your teacher's plan covers you.", quiet: true };
  if (c.hadPro) return { ok: false, reason: "The free month is for accounts that have not had Pro.", quiet: true };
  if (isDisposable(c.email)) return { ok: false, reason: "The free month needs a permanent email address, not a temporary inbox." };
  if (!c.emailVerified) return { ok: false, reason: "Confirm your email address first: the link is in your inbox." };
  if (c.emailKeyUsed || c.browserUsed) return { ok: false, reason: "The free month has already been used." };
  if (c.networkClaims >= NETWORK_LIMIT) {
    return { ok: false, reason: "Too many free months have been claimed from this network. Try again from another connection, or write to us." };
  }
  return { ok: true };
}
