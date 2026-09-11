"""
Does Bach write a half step, or a minor ninth, between two sounding voices?

We refuse both in generated decorations (items 48 and 49). That was reasoned
from the style rather than measured, so this checks it against the source: the
371 four-part chorales bundled with music21.

Counts every pair of voices sounding together at each vertical slice, and how
far apart they are. A slice is produced by chordify(), which cuts a new sonority
at every onset in any voice - so a passing tone against a held note is its own
slice and is counted.

Run:  python3 scripts/bach/clashes.py [limit]
"""
import sys
from collections import Counter
from music21 import corpus

VOICES = {"Soprano", "Alto", "Tenor", "Bass"}


def four_part_chorales(limit=None):
    """The chorales that really are S/A/T/B and nothing else."""
    seen = 0
    for score in corpus.chorales.Iterator(numberingSystem="bwv"):
        names = {p.partName for p in score.parts}
        if not VOICES.issubset(names) or len(score.parts) != 4:
            continue
        yield score
        seen += 1
        if limit and seen >= limit:
            return


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    gaps = Counter()
    slices = 0
    chorales = 0

    for score in four_part_chorales(limit):
        chorales += 1
        chords = score.chordify(removeRedundantPitches=False)
        for c in chords.recurse().getElementsByClass("Chord"):
            slices += 1
            ps = sorted(n.pitch.midi for n in c.notes)
            for i in range(len(ps)):
                for j in range(i + 1, len(ps)):
                    gaps[ps[j] - ps[i]] += 1

    total_pairs = sum(gaps.values())
    print(f"{chorales} chorales, {slices} vertical slices, {total_pairs} sounding pairs\n")
    print("  gap  interval            count      share")
    NAME = {1: "minor 2nd", 2: "major 2nd", 11: "major 7th", 12: "octave",
            13: "MINOR 9TH", 14: "major 9th", 3: "minor 3rd", 4: "major 3rd"}
    for gap in sorted(gaps):
        if gap > 26:
            continue
        share = 100 * gaps[gap] / total_pairs
        name = NAME.get(gap, "")
        flag = "  <<<" if gap in (1, 13) else ""
        print(f"  {gap:>3}  {name:<18} {gaps[gap]:>7}  {share:>7.3f}%{flag}")


if __name__ == "__main__":
    main()
