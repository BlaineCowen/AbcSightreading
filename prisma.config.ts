import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env on its own. Vercel supplies the variables at
// build time; locally they are in .env, which Node can load without dotenv.
try {
  process.loadEnvFile();
} catch {
  // no .env - fine on Vercel
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
