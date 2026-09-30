/**
 * Class join codes: what a student types to join a class - "KTZ-482".
 *
 * Three letters and three digits, from an alphabet with nothing that reads two
 * ways (no O or 0, no I, L or 1), so a child copying it from the board cannot
 * get it wrong. Stored without the dash; typed with or without it, in any case.
 */

const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

export function generateJoinCode(random: () => number = Math.random): string {
  const pick = (from: string) => from[Math.floor(random() * from.length)];
  return pick(LETTERS) + pick(LETTERS) + pick(LETTERS) + pick(DIGITS) + pick(DIGITS) + pick(DIGITS);
}

/** "ktz 482", "KTZ-482" -> "KTZ482". */
export const normalizeJoinCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const isJoinCode = (code: string) => /^[A-HJKMNP-Z]{3}[2-9]{3}$/.test(code);

/** "KTZ482" -> "KTZ-482", as it is printed and shown. */
export const formatJoinCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;

/**
 * Why what has been typed is not a class code yet, for the hint under the box;
 * null while it may still become one, or when it is one. The join form only
 * greyed out its button, so a child who typed O for 0 was stuck without a
 * word.
 */
export function joinCodeHint(input: string): string | null {
  const code = normalizeJoinCode(input);
  if (!code || isJoinCode(code)) return null;
  if (/[01OIL]/.test(code)) return "Class codes never use O, 0, I, L or 1. Check the code again.";
  if (code.length >= 6 || /[0-9]/.test(code.slice(0, 3)) || /[A-Z]/.test(code.slice(3))) {
    return "A class code is three letters, then three numbers, like KTZ-482.";
  }
  return null;
}
