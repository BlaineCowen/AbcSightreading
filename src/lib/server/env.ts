/**
 * Server-side environment, read at request time.
 *
 * Same reasoning as feedback-email.ts: every page is `output: "server"`, so
 * read `process.env` when asked rather than letting Vite inline a build-time
 * value - that would bake secrets into the server bundle, or bake in
 * `undefined` from a build environment that lacked them.
 *
 * Under `astro dev`, Vite puts .env into `import.meta.env` and not into
 * `process.env`, and Better Auth reads BETTER_AUTH_SECRET / BETTER_AUTH_URL
 * from `process.env` itself. So in dev only, load .env.local and then .env
 * into `process.env` once, .env.local first so it wins as it does for Vite.
 * `loadEnvFile` never overwrites a variable that is already set. (Until 13
 * November 2026 only .env was loaded, so after the move to Neon the dev
 * server kept reading .env's DATABASE_URL, the old database.)
 */
if (import.meta.env.DEV) {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // not there - the variables must come from the other file or the shell
    }
  }
}

export function serverEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
