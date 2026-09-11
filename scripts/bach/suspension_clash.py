"""
How often does a SUSPENSION create a half-step dissonance in Bach?

The worklist asks: if it is very rare, ban it outright for suspensions.

A suspension here is the strict thing: the dissonant note is the SAME PITCH as
the note before it in its own voice - held over rather than struck - and it
leaves by step. That is what distinguishes it from a passing tone, which arrives
by step.

Reports every minor 2nd / minor 9th between two voices, split by whether the
dissonant voice held into it or stepped into it.

Run:  python3 scripts/bach/suspension_clash.py [limit]
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
    out = []
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
        out.append(notes)
    return out


def describe(notes, i):
    """How voice `notes` arrives at and leaves note i."""
    held = i > 0 and notes[i][2] == notes[i - 1][2]
    stepped_in = i > 0 and 0 < abs(notes[i][2] - notes[i - 1][2]) <= 2
    stepped_out = i + 1 < len(notes) and abs(notes[i + 1][2] - notes[i][2]) <= 2
    if held and stepped_out:
        return "SUSPENSION (held in, step out)"
    if stepped_in and stepped_out:
        return "passing (step in, step out)"
    if held:
        return "held in, not resolved by step"
    return "other"


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    kinds = Counter()
    total = chorales = 0
    susp_notes = 0
    pass_notes = [0]

    for score in four_part_chorales(limit):
        chorales += 1
        parts = part_events(score)
        # Every suspension in the piece, clashing or not, for the denominator.
        for notes in parts:
            for i in range(len(notes)):
                d = describe(notes, i)
                if d.startswith("SUSPENSION"):
                    susp_notes += 1
                elif d.startswith("passing"):
                    pass_notes[0] += 1
        for a in range(len(parts)):
            for b in range(a + 1, len(parts)):
                for i, (s1, e1, m1, _) in enumerate(parts[a]):
                    for j, (s2, e2, m2, _) in enumerate(parts[b]):
                        if e1 <= s2 + 1e-9 or e2 <= s1 + 1e-9:
                            continue
                        if abs(m1 - m2) not in (1, 13):
                            continue
                        total += 1
                        da, db = describe(parts[a], i), describe(parts[b], j)
                        # The dissonant voice is whichever is ornamental; prefer
                        # a suspension, then a passing tone.
                        pick = (da if da.startswith("SUSPENSION") else
                                db if db.startswith("SUSPENSION") else
                                da if da.startswith("passing") else db)
                        kinds[pick] += 1

    print(f"{chorales} chorales, {total} minor 2nd / minor 9th pairs, "
          f"{susp_notes} suspensions in total\n")
    for k, c in kinds.most_common():
        print(f"  {k:<34} {c:>5}  {100*c/total:>5.1f}% of clashes")
    s = sum(v for k, v in kinds.items() if k.startswith("SUSPENSION"))
    pt = sum(v for k, v in kinds.items() if k.startswith("passing"))
    print()
    print("  How often does each KIND of ornament clash by a semitone?")
    print(f"    suspensions   {s:>5} of {susp_notes:>6}   {100*s/susp_notes:.2f}%")
    print(f"    passing tones {pt:>5} of {pass_notes[0]:>6}   {100*pt/pass_notes[0]:.2f}%")


if __name__ == "__main__":
    main()
