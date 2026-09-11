/**
 * Stripping the teaching aids back out of an assembled ABC string.
 *
 * The choral generator can re-assemble itself with different display options
 * (see `render` in generateChoral.ts), which is better because it can *add*
 * annotations as well as remove them. The unison generator cannot: its ABC is
 * built deep inside `createConcatString` and the note data is not kept. But the
 * annotated string is, so hiding is a matter of taking things back out - and
 * showing them again is just rendering the original.
 *
 * Both generators mark where the header ends, and only the body is touched:
 * the header carries `%%percmap`, `%%annotationfont` and `V:`/`K:` lines that
 * must survive untouched.
 */

/** Both generators emit a line like `%   End of header, start of tune body:`. */
const BODY_MARKER = /^%.*start of tune body:/m;

/**
 * Split an assembled exercise into the header, which must survive untouched, and
 * the body, which is the only part these rewrite.
 */
function splitBody(abc: string): [string, string] | null {
  const marker = abc.match(BODY_MARKER);
  if (!marker || marker.index === undefined) return null;
  const splitAt = marker.index + marker[0].length;
  return [abc.slice(0, splitAt), abc.slice(splitAt)];
}

/**
 * The same exercise without its lyric lines - the solfège under each staff.
 *
 * A lyric line goes whole rather than being emptied: an empty `w:` would still
 * claim to be lyrics for the voice above it.
 */
export function withoutLyrics(abc: string): string {
  const parts = splitBody(abc);
  if (!parts) return abc;
  const [header, body] = parts;
  return (
    header +
    body
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("w:"))
      .join("\n")
  );
}

/**
 * The same exercise without its quoted text - chord symbols above the staff in
 * choral (`"^V⁷"`), rhythm syllables in unison (`"_ta"`).
 *
 * They are tokens sitting against the note they belong to, so removing them
 * leaves the note untouched.
 */
export function withoutQuotedText(abc: string): string {
  const parts = splitBody(abc);
  if (!parts) return abc;
  const [header, body] = parts;
  return header + body.replace(/"[^"]*"/g, "");
}

/**
 * Both at once.
 *
 * The two are separately controllable - a director wants the chord symbols
 * without the solfège as often as neither - so this exists for asking whether a
 * string carries anything at all, not as the way to hide things.
 */
export function withoutAnnotations(abc: string): string {
  return withoutQuotedText(withoutLyrics(abc));
}

/** Whether a string carries anything the strippers above would remove. */
export function hasAnnotations(abc: string): boolean {
  return abc !== withoutAnnotations(abc);
}
