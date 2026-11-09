/**
 * What people did on a day, and who came back. Read only, inside a read-only
 * transaction, against DATABASE_URL (the shared database; bun loads .env).
 * Days are US Central. Blaine's own accounts are left out (OWNER).
 *   bun scripts/activity.ts [YYYY-MM-DD, default today]
 */
const sql = new Bun.SQL(process.env.DATABASE_URL!);
const OWNER = "%cowen%";
const day = process.argv[2] ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const local = (col: string) => `((${col} at time zone 'UTC') at time zone 'America/Chicago')`;
const show = (title: string, rows: unknown[]) => {
  console.log(`\n## ${title}`);
  rows.length ? console.table(rows.map((r) => ({ ...(r as object) }))) : console.log("(none)");
};

await sql.begin("read only", async (tx) => {
  const q = (text: string) => tx.unsafe(text, [day]);
  show("Accounts made that day", await q(`
    select to_char(${local('"createdAt"')}, 'HH24:MI') at, email, "accountType" type, "emailVerified" ok
    from "user" where ${local('"createdAt"')}::date = $1::date and email not ilike '${OWNER}' order by "createdAt"`));
  show("Signed in that day (sessions started or refreshed)", await q(`
    select u.email, u."accountType" type, to_char(${local('u."createdAt"')}, 'Mon DD') joined,
           count(*)::int sessions, to_char(max(${local('s."updatedAt"')}), 'HH24:MI') last
    from session s join "user" u on u.id = s."userId"
    where ${local('s."updatedAt"')}::date = $1::date and u.email not ilike '${OWNER}'
    group by 1,2,3 order by max(s."updatedAt") desc`));
  show("Exercises opened that day (signed in)", await q(`
    select u.email, r.page, count(*)::int n, string_agg(distinct r.title, ' | ') titles
    from recent_exercise r join "user" u on u.id = r."userId"
    where ${local('r."createdAt"')}::date = $1::date and u.email not ilike '${OWNER}'
    group by 1,2 order by 3 desc`));
  show("Student practice that day", await q(`
    select p.page, count(distinct p."studentId")::int students, sum(p.seconds)/60 minutes, sum(p.exercises)::int exercises
    from practice_time p where p.day = $1 group by 1`));
  show("Classes, enrollments, assignments, live rooms that day", await q(`
    select 'class' kind, count(*)::int n from class c join "user" u on u.id=c."userId" where ${local('c."createdAt"')}::date=$1::date and u.email not ilike '${OWNER}'
    union all select 'enrollment', count(*)::int from enrollment where ${local('"createdAt"')}::date=$1::date
    union all select 'assignment', count(*)::int from assignment where ${local('"createdAt"')}::date=$1::date
    union all select 'live room', count(*)::int from live_room where ${local('"startedAt"')}::date=$1::date
    union all select 'founder joined', count(*)::int from access_grant g join access_code a on a.id=g."codeId" where a.code='FOUNDINGTEACHERS' and ${local('g."createdAt"')}::date=$1::date
    union all select 'preset saved', count(*)::int from preset where ${local('"createdAt"')}::date=$1::date`));
  // Retention: of the non-student accounts, which came back on a later day.
  show("Came back: non-student accounts by sign-up week", await tx.unsafe(`
    with u as (select id, ${local('"createdAt"')}::date d0 from "user" where "accountType" <> 'student' and email not ilike '${OWNER}'),
    act as (
      select "userId" uid, ${local('"updatedAt"')}::date d from session
      union select "userId", ${local('"createdAt"')}::date from recent_exercise
      union select "userId", ${local('"updatedAt"')}::date from preset)
    select to_char(date_trunc('week', u.d0), 'Mon DD') week, count(distinct u.id)::int signed_up,
      count(distinct u.id) filter (where exists (select 1 from act where act.uid=u.id))::int ever_used,
      count(distinct u.id) filter (where exists (select 1 from act where act.uid=u.id and act.d > u.d0))::int came_back_later,
      count(distinct u.id) filter (where exists (select 1 from act where act.uid=u.id and act.d >= u.d0 + 7))::int after_a_week
    from u group by date_trunc('week', u.d0) order by date_trunc('week', u.d0) desc limit 8`));
  show("Educators and their classes", await tx.unsafe(`
    select u.email, to_char(${local('u."createdAt"')}, 'Mon DD') joined,
      (select count(*) from class c where c."userId"=u.id)::int classes,
      (select count(*) from enrollment e join class c on c.id=e."classId" where c."userId"=u.id)::int students,
      (select count(*) from assignment a join class c on c.id=a."classId" where c."userId"=u.id)::int assignments,
      (select to_char(max(${local('s."updatedAt"')}), 'Mon DD') from session s where s."userId"=u.id) last_seen
    from "user" u where u."accountType"='educator' and u.email not ilike '${OWNER}' order by u."createdAt" desc`));
});
await sql.close();
