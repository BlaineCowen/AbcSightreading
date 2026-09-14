"""Harmonic and stylistic analysis of a hand-transcribed SATB ABC score."""
import re, sys
from collections import Counter, defaultdict
from music21 import chord as m21chord, key as m21key, roman, pitch as m21pitch

PATH = sys.argv[1] if len(sys.argv) > 1 else "scores/forgotten.abc"
text = open(PATH, encoding="utf-8").read()
KEY = re.search(r"^K:(\S+)", text, re.M).group(1)
UNIT = 8  # eighths per bar

TOKEN = re.compile(r"(?P<acc>[=^_]{0,2})(?P<letter>[A-Ga-gz])(?P<oct>[,']*)(?P<dur>\d*)")
SHARP = {"^": 1, "^^": 2, "_": -1, "__": -2, "=": 0}
KEY_ACC = {  # Ab major
    "A": -1, "B": -1, "C": 0, "D": -1, "E": -1, "F": 0, "G": 0,
}

def parse_voice(music):
    """-> list of (onset_eighths, duration, midi|None), plus per-bar accidental state."""
    events = []
    onset = 0
    for bar in re.split(r"\|+", music):
        if bar.strip() in ("", "]"):
            continue
        active = {}  # accidentals persist within a bar
        for t in TOKEN.finditer(bar):
            letter, octs = t.group("letter"), t.group("oct")
            dur = int(t.group("dur")) if t.group("dur") else 1
            if letter == "z":
                events.append((onset, dur, None)); onset += dur; continue
            step = letter.upper()
            if t.group("acc"):
                active[step] = SHARP[t.group("acc")]
            alter = active.get(step, KEY_ACC[step])
            base = {"C":0,"D":2,"E":4,"F":5,"G":7,"A":9,"B":11}[step]
            octave = (5 if letter.islower() else 4) + octs.count("'") - octs.count(",")
            acc = {-2: "--", -1: "-", 0: "", 1: "#", 2: "##"}[alter]
            events.append((onset, dur, (12 * (octave + 1) + base + alter, f"{step}{acc}{octave}")))
            onset += dur
    return events

voices, order = {}, []
for line in text.splitlines():
    m = re.match(r"^\[V:(\w+)\]\s*(.*)$", line)
    if m:
        if m.group(1) not in voices: order.append(m.group(1))
        voices[m.group(1)] = voices.get(m.group(1), "") + " " + m.group(2)
parsed = {v: parse_voice(mus) for v, mus in voices.items()}
total_eighths = max(sum(d for _, d, _ in ev) for ev in parsed.values())
bars = total_eighths // UNIT

def sounding_at(vid, pos):
    """-> ((midi, spelled) | None, onset)"""
    for onset, dur, p in parsed[vid]:
        if onset <= pos < onset + dur:
            return p, onset
    return None, None

k = m21key.Key(KEY.replace("b", "-"))
print(f"key {k}   {bars} bars   voices {', '.join(order)}\n")

# ---- harmony per half-bar (minim), which is where this piece changes chord
print("HARMONY  (roman numeral per half bar)")
rows = []
for bar in range(bars):
    cells = []
    for half in (0, 4):
        pos = bar * UNIT + half
        spelled = []
        for vid in order:
            p, _ = sounding_at(vid, pos)
            if p is not None:
                spelled.append(p[1])
        if not spelled:
            cells.append("--"); continue
        # Spelled names, not MIDI: from an integer music21 picks sharps, so an
        # A-flat chord in A-flat major came back as #VII.
        c = m21chord.Chord(spelled)
        try:
            rn = roman.romanNumeralFromChord(c, k).figure
        except Exception:
            rn = "?"
        cells.append(rn)
    rows.append((bar + 1, cells))
for i in range(0, len(rows), 4):
    print("  " + "   ".join(f"m{n:<3}{a:<10}{b:<10}" for n, (a, b) in
                            [(r[0], r[1]) for r in rows[i:i+4]]))

# ---------------------------------------------------------------- sections
SECTIONS = [("A", 1, 10), ("B", 11, 15), ("C", 16, 19), ("fugato", 20, 26),
            ("A'", 27, 34), ("coda", 35, 44)]
def section_of(bar):
    for name, lo, hi in SECTIONS:
        if lo <= bar <= hi: return name
    return "?"

# ---------------------------------------------------------------- rhythm
print("\nRHYTHM  (note values, as eighth-multiples)")
LABEL = {1: "eighth", 2: "quarter", 3: "dotted quarter", 4: "half",
         6: "dotted half", 8: "whole"}
per_voice = {}
overall = Counter()
for vid in order:
    c = Counter()
    for _, dur, p in parsed[vid]:
        c[dur] += 1; overall[dur] += 1
    per_voice[vid] = c
widths = sorted(overall)
print("  " + "".join(f"{LABEL.get(w, str(w)):>16}" for w in widths))
for vid in order:
    print(f"  {vid:<2}" + "".join(f"{per_voice[vid].get(w, 0):>16}" for w in widths))
tot = sum(overall.values())
print("  %" + "".join(f"{100*overall[w]/tot:>15.1f}" for w in widths))

# rests
rests = {vid: sum(1 for _, _, p in parsed[vid] if p is None) for vid in order}
print(f"\n  rests: " + ", ".join(f"{v}={n}" for v, n in rests.items()))

# ---------------------------------------------------------------- accidentals
print("\nACCIDENTALS  (written, by bar)")
acc_by_bar = defaultdict(list)
for vid, music in voices.items():
    onset = 0
    for bar_i, bar in enumerate(re.split(r"\|+", music), start=0):
        if bar.strip() in ("", "]"): continue
        for t in TOKEN.finditer(bar):
            if t.group("acc"):
                acc_by_bar[bar_i].append(f"{vid}:{t.group(0).strip()}")
counted = 0
for bar in sorted(acc_by_bar):
    counted += len(acc_by_bar[bar])
    print(f"  m{bar+1:<3} [{section_of(bar+1):<6}] " + "  ".join(acc_by_bar[bar]))
print(f"  total {counted}")

# ---------------------------------------------------------------- NCTs
print("\nNON-CHORD TONES  (against the half-bar roman numeral)")
# The chord is the roman numeral's own pitch classes, not the raw sonority.
# Testing a note against what the other three voices happen to be singing
# counts one decoration as evidence that another is a chord tone, and put the
# rate at an impossible 56%.
chord_pcs = {}
for bar in range(bars):
    for half in (0, 4):
        pos = bar * UNIT + half
        spelled = []
        for vid in order:
            q, _ = sounding_at(vid, pos)
            if q is not None: spelled.append(q[1])
        if not spelled: continue
        try:
            rn = roman.romanNumeralFromChord(m21chord.Chord(spelled), k)
            chord_pcs[pos] = ({pp.pitchClass for pp in rn.pitches}, rn.figure)
        except Exception:
            chord_pcs[pos] = ({m21pitch.Pitch(n).pitchClass for n in spelled}, "?")

kinds = Counter(); by_section = Counter(); examples = []
for vid in order:
    ev = [(o, d, q) for o, d, q in parsed[vid] if q is not None]
    for idx, (onset, dur, q) in enumerate(ev):
        pos = (onset // 4) * 4
        if pos not in chord_pcs: continue
        tones, figure = chord_pcs[pos]
        if q[0] % 12 in tones: continue
        prev = ev[idx-1][2][0] if idx > 0 else None
        nxt = ev[idx+1][2][0] if idx + 1 < len(ev) else None
        if prev is None or nxt is None: continue
        a, b = q[0] - prev, nxt - q[0]
        strong = (onset % 4) == 0
        if a == 0 and abs(b) <= 2: kind = "suspension" if strong else "repeat into step"
        elif abs(a) <= 2 and abs(b) <= 2 and a * b > 0: kind = "passing"
        elif abs(a) <= 2 and abs(b) <= 2 and a * b < 0: kind = "neighbour"
        elif abs(a) > 2 and abs(b) <= 2: kind = "appoggiatura"
        elif abs(a) <= 2 and abs(b) > 2: kind = "escape"
        else: kind = "other"
        kinds[kind] += 1; by_section[section_of(onset // UNIT + 1)] += 1
        if len(examples) < 8:
            examples.append(f"m{onset//UNIT+1} {vid} {q[1]} over {figure} ({kind})")
total_nct = sum(kinds.values())
sounded = sum(len([1 for _, _, q in parsed[v] if q is not None]) for v in order)
print(f"  {total_nct} of {sounded} sounded notes ({100*total_nct/sounded:.1f}%)")
for kind, n in kinds.most_common():
    print(f"    {kind:<18} {n:>4}  {100*n/total_nct:>5.1f}%")
print("  by section: " + ", ".join(f"{s}={n}" for s, n in by_section.items()))
print("  e.g. " + "; ".join(examples[:5]))

# ---------------------------------------------------------------- vocabulary
print("\nCHORD VOCABULARY  (half-bar sonorities)")
vocab = Counter(fig for _, (_, fig) in sorted(chord_pcs.items()))
simple = Counter()
for fig, n in vocab.items():
    root = re.match(r"[#b]*[ivIV]+", fig)
    simple[root.group(0) if root else fig] += n
for fig, n in simple.most_common(14):
    print(f"    {fig:<10} {n:>4}  {100*n/sum(simple.values()):>5.1f}%")

print("\nSECTION BOUNDARIES  (harmony at the bar each section starts / ends)")
for name, lo, hi in SECTIONS:
    def fig_at(bar, half=0):
        return chord_pcs.get((bar - 1) * UNIT + half, (None, "--"))[1]
    print(f"    {name:<7} m{lo:<3}->m{hi:<3}   opens {fig_at(lo):<12} closes {fig_at(hi):<10} then {fig_at(hi, 4)}")

print("\nWHERE VOICES REST  (bars in which a part is silent for a whole bar)")
for vid in order:
    silent = []
    for bar in range(bars):
        if all(sounding_at(vid, bar * UNIT + e)[0] is None for e in range(UNIT)):
            silent.append(bar + 1)
    if silent:
        print(f"    {vid}: " + ", ".join(f"m{b}" for b in silent))
