"""
The specific question from the worklist: over iv in minor, does Bach put the
2nd above the root in another voice?

In A minor that is iv = D F A, and the 2nd above the root is E - a HALF STEP
below the chord's third, F. The worry was that suspending onto it grinds against
that third. This checks whether Bach does it, and if so how.

Reports, for every occurrence: whether the F (the third) is actually sounding at
the same moment, how the E is approached and left, and where it falls in the bar.

Run:  python3 scripts/bach/iv_minor.py [limit]
"""
import sys
from collections import Counter
from music21 import corpus, interval, roman

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from nct_by_chord import (  # noqa: E402
    VOICES, four_part_chorales, part_timelines, beat_chords, reduce_to_chord,
)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    treat = Counter()
    against_third = Counter()
    beats = Counter()
    found = chorales = 0

    for score in four_part_chorales(limit):
        chorales += 1
        try:
            key = score.analyze("key")
        except Exception:
            continue
        if key.mode != "minor":
            continue
        timelines = part_timelines(score)
        if len(timelines) != 4:
            continue
        per_beat = beat_chords(score, score.chordify(removeRedundantPitches=False))

        for v, notes in timelines.items():
            for i, (start, end, pitch, bs) in enumerate(notes):
                reduced = per_beat.get(int(start))
                if reduced is None:
                    continue
                try:
                    rn = roman.romanNumeralFromChord(reduced, key)
                except Exception:
                    continue
                if rn.romanNumeralAlone.lower() != "iv":
                    continue
                members = {p.pitchClass for p in reduced.pitches}
                if pitch.pitchClass in members:
                    continue
                gi = interval.Interval(noteStart=reduced.root(), noteEnd=pitch)
                if abs(gi.generic.simpleDirected) != 2:
                    continue
                found += 1
                # Is the chord's third sounding at the same moment?
                third_pc = reduced.third.pitchClass if reduced.third else None
                clash = False
                for w, other in timelines.items():
                    if w == v:
                        continue
                    for (s2, e2, p2, _) in other:
                        if e2 <= start + 1e-9 or end <= s2 + 1e-9:
                            continue
                        if third_pc is not None and p2.pitchClass == third_pc:
                            clash = True
                            if abs(p2.midi - pitch.midi) in (1, 13):
                                against_third["a HALF STEP from the third"] += 1
                            else:
                                against_third["the third, but further away"] += 1
                            break
                    if clash:
                        break
                if not clash:
                    against_third["the third is not sounding"] += 1

                into = i > 0 and abs(notes[i][2].midi - notes[i - 1][2].midi) <= 2
                out = i + 1 < len(notes) and abs(notes[i + 1][2].midi - notes[i][2].midi) <= 2
                held = i > 0 and notes[i][2].midi == notes[i - 1][2].midi
                treat["suspension (held in, step out)" if held and out else
                      "passing (step in, step out)" if into and out else
                      "step in only" if into else
                      "step out only" if out else
                      "leapt both sides"] += 1
                beats["strong beat" if bs >= 0.5 else "weak beat"] += 1

    print(f"{chorales} chorales scanned; {found} notes a 2nd above the root of iv in minor\n")
    if not found:
        return
    print("  How the voice handles it:")
    for k, c in treat.most_common():
        print(f"    {k:<34} {c:>4}  {100*c//found:>3}%")
    print("\n  Against the chord's third:")
    for k, c in against_third.most_common():
        print(f"    {k:<34} {c:>4}  {100*c//found:>3}%")
    print("\n  Where:")
    for k, c in beats.most_common():
        print(f"    {k:<34} {c:>4}  {100*c//found:>3}%")


if __name__ == "__main__":
    main()
