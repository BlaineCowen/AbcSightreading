/**
 * Where to go after signing in, from a `?next=` parameter - but only a path
 * on this site. Anything else (another origin, `//evil.example`, a
 * `javascript:` URL) falls back, so the sign-in page cannot be used to bounce
 * people somewhere they did not mean to go.
 */
export function safeNext(raw: string | null | undefined, fallback = "/choral-sightreading"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}
