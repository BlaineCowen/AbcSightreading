# Chromatic notes in the bass

A chromatic note in the bass should be **approached by step and resolved by
step** - up from a raised note, down from a lowered one. This is the one rule
the generator keeps breaking, it has been worked on several times, and this is
the state of it as of 22 September 2026, for whoever picks it up next.

## Where the rule lives

| What | Where |
|---|---|
| Planning a chord's bass note, including the chromatic-bass chords (V⁶/V, V⁶/ii, V⁶/vi) | `findValidBassNote`, `src/lib/chord-generation.ts` (~line 959) |
| The resolution a chromatic bass note owes the next step | `owedBassResolution`, `src/lib/build-chord-notes.ts` (~line 890, armed ~1415) |
| The deadlock escape: substitutes a bass note when the planned one cannot be used | `src/lib/build-chord-notes.ts` (~1130-1350) |
| Existing test (asserts a rate, not an absolute) | `tests/unit/bass-accidental-approach.test.ts` |

Two mechanisms carry the rule, and they are easy to confuse:

- **`forcedNextBassPitch`** (chord-generation) - set when a chord was *planned*
  with a chromatic bass, so the next chord's bass is pinned to the resolution.
- **`owedBassResolution`** (build-chord-notes) - set whenever a bass note is
  *written* with an accidental, whoever chose it. The escape can only pay this
  debt if the next chord contains the resolution pitch and the bass can reach
  it.

## What was fixed (22 Sep 2026, commit e851a4b)

**The debt was lost whenever a step was retried.** Every attempt at a step
writes its bass note and sets `owedBassResolution` from *that* note - the debt
it leaves for the next step - before the upper voices are placed. When an upper
voice then failed, the step retried, and the retry saw the failed attempt's debt
(almost always none) instead of the one the step actually owed. The accidental
before it was then free to leap away. Fixed by capturing the debt at the start
of the step and restoring it at the start of every attempt.

This is why the problem tracked the **UIL level** rather than the settings in
the share link: UIL 4 and 5 use wider, lower upper-voice ranges, which makes
exactly these steps need a second attempt. At UIL 5 in G, 29 of 32 unresolved
bass accidentals were this one bug.

Also added, both **preferences with a fallback** so they cannot starve the
escape: a chromatic bass note is preferred where its resolution is inside the
bass's range. On the top note of the range a raised note owes a step nobody can
pay - in G with the page-default bass range (E2-G3), a G♯ owes an A the bass
cannot sing, and that was two thirds of the unresolved notes at the defaults.

Measured at UIL 5 settings in G major, 1500 exercises before and after:

| | Before | After |
|---|---|---|
| Not resolved by step | 20% | 4% |
| Approached by leap | 6% | 8% |
| Problem notes altogether | 26% | 12% |
| Failed generations | unchanged or fewer (UIL 5 minor 3/180 → 0/180) | |

## What is still wrong

1. **Approached by leap, 8%, up from 6%.** Isolated to the debt fix itself:
   pinning the bass to its resolution sometimes leaves the *next* chromatic note
   a leap away. The escape cannot arm an approach - the previous note is already
   written - so the fix has to be earlier, when the chord is planned.
2. **Unresolved, 4%.** Mixed causes, none dominant, from ~25 examples:
   - the next chord simply does not contain the resolution pitch (a secondary
     dominant followed by something that is not its target, or by the target in
     an inversion that puts a different note in the bass);
   - a decoration (non-chord tone) placed between the accidental and its
     resolution;
   - a handful where the escape kept the resolution in its candidate pool and
     still chose something else - worth a closer look, it should be impossible.
3. **Untested: the same retry leak in the upper voices.** The fix above is
   bass-only. If the upper voices carry a comparable obligation across retries,
   it will have the same hole.

## How to measure it

Do not eyeball exercises; the rates are single-digit percentages. Generate a few
hundred through `generateChoralExercise`, walk `out.voiceNotes[bassIndex]`, and
for each note whose `accidental` differs from what the key gives that degree,
check the previous and next sounding bass notes by `pitchValue` (±1 is a step;
the same `pitchValue` with a different accidental is a chromatic step and counts
as approached). Skip repeats of the same note. Sample sizes below ~500
exercises move these numbers by 2-3 points on their own.

Reproduce the user's settings by applying a **UIL level**, not the share link: a
link carries neither the level nor the rhythms, chords, ranges or chromatic
frequency. `applyUILPreset` in `AbcjsChoral.svelte` (~1118) is what a level sets
- ranges from `uilPresets[level].voiceRanges`, its chords through
`withInversions`, its rhythms minus rests, `maxSkip`, and the rest weights that
do show up in the link (`bias=...Rest:0.25`).

## Things that have been tried and cost more than they bought

Recorded in the comments around the escape, and worth reading before touching it
again: restricting the escape so a chromatic bass note *must* be approached by
step was tried four ways and either bought nothing (77.9% against 79.3% for
doing nothing) or cost 32-64% of 48-measure exercises outright. The escape only
runs where the search is already stuck, so anything that narrows it removes the
escape itself. Prefer-with-fallback is the only shape that has worked here.
