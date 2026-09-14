"""How often do two voices decorate at the same moment?"""
import re, sys
from collections import Counter
from music21 import chord as m21chord, key as m21key, roman
PATH = sys.argv[1] if len(sys.argv) > 1 else "scores/forgotten.abc"
text = open(PATH, encoding="utf-8").read()
KEY = re.search(r"^K:(\S+)", text, re.M).group(1)
_l = re.search(r"^L:1/(\d+)", text, re.M); _m = re.search(r"^M:(\d+)/(\d+)", text, re.M)
DENOM = int(_l.group(1)) if _l else 8
UNIT = (int(_m.group(1)) if _m else 4) * DENOM // (int(_m.group(2)) if _m else 4)
BEAT = DENOM // 4
k = m21key.Key(KEY.replace("b", "-"))
KEY_ACC = {s: (int(k.accidentalByStep(s).alter) if k.accidentalByStep(s) else 0) for s in "ABCDEFG"}
TOKEN = re.compile(r"(?P<acc>[=^_]{0,2})(?P<letter>[A-Ga-gz])(?P<oct>[,']*)(?P<dur>\d*)")
ALT = {"^":1,"^^":2,"_":-1,"__":-2,"=":0}
def parse(music):
    ev, onset = [], 0
    for bar in re.split(r"\|+", music):
        if bar.strip() in ("", "]"): continue
        active = {}
        for t in TOKEN.finditer(bar):
            L, octs = t.group("letter"), t.group("oct")
            dur = int(t.group("dur")) if t.group("dur") else 1
            if L == "z": ev.append((onset, dur, None)); onset += dur; continue
            step = L.upper()
            if t.group("acc"): active[step] = ALT[t.group("acc")]
            alter = active.get(step, KEY_ACC[step])
            acc = {-2:"--",-1:"-",0:"",1:"#",2:"##"}[alter]
            octv = (5 if L.islower() else 4) + octs.count("'") - octs.count(",")
            ev.append((onset, dur, f"{step}{acc}{octv}")); onset += dur
    return ev
voices, order = {}, []
for line in text.splitlines():
    m = re.match(r"^\[V:(\w+)\]\s*(.*)$", line)
    if m:
        if m.group(1) not in voices: order.append(m.group(1))
        voices[m.group(1)] = voices.get(m.group(1), "") + " " + m.group(2)
parsed = {v: parse(mus) for v, mus in voices.items()}
total = max(sum(d for _, d, _ in ev) for ev in parsed.values())
def at(vid, pos):
    for o, d, p in parsed[vid]:
        if o <= pos < o + d: return p, o
    return None, None
chord_at = {}
for pos in range(0, total, BEAT * 2):
    sp = [p for v in order if (p := at(v, pos)[0])]
    if len(sp) < 3: continue
    try:
        chord_at[pos] = {pp.pitchClass for pp in roman.romanNumeralFromChord(m21chord.Chord(sp), k).pitches}
    except Exception: pass
# Mark every onset that is a non-chord tone.
nct_onsets = {v: set() for v in order}
for v in order:
    for o, d, p in parsed[v]:
        if p is None: continue
        base = (o // (BEAT * 2)) * (BEAT * 2)
        if base not in chord_at: continue
        pc = m21chord.Chord([p]).pitches[0].pitchClass
        if pc not in chord_at[base]: nct_onsets[v].add(o)
simultaneous = Counter()
all_onsets = sorted({o for v in order for o in nct_onsets[v]})
for o in all_onsets:
    n = sum(1 for v in order if o in nct_onsets[v])
    simultaneous[n] += 1
tot_moments = sum(simultaneous.values())
tot_ncts = sum(len(nct_onsets[v]) for v in order)
print(f"{PATH}")
print(f"  {tot_ncts} non-chord tones at {tot_moments} distinct moments")
for n in sorted(simultaneous):
    print(f"    {n} voice{'s' if n > 1 else ' '} decorating together   {simultaneous[n]:>4}  {100*simultaneous[n]/tot_moments:>5.1f}%")
together = sum(c for n, c in simultaneous.items() if n >= 2)
print(f"    two or more at once: {100*together/tot_moments:.1f}% of moments")

# ---- Are the pairs coordinated, or merely coincident? --------------------
# The question is not how often two voices decorate at once, but whether the
# pair is a figure: a double suspension resolving in parallel thirds, or two
# passing tones exchanging in contrary motion. Both leave a consonance.
def midi_of(name):
    return m21chord.Chord([name]).pitches[0].midi
pairs = Counter()
for o in all_onsets:
    doing = [v for v in order if o in nct_onsets[v]]
    if len(doing) != 2: continue
    a, b = doing
    pa, pb = at(a, o)[0], at(b, o)[0]
    if not pa or not pb: continue
    iv = abs(midi_of(pa) - midi_of(pb)) % 12
    # Where each voice came from, to get its direction.
    def prev_of(v):
        seq = [(oo, dd, pp) for oo, dd, pp in parsed[v] if pp is not None and oo < o]
        return seq[-1][2] if seq else None
    qa, qb = prev_of(a), prev_of(b)
    if not qa or not qb: continue
    da = midi_of(pa) - midi_of(qa)
    db = midi_of(pb) - midi_of(qb)
    consonant = iv in (3, 4, 8, 9, 0, 7)
    if da == 0 and db == 0: motion = "both suspended"
    elif da * db > 0: motion = "parallel"
    elif da * db < 0: motion = "contrary"
    else: motion = "oblique"
    pairs[(motion, "consonant" if consonant else "dissonant")] += 1
tp = sum(pairs.values())
if tp:
    print("  of the two-voice moments:")
    for (motion, quality), n in pairs.most_common():
        print(f"    {motion:<16} {quality:<10} {n:>3}  {100*n/tp:>5.1f}%")
    good = sum(n for (m_, q), n in pairs.items() if q == "consonant" and m_ != "oblique")
    print(f"    coordinated (consonant, moving together): {100*good/tp:.1f}%")
