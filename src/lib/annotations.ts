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
 * The same exercise with its syllables and chord symbols removed.
 *
 * Two things go:
 * - `w:` lyric lines, which carry solfège
 * - `"..."` tokens in the music, which carry rhythm syllables (`"_ta"`) and
 *   chord symbols (`"^V⁷"`)
 *
 * Anything the string does not contain is simply not there to remove, so this is
 * safe to call on an exercise generated without annotations in the first place.
 */
export function withoutAnnotations(abc: string): string {
  const marker = abc.match(BODY_MARKER);
  if (!marker || marker.index === undefined) return abc;

  const splitAt = marker.index + marker[0].length;
  const header = abc.slice(0, splitAt);
  const body = abc.slice(splitAt);

  const stripped = body
    .split("\n")
    // A lyric line is the whole line, so it goes rather than being emptied -
    // an empty `w:` would still claim to be lyrics for the voice above it.
    .filter((line) => !line.trimStart().startsWith("w:"))
    // Annotations and chord symbols are quoted tokens sitting against the note
    // they belong to. Removing them leaves the note untouched.
    .map((line) => line.replace(/"[^"]*"/g, ""))
    .join("\n");

  return header + stripped;
}

/** Whether a string carries anything `withoutAnnotations` would remove. */
export function hasAnnotations(abc: string): boolean {
  return abc !== withoutAnnotations(abc);
}
