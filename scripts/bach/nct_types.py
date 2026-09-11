"""
Which KINDS of non-chord tone does Bach write, and where?

Our generator picks from five decorations with fixed weights - suspension 10,
passing 10, neighbour 8, anticipation 4, appoggiatura 3. Those numbers were
chosen by ear. This is what the corpus says they should be.

Classified by melodic shape, which is how our generator defines them too:

  passing       step in, step out, SAME direction
  neighbour     step in, step out, opposite direction (returns)
  suspension    held in (same pitch), step out
  anticipation  step in, then the next note REPEATS it
  appoggiatura  leap in, step out
  escape        step in, leap out

Also reports beat placement and which voice, both of which our generator
currently ignores: it decorates every part alike and at any position.

Run:  python3 scripts/bach/nct_types.py [limit]
"""
import sys
from collections import Counter, defaultdict
from music21 import corpus, roman

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from nct_by_chord import (  # noqa: E402
    VOICES, four_part_chorales, part_timelines, beat_chords,
)


def classify(notes, i):
    """The shape of note i in its own voice."""
    if i == 0 or i + 1 >= len(notes):
        return "edge"
    prev, cur, nxt = notes[i - 1][2].midi, notes[i][2].midi, notes[i + 1][2].midi
    into, out = cur - prev, nxt - cur
    step_in, step_out = 0 < abs(into) <= 2, 0 < abs(out) <= 2
    if into == 0 and step_out:
        return "suspension"
    if step_in and out == 0:
        return "anticipation"
    if step_in and step_out:
        return "passing" if (into > 0) == (out > 0) else "neighbour"
    if abs(into) > 2 and step_out:
        return "appoggiatura"
    if step_in and abs(out) > 2:
        return "escape"
    return "other"


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    kinds = Counter()
    by_voice = Counter()
    by_beat = Counter()
    voice_notes = Counter()
    kind_beat = defaultdict(Counter)
    chorales = labelled = ncts = 0

    for score in four_part_chorales(limit):
        chorales += 1
        try:
            key = score.analyze("key")
        except Exception:
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
                labelled += 1
                voice_notes[v] += 1
                if pitch.pitchClass in {p.pitchClass for p in reduced.pitches}:
                    continue
                ncts += 1
                k = classify(notes, i)
                kinds[k] += 1
                by_voice[v] += 1
                where = "downbeat" if bs >= 1.0 else "strong" if bs >= 0.5 else "weak"
                by_beat[where] += 1
                kind_beat[k][where] += 1

    print(f"{chorales} chorales, {labelled} notes labelled, {ncts} non-chord tones "
          f"({100*ncts/labelled:.1f}% of notes)\n")
    print("  Kind                  count    share     where it falls")
    for k, c in kinds.most_common():
        wb = kind_beat[k]
        tot = sum(wb.values()) or 1
        where = "  ".join(f"{w} {100*wb[w]//tot}%" for w in ("weak", "strong", "downbeat"))
        print(f"    {k:<16} {c:>7}   {100*c/ncts:>5.1f}%     {where}")
    print("\n  Which voice carries them (as a share of that voice's own notes):")
    for v in VOICES:
        if voice_notes[v]:
            print(f"    {v:<10} {by_voice[v]:>6} of {voice_notes[v]:>6}   {100*by_voice[v]/voice_notes[v]:>5.1f}%")


if __name__ == "__main__":
    main()
