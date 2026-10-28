# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

abcSightReading: sight-reading exercises for choirs and instrumentalists
(Unison, Choral, Piano, Ensemble pages), with grading, a tuner, play-along
videos, classes and assignments. Astro on Vercel, Svelte components, abcjs.

The detail for each area lives in `docs/claude/` (moved there word for word
on 27 October 2026, when this file reached 166 KB). **Before working in an
area, read its file** (the index below); it holds the history, the measured
numbers and the reasons behind the code, and it is kept up to date the same
way this file used to be: when you change an area, update its file.

## Commands

This project uses **bun** (`bun.lockb` is committed, and `package.json` declares
`engines.bun >= 1.2.0`). Use bun for installs so the lockfile stays
authoritative: running `npm install` here produces a stray `package-lock.json`
that should not be committed.

```sh
bun install        # Install dependencies
bun run dev        # Start dev server at localhost:4321
bun run build      # Build for production
bun run preview    # Preview production build
bunx astro check   # TypeScript type checking - clean, keep it that way
bun run check:rhythm  # Rhythm generation property checks
bun run check:nyssma  # Do the NYSSMA Voice levels write what the chart asks?
bun run sweep      # Does every kind of exercise generate?
bun run scripts/check-ladder.ts  # Does every ladder step generate? (slow: STEP= for one)
bun run test       # Unit tests in tests/unit/
```

`astro check` reports **0 errors and 0 warnings**. Treat any error as a
regression.

## The gates (details: docs/claude/testing-and-gates.md)

- Run tests with **`bun run test`**, not bare `bun test`: it passes
  `--timeout 30000`, and several generator tests need it (a timeout reads
  like a regression and is not one).
- **A failing test may be the test, not the code**, and randomised
  generators make over-strict assertions flaky: reproduce with a loop before
  "fixing" the source. On bun 1.3.0 six `exercise-link.test.ts` cases fail
  for want of `CompressionStream`; that is the environment.
- **After touching generation, run the sweep.** Narrow checks lie (every
  early "0% failures" was measured at one setting). After touching
  `rhythm-generation.ts`, `generateUnison.ts` or `rhythm-syllables.ts`, run
  `check:rhythm`; after a ladder step, `check-ladder.ts`; after NYSSMA,
  `check:nyssma`; TMEA, courses and piano have their own `scripts/check-*.ts`.
- **Never update a regression snapshot to make it pass**
  (`meter-regression.test.ts`, `unison-skip-regression.test.ts`): a failure
  means a change reached output it should not have. Snapshots move only
  deliberately, checked against the old list first, and the commit says so.

## Rules that apply everywhere

- **Ids are permanent**: ladder steps (`sbs-NN-...`), course steps
  (`band-trumpet-03`), NYSSMA, TMEA and piano levels, class-progress and
  assignment keys. Never rename or reuse one; retired ids map to their
  replacement.
- **Blaine's hand-calibrated voice ranges are never changed** to fix a
  failure rate without asking him.
- **Pedagogy first**: one new element per step, new rhythm on familiar
  pitches and the reverse (docs/claude/unison-and-levels.md, the ladder).
- **Colours only from the `--sr-` tokens** (Look, below), never Tailwind's
  own palette. Never name a class `ring` (it is Tailwind's ring utility).
- **Students may be under 13**: student pages load no analytics and no
  feedback form, student accounts have no email, and a student's Google or
  ClassLink tokens are never kept.
- **Gate by plan through `planFor` / `hasPremium` / `hasEducatorPlan`**,
  never by reading billing fields. Educator is not on sale yet
  (`EDUCATOR_ON_SALE` in `src/lib/plan.ts`).
- **Schema changes reach the shared database** (Development, Preview and
  Production share one): prefer writing the SQL with `prisma migrate diff`,
  reading it, and applying with `bun run db:deploy` (never resets).
- **Load time**: fonts are self-hosted; nothing that appears after load may
  push the page down; Tone.js and the Tools cards load on first use.
- New public pages go in `src/lib/seo.ts` (the sitemap). Keep `data-tour`
  attributes on controls you move (the walkthrough points at them).
- abcjs is SSR-incompatible (render client-side). The project's ABC uses
  `L:1/32`, so a quarter note is `8`.
- Validate UI changes in the browser; most pages have an end-to-end
  `scripts/check-*.ts` (listed in each area's file).

## Where things are (read before touching)

| Area | File |
|---|---|
| Unit tests, the sweep, what each gate catches | `docs/claude/testing-and-gates.md` |
| Unison page: the ladder, courses (tracks), Reading as, chord progressions, minor keys, meters, NYSSMA, TMEA, drill repeats | `docs/claude/unison-and-levels.md` |
| Choral generation pipeline, key types, resources, UIL presets, the part writers, parallels | `docs/claude/choral-generation.md` |
| Play-along videos, backing tracks, guitar renders | `docs/claude/play-along.md` |
| Piano sight reading and MIDI grading | `docs/claude/piano.md` |
| abcTuner, Tools wheel, metronome, OmniPitch, Grade (sing and clap), Hear your take | `docs/claude/tuner-and-grade.md` |
| Ensemble page | `docs/claude/ensemble.md` |
| Can you sing it? (/challenge) | `docs/claude/challenge.md` |
| Accounts, classes, students, rostering, gradebook, assignments, plans, Stripe, codes, free month, founders | `docs/claude/accounts-and-billing.md` |
| Your own music (pieces), piece assignments, graded attempts | `docs/claude/pieces.md` |
| Live practice rooms and the push worker | `docs/claude/live.md` |
| Practice page UI: failure banner, first visit and tour, home page, load times, SEO, full screen, copyright, settings row, playing cursor, start point, score layout | `docs/claude/practice-page-ui.md` |

## Look: "Recess"

Soft pastel blocks, big rounded cards, Fredoka headings over Nunito (loaded in
Layout.astro). Every colour is a `--sr-` token in `src/styles/globals.css`
(light, and a dark block for `themable` pages), exposed to Tailwind as
`sr-*` colours: blue `action` for anything chosen or primary, the pastels
`mint`, `peach`, `butter`, `sky` each with an `-ink` that reads on it, and
`bar-*` for the navy playback bar. The shared classes there (`sr-tok`,
`sr-tab`, `sr-btn`, `sr-panel`, `sr-pastels` for a grid of cards...) carry
the shapes: pills and 28px cards. Use tokens, never Tailwind's own palette
(`slate-600` and the like), or the dark theme breaks. The score paper stays
white in both themes.

## Deploys

`main` deploys to production on every push. **dev.abc-sightreading.com** is
the `dev` branch's latest preview build (a Vercel project domain tied to the
branch; DNS is a CNAME `dev` -> `cname.vercel-dns.com` at Porkbun, where both
domains' DNS lives). It opens without a Vercel login: Vercel Authentication
is off for the project (6 October 2026), since a domain tied to a preview
branch keeps the login under every other setting ("all except custom
domains" frees production custom domains only). So every *.vercel.app
preview link opens too; they are unguessable and noindex, and anything
private still needs the site's own sign-in. It shares the production database.
`BETTER_AUTH_URL` is set to it for Preview (dev) only, so sign-in works there.
Changes go to the dev site first (`dev`, with `[preview]` on the finished
batch's last commit so it rebuilds) and reach `main` only when Blaine says
to push to main. Preview branches (`dev`) build
on Vercel only when the commit message contains `[preview]`
(`scripts/vercel-ignore.sh`, vercel.json `ignoreCommand`): each build is about
45 s of build time, and building every dev push spent most of the budget.
Otherwise preview with `bun run dev`, or `vercel build && vercel deploy
--prebuilt`, which builds locally and uses no Vercel build time.

## Tech Stack

- **Astro** (SSR, deployed to Vercel): pages in `src/pages/`, layout in `src/layouts/`
  - `@astrojs/vercel` 6 only knows Node 18/20 and emits `nodejs18.x` for anything newer, which Vercel rejects. `scripts/fix-vercel-runtime.mjs` (run by `bun run build`) pins the functions to `nodejs24.x`, matching `engines.node`; drop it when Astro is upgraded.
- **Svelte**: interactive components (used with `client:only="svelte"`)
- **TailwindCSS**: styling
- **abcjs**: renders ABC notation strings into sheet music in the browser
- **Tone.js**: audio playback of generated exercises
- **Prisma 7 + Prisma Postgres, Better Auth, Stripe**: accounts and billing (docs/claude/accounts-and-billing.md)
