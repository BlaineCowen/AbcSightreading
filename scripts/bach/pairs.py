"""
The same measurement we run on our own output, run on Bach.

Our generator measurement counts each PAIR OF NOTES that overlap in time, once.
The chordify version counts each vertical slice, so a held note is counted again
at every onset beneath it - a different denominator, and not comparable. This
mirrors ours exactly so the two numbers can be put side by side.

Run:  python3 scripts/bach/pairs.py [limit]
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


def events(score):
    """(start, end, midi) per sounding note, per part, in quarter notes."""
    out = []
    for part in score.parts:
        if part.partName not in VOICES:
            continue
        notes = []
        for n in part.recurse().notes:
            if n.isChord:
                continue
            off = float(n.getOffsetInHierarchy(score))
            notes.append((off, off + float(n.duration.quarterLength), n.pitch.midi))
        out.append(notes)
    return out


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    gaps = Counter()
    chorales = notes = 0

    for score in four_part_chorales(limit):
        chorales += 1
        parts = events(score)
        notes += sum(len(p) for p in parts)
        for a in range(len(parts)):
            for b in range(a + 1, len(parts)):
                for (s1, e1, m1) in parts[a]:
                    for (s2, e2, m2) in parts[b]:
                        if e1 <= s2 + 1e-9 or e2 <= s1 + 1e-9:
                            continue
                        gaps[abs(m1 - m2)] += 1

    total = sum(gaps.values())
    m2, m9 = gaps[1], gaps[13]
    print(f"{chorales} chorales, {notes} notes, {total} overlapping pairs\n")
    print(f"  minor 2nd   {m2:>6}   {100*m2/total:.3f}%")
    print(f"  MINOR 9TH   {m9:>6}   {100*m9/total:.3f}%")
    print(f"  both        {m2+m9:>6}   {100*(m2+m9)/total:.3f}%")
    print(f"\n  per chorale: {(m2+m9)/chorales:.2f}")


if __name__ == "__main__":
    main()
