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
  // Migrations need a direct connection, not a transaction pooler. On Neon,
  // DATABASE_URL is the pooled host (-pooler) and DIRECT_URL the direct one;
  // with no DIRECT_URL (Prisma Postgres, whose DATABASE_URL is already direct)
  // it falls back to DATABASE_URL as before.
  datasource: { url: process.env.DIRECT_URL || env("DATABASE_URL") },
});
