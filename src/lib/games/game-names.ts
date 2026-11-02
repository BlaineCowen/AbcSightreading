/**
 * A player's name in a class game. Every device has a made-up one, "Mint
 * Otter", from its own random key (Live's deviceKey), so the same device
 * keeps the same name and a student need type nothing. A student may type
 * their own instead (Blaine, 2 November 2026); it is checked here
 * (`nameProblem`) on the device and again on the server, and the teacher can
 * still remove any name from the big screen (the game's `blocked`), which
 * puts that device back on its made-up name.
 */

const COLOURS = ["Mint", "Peach", "Butter", "Sky", "Coral", "Lilac", "Ruby", "Jade", "Amber", "Indigo", "Silver", "Golden", "Rosy", "Teal", "Plum", "Cocoa"];
const ANIMALS = ["Otter", "Fox", "Panda", "Koala", "Owl", "Frog", "Tiger", "Whale", "Llama", "Puffin", "Gecko", "Badger", "Bunny", "Moose", "Seal", "Lynx", "Robin", "Yak", "Newt", "Heron"];

/** A small stable hash of a string (FNV-1a). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The device's made-up name: the same every time for the same key. */
export function playerName(deviceKey: string): string {
  const h = hash(deviceKey);
  return `${COLOURS[h % COLOURS.length]} ${ANIMALS[Math.floor(h / COLOURS.length) % ANIMALS.length]}`;
}

/** A short stable tag for the device on the board, so it can find its own row; the key itself is never shown. */
export const playerTag = (deviceKey: string) => hash(`tag:${deviceKey}`).toString(36);

// ── Typed names ───────────────────────────────────────────────────────────

export const NAME_MIN = 2;
export const NAME_MAX = 16;

/** Letters (any language), digits, spaces, and . ' - between them. */
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

/**
 * Words a name may not contain, after undoing the usual disguises (digits and
 * symbols for letters, accents, spaces or dots between letters). Distinctive
 * roots are found anywhere, with repeated letters squeezed ("fuuuck");
 * short words only as a whole word of the name, so Bob, Cassidy, Nigel,
 * Essex or Dickens stay fine. A quick first check: the teacher's remove
 * button on the big screen is the real one.
 */
const ANYWHERE = [
  "fuck", "fuk", "shit", "bitch", "cunt", "whore", "slut", "penis", "vagina", "dildo", "porn", "rapist", "bastard",
  "pusy", "nazi", "hitler", "retard", "wank", "twat", "horny", "jiz", "molest", "pedophile", "suicide",
  "niga", "fagot", "ashole", "arsehole", "bolocks", "testicle", "orgasm", "erection", "blowjob", "handjob",
];
/** Found anywhere without squeezing (squeezed, they would hide inside real names). */
const ANYWHERE_EXACT = ["nigger", "faggot"];
const WHOLE = new Set([
  "ass", "arse", "dick", "cock", "fag", "tit", "tits", "boob", "boobs", "sex", "sexy", "rape", "cum", "kill", "die",
  "piss", "crap", "anal", "nude", "naked", "butt", "poop", "hoe", "kkk", "damn", "hell", "balls", "titty", "titties",
  "booty",
]);
/** Real words and places a root above hides in, taken out before the check. */
const ALLOW = ["shiitake", "scunthorpe", "penistone", "cockburn", "hancock", "babcock", "glasscock", "matsushita", "therapist"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "+": "t" };

/** Lower case, accents and disguises undone, letters only. */
function letters(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9!@$+]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, "");
}
const squeeze = (s: string) => s.replace(/(.)\1+/g, "$1");
/** Runs of three or more cut to two: "asssss" is "ass", "boooobs" is "boobs"... and "boobs" stays "boobs". */
const trimRuns = (s: string) => s.replace(/(.)\1{2,}/g, "$1$1");

/** Why a typed name will not do, in words for the student; null when it is fine. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN) return "A name needs at least 2 letters.";
  if (name.length > NAME_MAX) return `A name can be ${NAME_MAX} letters at most.`;
  if (!ALLOWED.test(name)) return "Use letters and numbers only.";
  const all = ALLOW.reduce((x, w) => x.split(w).join(" "), letters(name)).replace(/ /g, "");
  const words = name.split(/[\s.'-]+/).map((w) => trimRuns(letters(w))).filter(Boolean);
  const bad =
    ANYWHERE.some((w) => squeeze(all).includes(w)) ||
    ANYWHERE_EXACT.some((w) => all.includes(w)) ||
    words.some((w) => WHOLE.has(w) || WHOLE.has(w.replace(/(.)\1/g, "$1")));
  return bad ? "Please pick a different name." : null;
}

/** The name as it is shown: spaces tidied. */
export const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ");

/** The same name, however it is spaced or capitalised, for the teacher's removals. */
export const nameKey = (name: string) => cleanName(name).toLowerCase();
