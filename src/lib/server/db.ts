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
  //
  // And never wait forever. pg's defaults wait without limit for a connection
  // and for a query, so a socket that died while the instance sat idle (the
  // pooler or the network drops it, the instance never hears) held a request
  // until Vercel killed it at 60 s: 7 times on 10 and 11 November 2026, all on
  // warm instances, during S&S CISD's band classes (Brooke Grabowski: "timing
  // out on the practice page"). Now a stuck connection fails in seconds, the
  // pool throws it away and the next request opens a fresh one.
  const adapter = new PrismaPg({
    connectionString: pooledUrl(connectionString),
    // 5, not 3, since Fluid compute (11 November 2026): one instance now serves
    // many requests at once, a class's worth, instead of one each.
    max: 5,
    connectionTimeoutMillis: 5_000, // to open one, or to wait for a free one
    query_timeout: 15_000, // a query here takes milliseconds; 15 s is a dead socket
    idleTimeoutMillis: 20_000, // close idle ones before the pooler or network forgets them
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (import.meta.env.DEV) globalForPrisma.prisma = prisma;

/**
 * Open a connection as the instance starts, not when its first request asks
 * (11 November 2026): on a new instance a page that reads the database took
 * about 1.6 s longer than one that does not (3.8 s against 2.2 s), the client
 * setting up and the first connection opening. src/middleware.ts imports this
 * module, so it runs as the function loads: an instance Vercel starts ahead of
 * time is ready before anyone arrives, and a request that starts one overlaps
 * it with the page's own loading. A failure only costs the warm start.
 */
if (process.env.VERCEL) void prisma.$queryRawUnsafe("SELECT 1").catch(() => {});
