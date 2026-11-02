# Accounts, classes, students, rostering, gradebook, assignments, plans and billing

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching sign-in, classes, students, Classroom/ClassLink, assignments, Stripe, codes, plans or the free month.

## Accounts

Better Auth (`src/lib/server/auth.ts`) on Prisma ORM 7 + Prisma Postgres
(`DATABASE_URL`; one database shared by Development, Preview and Production).
Email/password with reset and a confirmation email (sent through Resend, not
required to sign in), plus Google when `GOOGLE_CLIENT_ID`/`_SECRET` are set.
Auth endpoints live under `/api/auth/*`; pages are `/login` (also
`?mode=signup|forgot|student`), `/reset-password`, `/account`.

Sign-up (11 October 2026, `AuthForm.svelte`): Create account sits beside what
it gives, the free month of Pro while it is on (`enabled()` passed in by
login.astro) and the free plan otherwise; a code waiting in `next`
(/account?code=X) is named on the form. A new account lands on `next` (home
by default) and WelcomeNote says hello once (sessionStorage for email,
`?welcome=1` for a new Google account via `newUserCallbackURL`) with the one
step to the free month. The confirmation email names the month, and its link
opens `/account?confirmed=1#plan`, where FreeMonthOffer starts it (or sends
the link again). `/account` is one tab at a time for everyone but students:
Account and plan (#plan, #quote), Classes (#students), Rhythm syllables
(#syllables); the hash picks the tab, so old links still land.

Classes (`Class`, `ClassProgress`; `/api/classes`, `src/lib/classes.ts`) are
signed-in only: a director's choirs and which presets each has passed, keyed
`step:<id>`, `uil:UIL n`, `nyssma:<level id>`, `track:<step id>:<part>` or
`saved:<preset id>`. Picked beside the preset on the practice pages ("Mark
passed"). Since 8 October 2026 each class follows one course
(`Class.course`, `src/lib/class-course.ts`, tests `class-course.test.ts`):
abcStepByStep, an instrument course, or "own" (built from the teacher's
presets). UIL and NYSSMA are levels by grade, not courses (Blaine), so they
are never a class's course, but any level can be added to a checklist. On
`/account` each class is a card: its course's checklist with dates, how far
through, and Next with a Practice link (`?step=`, `?track=`, `?nyssma=`,
`?preset=`, and Choral's `?uil=`). Customize hides, reorders and adds steps
for that class only (`Class.courseSteps`, a list of preset keys; null is the
course as written; a new course starts over). Ticks are keyed by preset, so
no change to the list loses one.

A teacher's own rhythm syllables live in `UserPreference.rhythmSyllables`
(`/api/preferences`, `src/lib/syllable-prefs.ts`), edited on `/account` and
offered as "Mine" on the Unison page. The set is plain data
(`CustomSyllables` in `rhythm-syllables.ts`) sent with each exercise as
`customSyllables` beside `syllableSystemId: "custom"`, and turned into a system
by `customSyllableSystem`. Its first template must equal built-in Kodály figure
for figure - `tests/unit/custom-syllables.test.ts` holds it to that.

Educator accounts and students (`src/lib/server/students.ts`, rules in
`src/lib/educator-policy.ts`, `roster.ts`, `join-code.ts`, `seats.ts`; tests in
`tests/unit/students.test.ts`): `user.accountType` is standard, educator or
student. An educator's classes get join codes (KTZ-482); students join at
`/join` or the teacher adds a roster (pasted names or CSV) and prints login
cards. Student accounts have **no email** - they may be under 13 - and sign in
at `/login?mode=student` with class code, username and password (Better Auth's
username plugin; the stored username is `<code>.<name>`, the email a
never-delivering `@students.abc-sightreading.invalid`). Student pages load no
analytics and no feedback form (Layout.astro). Permission checks read
`accountType` from the database (`accountTypeFor`), not the five-minute session
cookie. Deleting a teacher deletes the student accounts they made. 100 seats per
educator (seat packs: stage 4, with Stripe).

Each class card's **Add students** panel (open by itself while the class is
empty; 13 October 2026, Blaine: adding students without Google Classroom was
not clear) offers three ways: They join with a code (the address and code in
steps, Copy the join link, Show on the board: the code full screen for a
projector), I make their logins (paste names or a CSV, print the cards, which
sit on the class), and Google Classroom where it is set up. **Print login cards**
(16 October 2026, Blaine: by class or all together, easily): on each class
with logins the teacher made, and "for all classes" at the top. Passwords
are stored one way, so printing makes new ones (`POST
/api/classes/<id>/cards`; the teacher is told first, and students who made
their own login are left out); eight cards to a letter page with the steps
to sign in, each class from a new page. The cards print from the end of
<body> (`toBody`): inside the Classes tab they printed blank, since
globals.css hides every `.tab-panel` in print. A class with no
code says how to get one. `bun run scripts/demo-classes.ts` lists, creates or
removes "Demo: ..." classes with roster-made students on a teacher's account.

**Rosters from Google Classroom and ClassLink** (10 October 2026; setup
outside the code in notes/rostering-setup.md). Google Classroom: on a class
card, Import from Google Classroom links the teacher's Google account with
`classroom.courses.readonly` and `classroom.rosters.readonly`
(`authClient.linkSocial`; `allowDifferentEmails`, since a school Google
account rarely matches the account's email), lists their active classes
and brings one in (`src/lib/classroom.ts` `planSync`, server
`src/lib/server/classroom.ts`, tests `classroom.test.ts`): a student account
per new student, linked to the Google account by its ID (an `account` row,
providerId google, accountId Classroom's userId, the same number as the
sign-in's subject), an existing one enrolled, and those who have left only
listed, never removed. The class remembers it (`Class.rosterSource`
`google:<course id>`), so Sync with Google Classroom needs no picking.
Students sign in on the Student tab with Sign in with Google: Google
sign-in makes an account only when asked (`disableImplicitSignUp`; the
other tabs pass `requestSignUp`), so that button only finds accounts a
teacher brought in. ClassLink: the genericOAuth plugin when
`CLASSLINK_CLIENT_ID`/`_SECRET` are set; keyed by ClassLink's UserId; a
student gets a student placeholder email (`classlinkEmail`) and so a
student account (a `databaseHooks.user.create` rule: a student email is a
student account), a teacher their district email but never linked to an
existing account by it, and an educator account from the start (auth.ts
`classlinkTeacher`; no plan comes with it, so students join once the
Educator plan is on, by a code or a school quote, as for anyone), with Pro
free through 31 May 2027 (`grantClasslinkPro`, src/lib/server/classlink.ts:
an AccessGrant under the untypable code `CLASSLINKTEACHERS`). A ClassLink
teacher counts as confirmed for the founding-teacher offer (ClassLink leaves
the email unconfirmed), and the signed-in home shows any teacher who may
join a founders card (index.astro `founders`, HomeDashboard).
Signing in through ClassLink was tested end to end on 16 October 2026 with
ClassLink's test district (cltest): a teacher and a student account made, the
student with no email and no tokens kept, signing in again reusing each.
ClassLink's portal registered one redirect URI, the launch URL
(`/classlink`), and would not edit it, so the sign-in comes back there and
goes on to our callback (auth.ts `redirectURI`); only production can sign in. `/classlink` is the LaunchPad tile's launch URL.
The Sign in with ClassLink button is off on production's /login until a real
district has signed in with it (login.astro `showClasslink`, 26 October 2026);
the tile still works, and /founders no longer offers ClassLink. A
student's Google or ClassLink tokens are never kept (`stripStudentTokens`:
the ID token holds their email). Each assignment has Share to Google
Classroom (`shareToClassroomUrl`, no key needed). Whole ClassLink rosters
(OneRoster) wait for a district to approve the app.

**The gradebook** (10 October 2026; rules `src/lib/gradebook.ts`, tests
`gradebook.test.ts`, the grid `Gradebook.svelte` under a class's Assignments
on /account). A row a student, a column an assignment, oldest first; each cell
the best graded attempt (Blaine: practice never costs a student), or where
nothing is graded yet and the assignment has minutes, the share of them done
(shown with %); blank, never 0, when not started. Download CSV gives the same
grid with usernames and the average (a BOM for Excel; a name starting = + - @
is defused). Graded attempts now come from sight-reading assignments too: a
student's Pitch & rhythm or clapped/tapped run on an assigned exercise on the
Unison page is a `PieceAttempt` (the table keeps its name) with `partId` the
mode (sing, clap, tap), `exercise` the link to the exercise sung (each is
new), its marks and recording (none when tapped), as many as they like; Note
by note is practice and is not sent. The setup card says what is kept
(`keptNote`), the results whether it reached the teacher. The teacher's Best
column opens the attempt: its recording and the exercise.

**Grades to Google Classroom** (`src/lib/server/classroom-grades.ts`,
`/api/assignments/[id]/classroom`): for a class brought in from Classroom,
"Post to Google Classroom" makes the assignment coursework there (out of 100,
a link back, the due date while ahead), and "Send grades to Classroom" sends
each linked student's gradebook grade as a draft grade, which the teacher
returns in Classroom. Classroom lets an app grade only coursework it made, so
a link shared by hand cannot be graded. It needs one more permission,
`classroom.coursework.students`, asked for (linkSocial) the first time; Google
counts it as sensitive, so until the app is verified for it teachers see the
unverified-app warning on that step (notes/rostering-setup.md 1e). ClassLink
grades (OneRoster) wait for a district.

**Creating an assignment** (10 October 2026; `AssignmentWizard.svelte`,
handoff `src/lib/assignment-draft.ts`, tests `assignment-draft.test.ts`):
Create assignment at the top of /account's Students (for any classes; the
home page links `?assign=new`) and on each class card. Kind (sight reading or
a song), then what: a preset (steps, UIL, NYSSMA, TMEA, saved) or Custom on
either page, and New exercises each time or Same exercise for everyone; then
classes (several at once: one assignment each), minutes, due date, note,
Send. Custom or one exercise needs the page: the draft goes in
sessionStorage, the page opens with `?assigning=1` and AssigningBar's Use
these settings / Use this exercise brings it back (`?assign=resume`). Custom
is `custom:unison|choral` with the settings as a saved preset's; one
exercise is `params.exercise` (packed), which the student's page opens with
New exercise switched off. A song is AssignPieceForm, with an upload in place.
Every song assigned goes into its class's library (`ClassPiece`, kept after
the assignment, gone with the class or piece); students open it whole, any
part, ungraded, from `/library` and their home page (PieceViewer `library`).

A preset holds every setting on its page (Choral `getCurrentParams`, Unison
`currentOptions`): generation, display (lyrics, chords, cursor, hidden and
muted voices), sound (instrument, transposition, volumes) and the metronome: its
subdivision, accent, sound, on/off with the music and level
(`src/lib/preset-click.ts`).
All of it counts toward "edited". Fields added later are optional, so an older
preset loads and leaves what it lacks alone. The one thing a Choral preset does
not keep is full length, which only exists while a UIL level is chosen.

Saved presets go to the account when signed in (`/api/presets`,
`src/lib/preset-sync.ts`) and to localStorage when not - signed-out behaviour
is the old one. The first signed-in load of each list imports that browser's
presets once; the server dedupes by name + creation time.

- Schema: `prisma/schema.prisma`. After changing it: `bun run db:migrate`
  (creates a migration and applies it - **to the shared database**), commit the
  migration, and production picks it up via `bun run db:deploy`. Safer for an
  additive change: write the SQL with `prisma migrate diff --from-schema <old>
  --to-schema prisma/schema.prisma --script`, read it, and apply with
  `bun run db:deploy`, which never resets. (That is how the classes tables went
  in.)
- The generated client is in `src/generated/` (gitignored; `postinstall` runs
  `prisma generate`).
- Billing: Better Auth's Stripe plugin (auth.ts, only when `STRIPE_SECRET_KEY`
  and `STRIPE_WEBHOOK_SECRET` are set; webhook `/api/auth/stripe/webhook`).
  Pro $19.99/yr and Educator $99/yr, found by price lookup key
  (`pro_yearly`, `educator_yearly`, `seat_pack_25` - `src/lib/server/stripe.ts`),
  so the sandbox and live accounts need the same keys and no price ids live in
  code. Prices are tax-inclusive: everyone pays $19.99, $99 or $25 flat, and
  any tax owed comes out of it. Checkout asks Stripe Tax only once it is
  active (`taxReady`); a school is billed tax-exempt through a quote. Pro -> Educator is `subscription/upgrade` with
  the existing `subscriptionId`. Seat packs are a one-time checkout
  (`/api/billing/seats`) granted by the webhook into `SeatGrant`, for a year.
- School quotes (`src/lib/server/quotes.ts`, rules in `src/lib/quote.ts`,
  `SchoolQuote.svelte` on `/account`), for Pro or (once on sale) Educator: a
  Stripe customer for the school (its purchasing contact, address, tax
  exemption - never the teacher's own customer), a finalized Stripe quote,
  net 30. One click emails the PDF straight to up to three purchasing
  addresses, the teacher copied and replies going to them; only from a
  confirmed email. Entering the PO number accepts it: the subscription
  starts, its first invoice carries the PO and goes to the school, and the
  plan starts at once - the subscription row is written by us, since the
  plugin cannot map a school's customer to the teacher. `FEEDBACK_TO` is told
  of every PO. A daily Vercel cron (`/api/cron/po-invoices`, vercel.json;
  set `CRON_SECRET`) reminds purchasing and the teacher a week before the
  invoice is due and, if it falls due unpaid, cancels the subscription, voids
  the invoice and ends the plan (`reviewPoInvoices`; renewals the same).
- One year at a time (7 October 2026; rules `src/lib/plan-ending.ts`, tests
  `plan-ending.test.ts`; server `src/lib/server/plan-ending.ts`). A school
  quote is **one year only** by default (`Quote.renews`, false on new quotes;
  "Renew each year" on the form): on the PO the subscription is set to end at
  its term (`cancel_at_period_end`) and nothing is invoiced again. A card
  plan has an Automatic renewal On / Off switch on /account
  (`/api/billing/renewal`). A plan that will not renew (those, and a code's
  months) is "ending" when nothing else carries the account on at that plan:
  the daily cron emails the teacher 30 and 7 days before (purchasing copied
  for a school; once each, `PlanNotice`), and `PlanEndingBanner` shows on
  /account and both practice pages for the last 30 days with the one step
  that renews it: turn renewal on, or a **renewal quote** filled in from
  last year's (`/api/quotes/<id>/renewal`, `?renew=<id>` on /account; a plan
  that will not renew may be quoted again). The new year starts when its PO
  is entered. The same cron now keeps our record of a renewing school
  subscription's term in step with Stripe's (it was written once, at accept,
  so a school that paid its renewal would have lost the plan and its seats
  after the first year).
- **A free month of Pro** (8 October 2026; rules `src/lib/free-month.ts`,
  tests `free-month.test.ts`; server `src/lib/server/free-month.ts`,
  `/api/free-month`, `FreeMonthOffer.svelte` on /account's free plan): no
  card, it simply ends after 30 days (an AccessGrant with no code, so
  `planFor` reads it and plan-ending.ts warns in its last week, kind
  "trial"). Once per person, for accounts that never had Pro (any
  subscription or grant ever, complimentary, or a teacher's class). Against
  one person making many accounts: the email confirmed and not a throwaway
  domain; one per email key (`emailKey`: lower case, "+tags" dropped, Gmail
  dots dropped and googlemail.com read as gmail.com), unique in
  `FreeMonthClaim`; one per browser (an HttpOnly `abc_fm` cookie and a saved
  id, both hashed); `NETWORK_LIMIT` (5) a month per network (the address
  from `x-vercel-forwarded-for`, hashed). Better Auth's own sign-up rate limit
  sits in front of all of it. `FREE_MONTH_ENABLED=0` switches the offer off.
  Checked end to end on a local server and database (14 checks, 8 October).
  Promoted while on (`FreeMonthPromo.svelte`, which asks /api/free-month and
  shows nothing to someone who cannot claim it): a "Limited time" strip atop
  the home page, a line on the sign-up form, a dismissible note on both
  practice pages for signed-in accounts that can claim it, and a badge on
  /pricing's Pro card. `FREE_MONTH_UNTIL` (an ISO date) ends the offer by
  itself after that day, and the note then says "until <date>".
- **Founding teachers** (16 October 2026; rules `src/lib/founders.ts`,
  tests `founders.test.ts`; server `src/lib/server/founders.ts`,
  `/api/founders`, the page `/founders` with `FoundersJoin.svelte`; the
  pricing page's Educator card links it while Educator is not on sale).
  A teacher's account with a confirmed, non-throwaway email joins once
  before the offer closes (`FOUNDERS_CLOSE`, default 31 January 2027;
  `FOUNDERS_ENABLED=0` switches it off) and gets Educator free through
  31 May 2027 with 300 seats: an AccessGrant under the access code
  `FOUNDINGTEACHERS` (maxUses 0, so typing it gives nothing; the grant is
  what marks a founder) and a SeatGrant of 200 beside the plan's 100, both
  ending with it. After that, Educator bought with a card on that account
  carries the Stripe coupon `founding_teacher_50` (50% off, forever; made
  on first use) through `getCheckoutSessionParams` in auth.ts, in place of
  the usual code box. **Only teachers** (16 October 2026, Blaine: how do we
  prove someone is a teacher?): a founder's students get Pro, so a
  stranger with 300 seats could hand out 300 free Pros. A school email
  (`isSchoolEmail`: isd/usd district names, k12, schools, sd and a number,
  a public-schools .edu, edu/sch/school abroad; never a university .edu or
  personal mail) or a ClassLink sign-in joins at once; anyone else applies
  (`FounderApplication`: school, district, role, a page that lists them),
  `FEEDBACK_TO` is emailed, and the owner approves on /admin, which joins
  them and emails them. One founder per person (`emailKey`, as the free
  month). A founder whose Pro subscription still renews is told so on
  joining. Not yet applied to a Pro to Educator upgrade of an
  existing subscription, nor to school quotes. Checked end to end on a
  local server with a throwaway account (16 October 2026); the coupon is
  untested until Educator goes on sale.
- Assignments and practice time (rules `src/lib/practice.ts`, tests
  `practice.test.ts`; server `src/lib/server/practice.ts`): a teacher assigns a
  class one preset (step, UIL level or saved - a saved one is copied in) for N
  minutes, optionally due. Students see them on `/account` (student sign-in
  lands there); `?assignment=<id>` on a practice page applies the preset, locks
  the tab content (`inert`) and hides the preset menu. `practice-tracker.ts`
  counts a second when the page is visible and touched, or playback, the
  metronome, drone or tuner is running, within 5 minutes; it reports every 30 s
  to `/api/practice`, which credits at most the claim and at most the time
  since the student's last credit (`PracticeClock`), so tabs don't add up.
  Logged only for accounts in a class, all practice, not just assigned;
  minutes, exercise counts and dates only, deleted after 395 days.
- Codes (rules `src/lib/codes.ts`, tests `codes.test.ts`; server
  `src/lib/server/codes.ts`; owner's page `/admin`, for `ADMIN_EMAILS` (or `ADMIN_EMAIL`) only,
  404 to anyone else): an access code (`AccessCode`) gives Pro or Educator free
  for N days from use - `AccessGrant` rows, read by `planFor` beside
  subscriptions. Links are `/account?code=X`, which survive sign-in/sign-up.
  An affiliate code is a Stripe coupon (duration once) plus promotion code
  made from `/admin`; `recordAffiliateSale` (Stripe webhook,
  `checkout.session.completed`) records the advertiser's cut of what the
  checkout paid before tax in `AffiliateSale`. Payouts are by hand; `/admin`
  marks them paid.
  An advertiser's link, `/?ref=CODE` on any page, keeps the code in an
  HttpOnly cookie for 60 days (middleware.ts, rules in `src/lib/referral.ts`,
  tests `referral.test.ts`); that visitor's Pro checkout then has the discount
  applied (`referralFor` in the checkout params) instead of the box to type a
  code, and pricing and the account page say so (`ReferralNote`). `/admin`
  shows each advertiser's link.
- **Educator is not on sale yet**: `EDUCATOR_ON_SALE` in `src/lib/plan.ts` is
  false, so pricing, the account page, the home page and the guides say
  "coming soon"; checkout (auth.ts hook), quotes and seat packs refuse it on
  the server. Access codes still grant it (beta testers). Flip it to open sales.
- Plans: the rules are in `src/lib/plan.ts` (tests: `billing.test.ts`), the
  database side in `src/lib/server/plan.ts` - `planFor`, `hasPremium`,
  `hasEducatorPlan`. Gate by those, never by reading billing fields. A student
  of a paying educator has Pro; `COMP_EMAILS` (comma-separated) gives Educator
  free. `accountType: "educator"` is set when the Educator plan is paid for and
  stays after it lapses, but seats drop to 0: no one new joins.
- Monthly exercises: 10 signed out (counted in localStorage - a soft nudge), 50
  on a free account (`GenerationUsage`, `/api/usage`, conditional increment),
  unlimited on Pro/Educator. Both practice pages ask `mayGenerate()`
  (`src/lib/usage.ts`) before generating and `countGeneration()` once the score
  is drawn, so an exercise that could not be written costs nothing; `GenerationLimit.svelte` says what is
  left. Pro also unlocks the Tools wheel and `/tuner`.
