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

function createClient(): PrismaClient {
  const connectionString = serverEnv("DATABASE_URL");
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  // A small pool: each function instance serves few requests at once, and
  // Prisma Postgres pools on its own side.
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (import.meta.env.DEV) globalForPrisma.prisma = prisma;
