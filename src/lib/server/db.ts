import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../../generated/prisma/client";
import { serverEnv } from "./env";
import { isConnectionError } from "./db-errors";

/**
 * One Prisma client per server instance.
 *
 * Kept on `globalThis` so dev-server reloads reuse the connection pool rather
 * than opening a new one on every edit. The pg driver adapter means no query
 * engine binary, which is what lets this bundle into a Vercel function as is.
 */
const globalForPrisma = globalThis as unknown as { prisma?: Db };

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
    // pg already treats sslmode=require as verify-full, and says so in a
    // warning on stderr, which Vercel logs as an error on every new instance
    // and which buried the real errors (12 November 2026). Saying verify-full
    // is the same check, without the warning.
    const mode = u.searchParams.get("sslmode");
    if (mode === "require" || mode === "prefer" || mode === "verify-ca") u.searchParams.set("sslmode", "verify-full");
    return u.toString();
  } catch {
    return url;
  }
}

/** Reads, which are safe to send again. Writes never are: one may have landed. */
const READS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);

/**
 * A read that met a dead connection is sent once more (12 November 2026).
 * Vercel freezes an instance between requests and its pooled sockets can die
 * meanwhile without it hearing: the idle timer below cannot run while it is
 * frozen. The first query after waking then waited out query_timeout and
 * failed, an error page on /tuner twice that evening. The pool has thrown
 * that connection away by then, but not the others: the first night on main
 * (03:48 UTC, 12 November 2026) the pooler had dropped all of an instance's
 * connections at once and each retry took the next dead one, 20 s of failures
 * for one student. So every idle connection goes too (dropIdle), and the
 * second try opens a fresh one.
 */
function withRetry(client: PrismaClient) {
  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await query(args);
        } catch (e) {
          if (!READS.has(operation) || !isConnectionError(e)) throw e;
          const dropped = dropIdle();
          console.warn(`db: ${model}.${operation} sent again after a dead connection (${dropped} idle dropped)`);
          return query(args);
        }
      },
    },
  });
}
export type Db = ReturnType<typeof withRetry>;

/** The pool, ours rather than the adapter's, so dropIdle can reach it. */
let pool: pg.Pool | undefined;

/**
 * Closes every idle connection: after one turned out dead, the rest most
 * likely are too (they died together). pg-pool has no public call for it;
 * `_idle` and `_remove` are what its own idle timer uses (pg-pool 3.x).
 */
function dropIdle(): number {
  const p = pool as unknown as { _idle?: { client: pg.PoolClient }[]; _remove?: (c: pg.PoolClient) => void } | undefined;
  const idle = [...(p?._idle ?? [])];
  for (const item of idle) {
    try {
      p!._remove!(item.client);
    } catch {
      // already gone
    }
  }
  return idle.length;
}

function createClient(): Db {
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
  pool = new pg.Pool({
    connectionString: pooledUrl(connectionString),
    // 5, not 3, since Fluid compute (11 November 2026): one instance now serves
    // many requests at once, a class's worth, instead of one each.
    max: 5,
    connectionTimeoutMillis: 5_000, // to open one, or to wait for a free one
    // A query here takes milliseconds, so 5 s is a dead socket, and the read
    // is then sent again (withRetry): about 5 s slow at worst, not an error.
    // Scripts run outside Vercel keep longer.
    query_timeout: process.env.VERCEL ? 5_000 : 15_000,
    idleTimeoutMillis: 20_000, // close idle ones before the pooler or network forgets them
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  return withRetry(new PrismaClient({ adapter }));
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
