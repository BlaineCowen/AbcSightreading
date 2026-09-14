"""Print given bars across all voices, for checking one moment at a time."""
import re, sys
PATH = "scores/forgotten.abc"
wanted = [int(a) for a in sys.argv[1:]] or [1]
text = open(PATH, encoding="utf-8").read()
voices = {}
order = []
for line in text.splitlines():
    m = re.match(r"^\[V:(\w+)\]\s*(.*)$", line)
    if m:
        if m.group(1) not in voices: order.append(m.group(1))
        voices[m.group(1)] = voices.get(m.group(1), "") + " " + m.group(2)
bars = {v: [b.strip() for b in re.split(r"\|+", mus) if b.strip() not in ("", "]")] for v, mus in voices.items()}
for n in wanted:
    print(f"bar {n}")
    for v in order:
        print(f"   {v:<2} {bars[v][n-1] if n-1 < len(bars[v]) else '(none)'}")
    print()
