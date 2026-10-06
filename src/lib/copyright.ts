/**
 * Every exercise the site writes carries its copyright, as the play-along
 * video carries the site's address: under the score on screen and in print
 * (and so in a saved PDF), in the MusicXML's rights, in the MIDI file's
 * copyright notice, and in the ABC file. The music is generated for each
 * reader; this says where it came from.
 */

export const copyrightLine = (date = new Date()) => `© ${date.getFullYear()} abcSightReading · abc-sightreading.com`;

/**
 * The tune with the copyright centred under it (abcjs draws `%%center`; it
 * has no `%%footer`). Added where a score is drawn or saved, never to the ABC
 * the grading and the cursor read. Once only.
 */
export function withCopyright(abc: string, o: { date?: Date } = {}): string {
  if (!abc || /%%center © \d{4} abcSightReading/.test(abc)) return abc;
  return `${abc.replace(/\s*$/, "")}\n%%vskip 6\n%%center ${copyrightLine(o.date)}\n`;
}

/**
 * The drawn copyright made small and quiet. abcjs draws %%center at 21 px
 * whatever %%textfont says, and the page scales the drawn score (Unison draws
 * at half width and doubles it), so the size is set on the SVG text after
 * drawing, divided by that scale: about 11 px on the page either way.
 */
export function styleCopyright(root: Element | null) {
  root?.querySelectorAll("text").forEach((t) => {
    if (!(t.textContent ?? "").startsWith("© ")) return;
    // How much the page has scaled the drawn score: its width on the page against its own.
    const svg = t.ownerSVGElement;
    const own = svg?.viewBox?.baseVal?.width || 0;
    const scale = svg && own ? svg.getBoundingClientRect().width / own || 1 : 1;
    t.setAttribute("font-size", String(Math.round((11 / scale) * 10) / 10));
    t.setAttribute("fill", "#6f7a8f");
    (t as SVGTextElement).style.fontFamily = "Nunito, system-ui, sans-serif";
    (t as SVGTextElement).style.fontSize = "";
  });
}

/** A MIDI file's variable-length quantity. */
function varLen(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

/**
 * The MIDI file with a copyright notice (meta event FF 02) at the start of its
 * first track, as the format asks, and that track's length grown to match.
 * A file that does not look like MIDI is returned as it was.
 */
export function midiWithCopyright(file: Uint8Array, text = copyrightLine()): Uint8Array {
  const tag = (at: number) => String.fromCharCode(...file.subarray(at, at + 4));
  if (file.length < 22 || tag(0) !== "MThd") return file;
  const headerLen = new DataView(file.buffer, file.byteOffset + 4, 4).getUint32(0);
  const track = 8 + headerLen;
  if (tag(track) !== "MTrk") return file;
  const bytes = Array.from(new TextEncoder().encode(text));
  const event = [0x00, 0xff, 0x02, ...varLen(bytes.length), ...bytes];
  const out = new Uint8Array(file.length + event.length);
  out.set(file.subarray(0, track + 8), 0);
  out.set(event, track + 8);
  out.set(file.subarray(track + 8), track + 8 + event.length);
  const view = new DataView(out.buffer, out.byteOffset + track + 4, 4);
  view.setUint32(0, view.getUint32(0) + event.length);
  return out;
}
