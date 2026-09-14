"""Melodic leaps that look like a missing or stray octave mark."""
import re, sys
PATH = sys.argv[1] if len(sys.argv) > 1 else "scores/forgotten.abc"
text = open(PATH, encoding="utf-8").read()
TOKEN = re.compile(r"(?P<acc>[=^_]{0,2})(?P<letter>[A-Ga-gz])(?P<oct>[,']*)(?P<dur>\d*)")
NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
def midi(letter, octs):
    if letter == "z": return None
    base = {"C":0,"D":2,"E":4,"F":5,"G":7,"A":9,"B":11}[letter.upper()]
    octave = (5 if letter.islower() else 4) + octs.count("'") - octs.count(",")
    return 12 * (octave + 1) + base
def name(p): return f"{NAMES[p % 12]}{p // 12 - 1}"

voices = {}
for line in text.splitlines():
    m = re.match(r"^\[V:(\w+)\]\s*(.*)$", line)
    if m: voices[m.group(1)] = voices.get(m.group(1), "") + " " + m.group(2)

print("Leaps wider than a sixth (9 semitones), which usually mean a missing or stray comma:\n")
for vid, music in voices.items():
    bars = [b for b in re.split(r"\|+", music) if b.strip() not in ("", "]")]
    seq = []  # (bar, token, midi)
    for i, bar in enumerate(bars, start=1):
        for t in TOKEN.finditer(bar):
            p = midi(t.group("letter"), t.group("oct"))
            if p is not None:
                seq.append((i, t.group(0), p))
    for k in range(1, len(seq)):
        (b0, t0, p0), (b1, t1, p1) = seq[k-1], seq[k]
        gap = abs(p1 - p0)
        if gap >= 9:
            print(f"  {vid} bar {b1:>3}: {t0}({name(p0)}) -> {t1}({name(p1)})  = {gap} semitones"
                  + ("   <-- an octave exactly" if gap == 12 else ""))
