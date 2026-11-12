// Kept apart from db.ts so it can be used (and tested) without opening a database.

/** A connection that died, not a query that was wrong. */
export function isConnectionError(e: unknown): boolean {
  const seen: string[] = [];
  let x: unknown = e;
  for (let i = 0; i < 4 && x; i++) {
    seen.push(x instanceof Error ? `${x.name} ${x.message}` : String(x));
    x = (x as { cause?: unknown }).cause;
  }
  return /Query read timeout|timeout exceeded when trying to connect|Connection terminated|connection error|ECONNRESET|EPIPE|ETIMEDOUT|socket hang up/i.test(seen.join(" "));
}
