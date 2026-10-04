"""A sung 'ah' for the tuner capture's fake microphone: harmonics shaped by
the vowel's formants, vibrato, a glide from a little flat into tune, then a
step to another note. Written as 16-bit mono WAV (Chrome's fake capture)."""
import math, struct, wave, sys

RATE = 48000
def formant_gain(f, formants):
    g = 0.0
    for fc, bw, amp in formants:
        g += amp / (1 + ((f - fc) / (bw / 2)) ** 2)
    return g
AH = [(730, 110, 1.0), (1090, 120, 0.5), (2440, 170, 0.25)]

# (seconds, start Hz, end Hz): A3 from 30 cents flat into tune, hold; then C4; then E4.
segments = [(3.0, 220 * 2 ** (-30 / 1200), 220.0), (4.0, 220.0, 220.0), (0.25, 220.0, 261.63), (4.0, 261.63, 261.63), (0.25, 261.63, 329.63), (4.5, 329.63, 329.63)]
out, phase, t0 = [], 0.0, 0.0
for dur, f_a, f_b in segments:
    n = int(dur * RATE)
    for i in range(n):
        t = t0 + i / RATE
        base = f_a + (f_b - f_a) * min(1, i / max(1, n * 0.6))
        f = base * 2 ** ((18 * math.sin(2 * math.pi * 5.4 * t)) / 1200)
        phase += 2 * math.pi * f / RATE
        s = 0.0
        for h in range(1, 28):
            fh = f * h
            if fh > 5000: break
            s += formant_gain(fh, AH) / h ** 0.6 * math.sin(h * phase)
        env = min(1, t * 3) * min(1, (sum(d for d, _, _ in segments) - t) * 3)
        out.append(s * 0.18 * env)
    t0 += dur
peak = max(abs(v) for v in out)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(v / peak * 0.8 * 32767)) for v in out))
