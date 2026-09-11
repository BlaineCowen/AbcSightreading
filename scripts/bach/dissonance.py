"""
WHEN does Bach allow a half step or a minor ninth between two voices?

The rate turned out not to be the question. Measured the same way we measure our
own output, Bach writes a minor 2nd or minor 9th in 0.82% of overlapping pairs
and our generator, before we started banning them, wrote 0.83%. The difference
is not how many but under what conditions - Bach's are prepared and left by
step, on weak beats, between inner voices.

For every clashing pair this records, for each of the two notes:
  - approached by step (<= 2 semitones from the previous note in its own part)
  - left by step
  - beat strength (music21: 1.0 = downbeat, 0.5 = other strong beat, less = weak)
  - which pair of voices

Run:  python3 scripts/bach/dissonance.py [limit]
"""
import sys
from collections import Counter
from music21 import corpus

VOICES = ["Soprano", "Alto", "Tenor", "Bass"]


def four_part_chorales(limit=None):
    seen = 0
    for score in corpus.chorales.Iterator(numberingSystem="bwv"):
        names = {p.partName for p in score.parts}
        if not set(VOICES).issubset(names) or len(score.parts) != 4:
            continue
        yield score
        seen += 1
        if limit and seen >= limit:
            return


def part_events(score):
    """Per voice, in score order: list of (start, end, midi, beatStrength)."""
    by_name = {}
    for part in score.parts:
        if part.partName not in VOICES:
            continue
        notes = []
        for n in part.recurse().notes:
            if n.isChord:
                continue
            off = float(n.getOffsetInHierarchy(score))
            try:
                bs = float(n.beatStrength)
            except Exception:
                bs = 0.0
            notes.append((off, off + float(n.duration.quarterLength), n.pitch.midi, bs))
        by_name[part.partName] = notes
    return [by_name[v] for v in VOICES if v in by_name]


def stepwise(notes, i):
    """(approached by step, left by step) for note i in its own part."""
    into = i > 0 and abs(notes[i][2] - notes[i - 1][2]) <= 2
    out = i + 1 < len(notes) and abs(notes[i + 1][2] - notes[i][2]) <= 2
    return into, out


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    treatment = Counter()
    voicepair = Counter()
    strength = Counter()
    total = 0
    chorales = 0

    for score in four_part_chorales(limit):
        chorales += 1
        parts = part_events(score)
        names = VOICES[: len(parts)]
        for a in range(len(parts)):
            for b in range(a + 1, len(parts)):
                for i, (s1, e1, m1, bs1) in enumerate(parts[a]):
                    for j, (s2, e2, m2, bs2) in enumerate(parts[b]):
                        if e1 <= s2 + 1e-9 or e2 <= s1 + 1e-9:
                            continue
                        if abs(m1 - m2) not in (1, 13):
                            continue
                        total += 1
                        voicepair[f"{names[a]}-{names[b]}"] += 1
                        # The more dissonance-like note: the one treated as an
                        # ornament. Take whichever is handled more stepwise.
                        ai, ao = stepwise(parts[a], i)
                        bi, bo = stepwise(parts[b], j)
                        best = max((ai + ao, bs1), (bi + bo, bs2))
                        score_steps, bs = best
                        treatment[{2: "approached AND left by step",
                                   1: "one side stepwise",
                                   0: "neither side stepwise"}[score_steps]] += 1
                        strength["downbeat (1.0)" if bs >= 1.0 else
                                 "strong (0.5)" if bs >= 0.5 else "weak (<0.5)"] += 1

    print(f"{chorales} chorales, {total} minor 2nd / minor 9th pairs\n")
    print("  How the dissonant voice is handled:")
    for k, c in treatment.most_common():
        print(f"    {k:<30} {c:>5}  {100*c/total:>5.1f}%")
    print("\n  Where it falls:")
    for k, c in strength.most_common():
        print(f"    {k:<30} {c:>5}  {100*c/total:>5.1f}%")
    print("\n  Between which voices:")
    for k, c in voicepair.most_common():
        print(f"    {k:<30} {c:>5}  {100*c/total:>5.1f}%")


if __name__ == "__main__":
    main()
