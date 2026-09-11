"""
Which non-chord tones does Bach use over which chord?

The method, and the two catches that shape it.

A chordified slice contains the non-chord tones too, so its Roman numeral cannot
be read off directly. Reducing each slice on its own does not work either: with
four voices, a triad plus one passing note very often reads as a perfectly good
seventh chord, and the dissonance is quietly absorbed. Measured that way, twelve
chorales yielded 47 non-chord tones, which is far too few to be true.

So the harmony is taken per BEAT, from the LAST slice in it - the point where
anything dissonant has resolved, which is what makes a suspension visible as a
suspension rather than as part of the chord. Every note beginning in that beat is
then measured against it.

Voice identity is kept by querying each part at the slice's offset rather than
by reading the chordified slice, which has none.

Each non-chord tone is recorded as its generic interval above the chord root -
a 4th over the root is the classic 4-3 suspension - along with how the voice
handles it and where it falls in the bar.

Run:  python3 scripts/bach/nct_by_chord.py [limit]
"""
import sys
from collections import Counter, defaultdict
from itertools import combinations
from music21 import chord, corpus, interval, roman

VOICES = ["Soprano", "Alto", "Tenor", "Bass"]
ORDINAL = {1: "unison", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th"}


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


def part_timelines(score):
    """Per voice: [(start, end, pitch, beatStrength)], in score order."""
    out = {}
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
            notes.append((off, off + float(n.duration.quarterLength), n.pitch, bs))
        out[part.partName] = notes
    return out


def sounding(notes, t):
    """(index, entry) sounding at time t, or (None, None)."""
    for i, e in enumerate(notes):
        if e[0] <= t + 1e-9 < e[1] - 1e-9 or abs(e[0] - t) < 1e-9:
            return i, e
    return None, None


def reduce_to_chord(pitches, bass):
    """The largest triad/seventh inside these pitches, keeping the bass if possible."""
    uniq = []
    for p in pitches:
        if p.pitchClass not in [q.pitchClass for q in uniq]:
            uniq.append(p)
    for k in range(len(uniq), 2, -1):
        best = None
        for subset in combinations(uniq, k):
            c = chord.Chord(list(subset))
            if not (c.isTriad() or c.isSeventh()):
                continue
            keeps_bass = any(p.pitchClass == bass.pitchClass for p in subset)
            if keeps_bass:
                return c
            best = best or c
        if best is not None:
            return best
    return None


def beat_chords(score, chords):
    """Per beat: the chord, taken from the last slice in that beat."""
    by_beat = {}
    for c in chords.recurse().getElementsByClass("Chord"):
        t = float(c.getOffsetInHierarchy(chords))
        by_beat.setdefault(int(t), []).append((t, c))
    out = {}
    for beat, slices in by_beat.items():
        slices.sort(key=lambda x: x[0])
        for _, c in reversed(slices):  # last first; fall back up the beat
            ps = list(c.pitches)
            if len(ps) < 3:
                continue
            bass = min(ps, key=lambda p: p.midi)
            reduced = reduce_to_chord(ps, bass)
            if reduced is not None:
                out[beat] = reduced
                break
    return out


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    table = defaultdict(lambda: defaultdict(Counter))
    numeral_total = Counter()
    chorales = notes_seen = ncts = unlabelled = 0

    for score in four_part_chorales(limit):
        chorales += 1
        try:
            key = score.analyze("key")
        except Exception:
            continue
        mode = key.mode
        timelines = part_timelines(score)
        if len(timelines) != 4:
            continue
        per_beat = beat_chords(score, score.chordify(removeRedundantPitches=False))

        for v, notes in timelines.items():
            for i, (start, end, pitch, bs) in enumerate(notes):
                beat = int(start)
                reduced = per_beat.get(beat)
                if reduced is None:
                    unlabelled += 1
                    continue
                notes_seen += 1
                try:
                    rn = roman.romanNumeralFromChord(reduced, key)
                    figure = rn.romanNumeralAlone + ("7" if reduced.isSeventh() else "")
                except Exception:
                    unlabelled += 1
                    continue
                numeral_total[(mode, figure)] += 1
                if pitch.pitchClass in {p.pitchClass for p in reduced.pitches}:
                    continue
                ncts += 1
                gi = interval.Interval(noteStart=reduced.root(), noteEnd=pitch)
                step = abs(gi.generic.simpleDirected)
                label = ORDINAL.get(step, str(step))
                into = i > 0 and abs(notes[i][2].midi - notes[i - 1][2].midi) <= 2
                out_ = i + 1 < len(notes) and abs(notes[i + 1][2].midi - notes[i][2].midi) <= 2
                held = i > 0 and notes[i][2].midi == notes[i - 1][2].midi
                treat = ("suspension (held in, step out)" if held and out_ else
                         "passing (step in, step out)" if into and out_ else
                         "step in only" if into else
                         "step out only" if out_ else
                         "leapt both sides")
                table[(mode, figure)][label][treat] += 1
                table[(mode, figure)][label]["__strong" if bs >= 0.5 else "__weak"] += 1

    pct = 100 * ncts / notes_seen if notes_seen else 0
    print(f"{chorales} chorales, {notes_seen} notes labelled, "
          f"{ncts} non-chord tones ({pct:.1f}%), {unlabelled} notes unlabelled\n")
    for (mode, figure), total in numeral_total.most_common(16):
        rows = table[(mode, figure)]
        n = sum(sum(v for k, v in c.items() if not k.startswith("__")) for c in rows.values())
        if n < 15:
            continue
        print(f"{mode:<5} {figure:<6}  {total:>5} notes over it, {n:>4} non-chord tones")
        for label, counter in sorted(
            rows.items(), key=lambda kv: -sum(v for k, v in kv[1].items() if not k.startswith("__"))
        ):
            sub = sum(v for k, v in counter.items() if not k.startswith("__"))
            if sub < 5:
                continue
            strong = counter["__strong"]
            top = ", ".join(
                f"{k} {100*v//sub}%"
                for k, v in counter.most_common(3)
                if not k.startswith("__")
            )
            print(f"     {label:<7} {sub:>4}  ({100*strong//sub:>3}% strong beat)   {top}")
        print()


if __name__ == "__main__":
    main()
