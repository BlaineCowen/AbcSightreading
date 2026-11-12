/**
 * Dead pooled connections, simulated (12 November 2026: on main's first night
 * the pooler dropped all of an instance's connections at once and each retry
 * took the next dead one; db.ts now drops every idle connection on the first).
 *
 * A relay in front of a LOCAL Postgres goes silent on its open connections
 * (sockets stay open, nothing comes back), as a frozen Vercel instance sees a
 * pooler that forgot them; connections opened after the freeze work. Never
 * point this at the shared database.
 *
 *   docker run -d --name abc-deadconn -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:18
 *   bunx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script | docker exec -i abc-deadconn psql -q -U postgres
 *   bun scripts/check-dead-connections.ts     # all fulfilled in about 5 s
 *   docker rm -f abc-deadconn
 */
// The relay.
const sockets: { frozen: boolean }[] = [];
Bun.listen({
  hostname: "127.0.0.1", port: 55433,
  socket: {
    async open(client) {
      const st = { frozen: false };
      sockets.push(st);
      (client as any).st = st;
      (client as any).q = [];
      const up = await Bun.connect({ hostname: "127.0.0.1", port: 55432, socket: {
        data(_s, d) { if (!st.frozen) client.write(d); },
        close() { if (!st.frozen) client.end(); },
      }});
      (client as any).up = up;
      for (const d of (client as any).q) up.write(d);
    },
    data(client, d) {
      const c = client as any;
      if (c.st.frozen) return;
      if (c.up) c.up.write(d); else c.q.push(Buffer.from(d));
    },
    close(client) { if (!(client as any).st.frozen) (client as any).up?.end(); },
  },
});
process.env.DATABASE_URL = "postgres://postgres:pw@127.0.0.1:55433/postgres";
process.env.VERCEL = "1";
const { prisma } = await import("../src/lib/server/db.ts");
await Bun.sleep(300);
// Five connections open, as a busy instance has.
await Promise.all(Array.from({ length: 5 }, () => prisma.$queryRawUnsafe("select 1 as n from pg_sleep(0.3)")));
console.log("open connections through relay:", sockets.length);
for (const s of sockets) s.frozen = true;
console.log("froze them all");
const t = Date.now();
const r = await Promise.allSettled([prisma.session.findFirst(), prisma.user.count(), prisma.session.findMany({ take: 1 })]);
console.log(r.map((x) => x.status + (x.status === "rejected" ? " " + String((x as any).reason).slice(0, 80) : "")), `${Date.now() - t} ms`);
if (r.some((x) => x.status === "rejected")) {
  console.error("FAIL: a read failed on dead connections");
  process.exit(1);
}
const t2 = Date.now();
await prisma.user.count();
console.log("next request", `${Date.now() - t2} ms`);
process.exit(0);
