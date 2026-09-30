# How Sight Reading Factory writes its choir exercises

Studied 30 September 2026 from a paid account: 56 of their choir (multi-part)
exercises across their 8 levels (40 SATB in five major keys, plus minor, SSA,
TTB, 3/4 and 6/8), measured against 60 of ours at UIL 1 to 5 with the same
analysis. Their raw exercises and the analysis script are kept outside the
repo (`~/.claude/projects/-Users-blainecowen-Projects-abcSightreading/srf-study/`)
so none of their material is committed.

## Decision

Not adopted for the choir pages. Our UIL 5 is already close to real UIL level 5
choir sight-reading, which is chordal, and that is the point of it. Part
independence is **kept in the back pocket as a setting**, to build when band and
orchestra arrive, where it is what instrumentalists will want. For now the
study is used to compare ourselves honestly (see the Sight Reading Factory page).

## What they do

- **Their server writes ABC** (`/api/v2/abc`, `L:1/16`, one `V:` block per part,
  solfège as `w:` lines, tenor on `treble-8`). Levels are `s~1` to `s~8`; custom
  settings include a `Polyphony` value (0 to 100) and per-part rhythms, ranges
  and leaps.
- **Parts grow independent with level.** Share of attacks where every part
  sounds together: 100% at level 1, 60% at 3 and 4, 41% at 5, 27% at 7, 22% at 8.
  Ours: 80 to 87% at every UIL level.
- **Much more melodic motion.** 15 to 23% of their notes are outside the beat's
  chord (passing and neighbour tones), against 1 to 4% of ours. Eighths are about
  half their notes at levels 4 and 5, against 20 to 29% of ours.
- **Shaped phrases.** Two 4-bar phrases, usually a breath rest in every part at
  the end of bar 4, a dynamic per phrase (p, mf, f) and a hairpin. Ours carry no
  dynamics.
- **Harmony used loosely.** About 2.5 chord changes a bar, like ours, but only
  about half their exercises at levels 5 to 8 end on V to I (others IV to I,
  vi to V, ii to I). Ours end on V to I every time.
- **Chromatic notes** from level 6 (3 to 4% of notes); sixteenths and
  dotted-eighth figures at 7 and 8.

## What it costs them

They average **5 to 34 parallel octaves or fifths per exercise** (most at level
1, where alto and tenor are written on the same letters), against **0.4 in
ours**. Checked by hand, e.g. level 5 in F, bar 3: soprano and bass B♭ to C an
octave apart; bar 7: soprano, alto and bass all A to F in octaves. Often two
parts double one line, which is how the busy texture comes cheaply.

## If we build it (band and orchestra)

1. A part-independence setting: within each chord, each part chooses its own
   rhythm and passing motion, still under our rules (no parallels, stepwise
   eighths, resolving leading tones).
2. Find out why decoration comes out at 3% of notes when `nctProbability` asks
   for 0.25; something is blocking it.
3. Phrase shaping: a dynamic and hairpin per phrase, breath rests at the
   half-way cadence. Cheap, and harmless even for choir as an option.
