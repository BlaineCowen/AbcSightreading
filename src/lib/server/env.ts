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
 * from `process.env` itself. So in dev only, load .env into `process.env`
 * once. `loadEnvFile` never overwrites a variable that is already set.
 */
if (import.meta.env.DEV) {
  try {
    process.loadEnvFile();
  } catch {
    // no .env - the variables must come from the shell
  }
}

export function serverEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
