# NYSSMA Voice sight reading levels (I-V) - Unison

Date: 2026-10-01
Status: design approved in conversation; awaiting spec review

## Goal

Teachers preparing students for NYSSMA solo voice evaluation can pick a
NYSSMA level on the Unison page and get exercises that follow that level's
criteria - in particular its **interval rules**, which name specific skips
("Do-Mi-Sol ascending") rather than a maximum skip size. The same skip rules
are available to any teacher as a "Custom skips" option.

Source: NYSSMA Manual, Edition 33 (effective July 2023), p. 7-2, "Sight
Reading Criteria: Voice". Transcription, checked by the owner:
Obsidian `Dev-stuff/NYSSMA Sight Reading Criteria (transcribed).md`.

## Scope

- In: Levels I-V, Unison page only. Custom skips control, skip-landing
  limits, NYSSMA presets, printed dynamics with playback.
- Out: **Level VI** - needs compound meter (spec
  `2026-10-01-compound-meter-unison-design.md`) and triplet eighths in simple
  meter (no tuplet support yet; its own spec). Hairpins (cresc./decresc.)
  come with Level VI. Skip lists in Choral.

## Decisions

| Question | Decision |
|---|---|
| Skip list meaning | Each listed skip is allowed on its own, in any octave; a melody may chain them. Unlisted skips are forbidden. |
| Where | NYSSMA presets set the rules, and the Pitches tab exposes them in a collapsed "Choose exact skips" panel any teacher can use. |
| Rhythm of interval | Enforced: a skip may only land on the level's listed note values. |
| Dynamics | Printed, and playback follows them. |
| Level VI | After compound meter and triplets. |
| Length | Presets default to 8 measures (the chart sets none). |

## 1. Allowed skips control (Pitches tab, Unison)

Redesigned 2 Oct 2026 after the owner saw the first build (a row editor of
three dropdowns per skip, which read badly, especially on a phone). Max skip
stays the everyday control; exact skips live in a collapsed advanced panel
built from toggle buttons, in the page's existing `sr-tok` style.

- **Max skip** (today's 2nd-octave buttons) stays at the top, unchanged.
- **"Choose exact skips"**: a collapsed panel (`<details>`), open by default
  only when exact skips are on (e.g. a NYSSMA preset was applied).
  - **Only allow these skips**: an on/off switch. Turning on any pattern
    turns it on; turning it off keeps the choices for later. While on, the
    Max skip row is dimmed with "Using your exact skips".
  - **Patterns**: the chips are on/off toggles. The allowed skips are the
    union of the patterns that are on plus any other skips:

| Pattern | Skips it allows |
|---|---|
| Do-Mi-Sol ↑ | 1↑3, 3↑5 |
| Do-Sol ↑ | 1↑5 |
| Sol-Mi-Do ↓ | 5↓3, 3↓1 |
| Sol-Do ↓ | 5↓1 |
| Do-Sol ↓ | 1↓5 |
| Sol-Ti-Re ↑ | 5↑7, 7↑2 |
| Tonic triad ↕ | 1↕3, 3↕5, 1↕5 |
| 4ths & 5ths ↕ | every diatonic pair a 4th or 5th apart (12 rows, no fa-ti tritone) |

  - "↕" rows are symmetric: the pair either way, up or down.
  - **Other skips**: extra skips shown as pills (`re ↗ sol ✕`). "+ Add" opens
    a small inline picker on one line: From (do-ti buttons), direction
    (↗ ↘ ↕), To (do-ti), Add. No dropdowns.
  - An exact list with nothing on means **stepwise only**, shown as a plain
    note, not an error.
  - **Skips land on**: four icon toggles - eighth, quarter, dotted quarter,
    half - using the rhythm-picker icons (a standalone eighth icon is rendered
    with `scripts/render-rhythm-icons.mjs`). All on (no limit) by default.
- Saved in presets and URLs alongside `maxSkip` as: exact on/off, the
  pattern ids that are on, the other skips, and the land-on values. Presets
  and links without the new fields load in Max skip mode, unchanged.
- Works at phone width: everything is wrapping button rows.

## 2. Skip policy (`src/lib/skip-policy.ts`, new)

```ts
type SkipDir = "up" | "down" | "both";
interface SkipMove { from: number; to: number; dir: SkipDir } // scale degrees 1-7
type SkipPolicy =
  | { kind: "max"; maxSkip: number }
  | { kind: "custom"; moves: SkipMove[]; landOn?: number[] }; // lengths, 32nds
```

- `isAllowedMove(prev, next, nextLength, policy)`:
  - a step or repeated note (diatonic distance <= 1) is always allowed;
  - `max`: diatonic distance <= `maxSkip` (exactly today's rule);
  - `custom`: the move's degrees and direction match a listed move, as a
    simple interval (less than an octave), in any octave; and if `landOn`
    is set, `nextLength` is in it.
- Chromatic notes (from selected chromatic degrees) are reached only by
  step in custom mode.
- `largestSkip(policy)`: the widest allowed interval (1 for stepwise only),
  used by the generator's reachability estimates.

## 3. Generator changes (`generateUnison.ts`)

- The ~20 inline `Math.abs(a.pitchValue - b.pitchValue) <= maxSkip` checks
  become `isAllowedMove(...)` with the note's length.
- "Can we still reach home" estimates that divide by `maxSkip`
  (e.g. `homeDistance / newMaxSkip`) use `largestSkip(policy)`.
- `maxSkip` in params becomes a `SkipPolicy`; callers passing a number are
  wrapped as `{ kind: "max" }`.
- Rhythm is drawn before pitch, so landing limits only constrain which
  positions may carry a skip.
- Max skip mode must produce output identical to today (see Testing).

## 4. NYSSMA Voice presets

Unison gets its first built-in preset group, "NYSSMA Voice", in the preset
dropdown (Levels I-V). Like UIL on Choral, a preset sets options; editing
any marks it edited. Ladder steps and saved presets are unchanged. Clef and
pitch range stay the teacher's, as with ladder steps (the chart allows
transposing to the singer).

| | I | II | III | IV | V |
|---|---|---|---|---|---|
| Keys (one drawn per exercise) | C, F | C, F, G | C, F, G | C, F, G, D, E♭ | same as IV |
| Meters (one drawn per exercise) | 4/4 | 4/4, 2/4 | 4/4, 2/4, 3/4 | same as III | same as III |
| Scale-degree range | do-sol (5th) | do-la (6th) | do-la | do-do' (octave) | low sol-la (9th) |
| Skips | none (stepwise) | Do-Mi-Sol ↑ | same as II | + Do-Sol ↑ | + Sol-Mi-Do ↓, Sol-Do ↓, Sol-Ti-Re ↑, Do-Sol ↓ |
| Skips land on | - | quarter | quarter | quarter | quarter, half |
| Rhythms | quarter, half | quarter, half | + eighth pairs | same as III | + dotted quarter-eighth |
| Rests | none | quarter | quarter | quarter | quarter |
| Tempo | quarter = 72 | 72 | 72 | 72 | 72 |
| Dynamics | mf | mf | mf | mf, p, f | mf, p, f, mp |
| Measures | 8 | 8 | 8 | 8 | 8 |

- Level V's 9th is low sol to la so its new skips (Sol-Ti-Re ↑, Do-Sol ↓)
  have the sol below do.
- Key and meter are pools: one is drawn per exercise. If Unison only takes
  a single key or meter today, it gets the random-pool behaviour Choral's
  key picker already has.

## 5. Dynamics

- Score options gets **Dynamics**: Off, or a set (checkboxes p, mp, mf, f).
  Off by default, so nothing changes for current users; NYSSMA presets turn
  it on with their level's set. Saved in presets and URLs.
- The first note carries a dynamic drawn from the set; each new phrase
  (the generator's existing phrase boundaries, every 4 bars) may change it.
  A set of one (Level I: mf) prints once.
- Written as ABC decorations (`!mf!`, `!p!`, ...), rendered by abcjs under
  the staff.
- Playback follows them through note velocity. abcjs maps dynamic
  decorations to velocity; verify in the browser, and scale velocity
  ourselves if it falls short.
- The model leaves room for hairpins, which arrive with Level VI.

## Testing

- Unit tests (`tests/unit/`, `bun run test`):
  - `isAllowedMove`: re↑fa refused at Level II; do↑mi allowed in any
    octave; do↓mi refused when only ↑ is listed; a 10th refused for a 1↑3
    row; a skip onto an eighth refused when `landOn` is quarters; steps
    always allowed; chromatic notes only by step in custom mode.
  - chip expansion (each chip adds exactly its rows); preset contents per
    level; dynamics decorations in the ABC; preset/URL round trip of the
    custom list, with old links loading in Max skip mode.
- Regression guard: fixed-seed Unison output in Max skip mode identical
  before and after the change.
- New check script `scripts/check-nyssma.ts`: every level x key x meter,
  many runs each - every skip is on the level's list and lands on an
  allowed value, every note inside the level's degree range, only the
  level's rhythms and rests, no generation failures. Added to the sweep.
  Mutation-tested: loosening `isAllowedMove` or dropping the landing check
  makes it fail.
- Done means: `bun run test`, `bunx astro check` (0 errors), `check-rhythm`,
  `check-nyssma` and the sweep pass; each level played through in the
  browser (skips, dynamics printed and audible).
