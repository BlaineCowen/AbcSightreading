/**
 * A player's name in a class game: "Mint Otter", made from the device's own
 * random key (Live's deviceKey), so the same device keeps the same name and
 * nothing is typed. Students may be under 13 and /live pages carry nothing
 * personal; a made-up name also spares the teacher a room of rude ones.
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

/** The device's name in games: the same every time for the same key. */
export function playerName(deviceKey: string): string {
  const h = hash(deviceKey);
  return `${COLOURS[h % COLOURS.length]} ${ANIMALS[Math.floor(h / COLOURS.length) % ANIMALS.length]}`;
}

/** Names that would collide get the end of the key, so two devices never share one on the board. */
export function distinctNames(keys: string[]): Map<string, string> {
  const byName = new Map<string, string[]>();
  for (const k of keys) byName.set(playerName(k), [...(byName.get(playerName(k)) ?? []), k]);
  const out = new Map<string, string>();
  for (const [name, ks] of byName) for (const k of ks) out.set(k, ks.length > 1 ? `${name} ${k.slice(-2).toUpperCase()}` : name);
  return out;
}

/** A short stable tag for the device on the board, so it can find its own row; the key itself is never shown. */
export const playerTag = (deviceKey: string) => hash(`tag:${deviceKey}`).toString(36);
