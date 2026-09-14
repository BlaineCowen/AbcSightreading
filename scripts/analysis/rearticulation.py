"""How often is a half note sung as two repeated quarters?

Counts, per voice, the half notes against the adjacent same-pitch quarter pairs
that sit where a half note could have been. The generator's weight for the
Rearticulation figure is set from this rather than by feel.
"""
import re, sys
from collections import Counter
PATH = sys.argv[1] if len(sys.argv) > 1 else "scores/forgotten.abc"
text = open(PATH, encoding="utf-8").read()
DENOM = int(m.group(1)) if (m := re.search(r"^L:1/(\d+)", text, re.M)) else 8
QUARTER = DENOM // 4
HALF = DENOM // 2
TOKEN = re.compile(r"(?P<acc>[=^_]{0,2})(?P<letter>[A-Ga-gz])(?P<oct>[,']*)(?P<dur>\d*)")

voices, order = {}, []
for line in text.splitlines():
    m = re.match(r"^\[V:(\w+)\]\s*(.*)$", line)
    if m:
        if m.group(1) not in voices: order.append(m.group(1))
        voices[m.group(1)] = voices.get(m.group(1), "") + " " + m.group(2)

tot_half = tot_pairs = 0
rows = []
for v in order:
    ev = []
    for bar in re.split(r"\|+", voices[v]):
        for t in TOKEN.finditer(bar):
            L, octs = t.group("letter"), t.group("oct")
            dur = int(t.group("dur")) if t.group("dur") else 1
            if L == "z": ev.append((None, dur)); continue
            octv = (5 if L.islower() else 4) + octs.count("'") - octs.count(",")
            ev.append((f"{L.upper()}{octv}", dur))
    halves = sum(1 for p, d in ev if p and d == HALF)
    pairs = sum(
        1 for i in range(1, len(ev))
        if ev[i][0] and ev[i][0] == ev[i-1][0] and ev[i][1] == ev[i-1][1] == QUARTER
    )
    rows.append((v, halves, pairs)); tot_half += halves; tot_pairs += pairs
print(f"{PATH}  (L:1/{DENOM}, quarter={QUARTER}, half={HALF})")
for v, h, p in rows:
    print(f"  {v:<3} half notes {h:>3}   repeated-quarter pairs {p:>3}")
print(f"  total: {tot_half} half notes, {tot_pairs} repeated-quarter pairs")
den = tot_half + tot_pairs
if den:
    print(f"  a half-note beat is written as two repeated quarters {100*tot_pairs/den:.1f}% of the time")
