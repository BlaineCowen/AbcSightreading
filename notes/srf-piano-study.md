# How Sight Reading Factory writes its piano exercises

Studied 8 October 2026 from a paid account: 108 of their piano exercises, 12
at each of their levels (½ and 1 to 8), in C, G and F major, 4/4, measured
in the browser by the same kind of analysis as the chorale study
(srf-chorale-study.md). None of their material is kept, here or elsewhere.

## Their levels (from their own level settings)

| Level | Hands | Chords | Largest leap |
|---|---|---|---|
| ½, 1 | separate, five-finger position | none | a 2nd, a 3rd |
| 2 | separate | none | a 5th; dynamics and ties |
| 3 | together, five-finger position | none | a 5th |
| 4 | together, five-finger position | 2-note | a 5th |
| 5, 6 | together, out of position | 2-note | a 6th; accidentals |
| 7, 8 | together, out of position | 2- or 3-note | an octave; triplets |

Hands separate means taking turns: each hand rests half the time.

## What they do

- **A chord is a coin flip on a long note.** Every chord is on a note a
  quarter or longer, never an eighth. The share of long notes made chords
  rises with level: 38% at 4, 48% at 5 and 6, 56% at 7, 61% at 8. Nothing
  else decides it: a downbeat note is a chord 26 to 35% of the time, less
  than the long-note rate, and cadences are not favoured.
- **The added note goes above or below the tune at random.** After a single
  note, the line continues in the chord's top note 38 to 59% of the time and
  its bottom note 37 to 59%, so the tune keeps sliding into an inner voice.
- **The left hand is a second tune, never an accompaniment.** As many notes
  as the right hand (50 each per exercise at level 8), as many steps (50 to
  58% of moves), and only 11 to 18% of its bars outline one chord: no held
  roots, broken chords, waltz or Alberti bass at any level.
- **The harmony agrees, the bass does not.** On a beat the two hands fit one
  key chord (99% at levels 4 and 5, about 89% at 6 to 8), but from level 5 the
  left hand's lowest note is the root only a third of the time, second
  inversion as common as root position.
- **Wide and low.** At 7 and 8 the median right-hand span in a bar is 10 to
  12 semitones, and the left hand reaches G1. A 2nd or 7th sounds between the
  hands at 18 to 23% of moments.

## What ours does instead (src/lib/piano/)

Harmony first; the tune over it; the left hand playing the same chords in a
pattern a method book teaches (held root, open fifth, block, on each beat,
broken, waltz, Alberti). A second note in the right hand only at level 8,
on a long note on a strong beat in a phrase's last two bars, a third or
sixth under the tune. Measured by scripts/check-piano.ts: bass on the root
where a chord starts 100% at levels 3 and 4, 60 to 80% from 5 (the block
shapes I, IV as C-F-A and V7 as B-F-G are inversions on purpose); no parallel
fifths or octaves between tune and bass.
