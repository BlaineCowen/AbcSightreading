import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { serverEnv } from "./env";

/**
 * One Prisma client per server instance.
 *
 * Kept on `globalThis` so dev-server reloads reuse the connection pool rather
 * than opening a new one on every edit. The pg driver adapter means no query
 * engine binary, which is what lets this bundle into a Vercel function as is.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The app's traffic goes through Prisma Postgres's pooler (PgBouncer, in
 * transaction mode), never the direct host. The direct host allows 10
 * connections on our plan with 5 kept for Prisma, so a second function
 * instance found none left: on 10 November 2026 a class of Chromebooks signing
 * in together got "Too many database connections" for six minutes and the
 * practice page timed out. The pooler takes the same user and password on
 * `pooled.db.prisma.io`. Migrations (prisma.config.ts) keep the direct host,
 * which they need.
 */
export function pooledUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "db.prisma.io") u.hostname = "pooled.db.prisma.io";
    return u.toString();
  } catch {
    return url;
  }
}

function createClient(): PrismaClient {
  const connectionString = serverEnv("DATABASE_URL");
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  // A small pool: queries take milliseconds, so a few connections serve an
  // instance's requests, and the pooler's own limit is shared by every instance.
  const adapter = new PrismaPg({ connectionString: pooledUrl(connectionString), max: 3 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (import.meta.env.DEV) globalForPrisma.prisma = prisma;
