"""Bar-length and range check for a hand-transcribed ABC score."""
import re, sys
from collections import Counter

PATH = sys.argv[1] if len(sys.argv) > 1 else "scores/forgotten.abc"
text = open(PATH, encoding="utf-8").read()

UNIT = 8  # L:1/8, M:4/4 -> 8 eighths per bar
TOKEN = re.compile(r"(?P<acc>[=^_]{0,2})(?P<letter>[A-Ga-gz])(?P<oct>[,']*)(?P<dur>\d*)(?P<dot>\.?)")

def midi(letter, octs):
    if letter == "z":
        return None
    base = {"C":0,"D":2,"E":4,"F":5,"G":7,"A":9,"B":11}[letter.upper()]
    octave = 5 if letter.islower() else 4
    octave += octs.count("'") - octs.count(",")
    return 12 * (octave + 1) + base

voices = {}
for line in text.splitlines():
    m = re.match(r"^\[V:(\w+)\]\s*(.*)$", line)
    if m:
        voices.setdefault(m.group(1), "")
        voices[m.group(1)] += " " + m.group(2)

print(f"{'voice':<6} {'bars':>5} {'bad bars':>9}   detail")
problems = []
ranges = {}
durations = Counter()
for vid, music in voices.items():
    bars = [b for b in re.split(r"\|+", music) if b.strip() not in ("", "]")]
    bad = []
    lo, hi = 200, -1
    for i, bar in enumerate(bars, start=1):
        total = 0
        for t in TOKEN.finditer(bar):
            dur = int(t.group("dur")) if t.group("dur") else 1
            total += dur
            durations[dur] += 1
            p = midi(t.group("letter"), t.group("oct"))
            if p is not None:
                lo, hi = min(lo, p), max(hi, p)
        if total != UNIT:
            bad.append((i, total, bar.strip()))
    ranges[vid] = (lo, hi)
    problems.extend((vid, *b) for b in bad)
    print(f"{vid:<6} {len(bars):>5} {len(bad):>9}   {'' if not bad else 'bars ' + ', '.join(str(b[0]) for b in bad)}")

def name(p):
    names = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
    return f"{names[p % 12]}{p // 12 - 1}"

print("\nRANGES (as written)")
for vid, (lo, hi) in ranges.items():
    print(f"  {vid:<3} {name(lo):>4} .. {name(hi):<4}  ({hi - lo} semitones)")

if problems:
    print("\nBARS THAT DO NOT ADD UP (expected 8 eighths)")
    for vid, i, total, bar in problems:
        print(f"  {vid} bar {i:>3}: {total} eighths  ->  {bar}")
