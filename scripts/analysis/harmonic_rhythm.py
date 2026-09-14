"""How long a chord lasts, in the transcription and in what we generate."""
import re, sys
from collections import Counter
from music21 import chord as m21chord, key as m21key, roman

PATH = sys.argv[1] if len(sys.argv) > 1 else "scores/forgotten.abc"
text = open(PATH, encoding="utf-8").read()
KEY = re.search(r"^K:(\S+)", text, re.M).group(1)
# Read the unit note length and meter from the file rather than assuming them:
# a hand-written score uses L:1/8, the generator writes L:1/32.
_l = re.search(r"^L:1/(\d+)", text, re.M)
_m = re.search(r"^M:(\d+)/(\d+)", text, re.M)
DENOM = int(_l.group(1)) if _l else 8
BEATS_PER_BAR = int(_m.group(1)) if _m else 4
BEAT_DENOM = int(_m.group(2)) if _m else 4
UNIT = BEATS_PER_BAR * DENOM // BEAT_DENOM   # units in a bar
BEAT = DENOM // 4                            # units in a quarter-note beat
TOKEN = re.compile(r"(?P<acc>[=^_]{0,2})(?P<letter>[A-Ga-gz])(?P<oct>[,']*)(?P<dur>\d*)")
ALT = {"^": 1, "^^": 2, "_": -1, "__": -2, "=": 0}
_k = m21key.Key(KEY.replace("b", "-"))
KEY_ACC = {}
for _step in "ABCDEFG":
    _pp = _k.accidentalByStep(_step)
    KEY_ACC[_step] = int(_pp.alter) if _pp else 0

def parse(music):
    ev, onset = [], 0
    for bar in re.split(r"\|+", music):
        if bar.strip() in ("", "]"): continue
        active = {}
        for t in TOKEN.finditer(bar):
            letter, octs = t.group("letter"), t.group("oct")
            dur = int(t.group("dur")) if t.group("dur") else 1
            if letter == "z":
                ev.append((onset, dur, None)); onset += dur; continue
            step = letter.upper()
            if t.group("acc"): active[step] = ALT[t.group("acc")]
            alter = active.get(step, KEY_ACC[step])
            acc = {-2:"--",-1:"-",0:"",1:"#",2:"##"}[alter]
            octave = (5 if letter.islower() else 4) + octs.count("'") - octs.count(",")
            ev.append((onset, dur, f"{step}{acc}{octave}")); onset += dur
    return ev

voices, order = {}, []
for line in text.splitlines():
    m = re.match(r"^\[V:(\w+)\]\s*(.*)$", line)
    if m:
        if m.group(1) not in voices: order.append(m.group(1))
        voices[m.group(1)] = voices.get(m.group(1), "") + " " + m.group(2)
parsed = {v: parse(mus) for v, mus in voices.items()}
total = max(sum(d for _, d, _ in ev) for ev in parsed.values())
k = _k

def at(vid, pos):
    for onset, dur, p in parsed[vid]:
        if onset <= pos < onset + dur: return p
    return None

# Roman numeral on each beat, from the notes sounding ON the beat.
seq = []
for pos in range(0, total, BEAT):
    spelled = [p for vid in order if (p := at(vid, pos))]
    if len(spelled) < 3: seq.append(None); continue
    try:
        fig = roman.romanNumeralFromChord(m21chord.Chord(spelled), k).figure
        # By ROOT, not by figure: I and I6 are the same harmony held, not two
        # chords. Counting inversions as changes is what makes a piece look
        # busier than it is.
        m2 = re.match(r"[#b]*[ivIV]+", fig)
        seq.append(m2.group(0) if m2 else fig)
    except Exception:
        seq.append(None)

# Collapse consecutive identical numerals into runs.
runs, cur, n = [], None, 0
for fig in seq + [object()]:
    if fig == cur: n += 1
    else:
        if cur is not None and n: runs.append((cur, n))
        cur, n = fig, 1
lengths = Counter(n for fig, n in runs if fig)
tot = sum(lengths.values())
print(f"TRANSCRIPTION  ({PATH})")
print("  how long a chord lasts, in quarter-note beats")
for beats in sorted(lengths):
    label = {1: "1 beat", 2: "2 beats (half bar)", 4: "4 beats (a full bar)"}.get(beats, f"{beats} beats")
    print(f"    {label:<22} {lengths[beats]:>4}  {100*lengths[beats]/tot:>5.1f}%")
mean = sum(b * c for b, c in lengths.items()) / tot
print(f"    mean {mean:.2f} beats   longest {max(lengths)} beats   {tot} chord spans over {total//UNIT} bars")
print(f"    chord changes per bar: {tot / (total // UNIT):.2f}")

# ---- Where in the bar does a new chord begin? ----------------------------
# The length of a chord matters less than whether its arrival lines up with the
# metre. A chord that starts on beat 4 and runs into the next bar is syncopated
# harmony, which this style does not do.
starts = Counter()
pos_beats = 0
for fig, n in runs:
    if fig:
        starts[pos_beats % BEATS_PER_BAR + 1] += 1
    pos_beats += n
tot_starts = sum(starts.values())
print("\n  new chords begin on beat")
for beat in sorted(starts):
    bar_pos = {1: " (downbeat)", 3: " (half bar)"}.get(beat, "")
    print(f"    beat {beat}{bar_pos:<12} {starts[beat]:>4}  {100*starts[beat]/tot_starts:>5.1f}%")
on_metre = sum(c for b, c in starts.items() if b in (1, 3))
print(f"    on beat 1 or 3: {100*on_metre/tot_starts:.1f}%")
