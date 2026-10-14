/**
 * Who has signed up lately: totals, then the newest accounts (students left
 * out, since they have no real email). Read only, inside a read-only
 * transaction, against DATABASE_URL (the shared database; bun loads .env).
 *   bun scripts/signups.ts [how many to list, default 15]
 */
const limit = Math.max(1, Number(process.argv[2]) || 15);
const sql = new Bun.SQL(process.env.DATABASE_URL!);

await sql.begin("read only", async (tx) => {
  const [t] = await tx`
    select count(*)::int as total,
           count(*) filter (where "createdAt" > now() - interval '7 days')::int as last7,
           count(*) filter (where "createdAt" > now() - interval '1 day')::int as last24h
    from "user" where "accountType" <> 'student'`;
  console.log(`Accounts: ${t.total}  ·  last 7 days: ${t.last7}  ·  last 24 hours: ${t.last24h}\n`);
  const rows = await tx`
    select to_char("createdAt" at time zone 'America/Chicago', 'Mon DD HH24:MI') as joined,
           email, "emailVerified" as confirmed, "accountType" as type
    from "user" where "accountType" <> 'student'
    order by "createdAt" desc limit ${limit}`;
  console.table(rows.map((r: Record<string, unknown>) => ({ ...r })));
});
await sql.close();
