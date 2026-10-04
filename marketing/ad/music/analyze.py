"""Beat, downbeat and section analysis of a song, for cutting the ad to it.

    python3 music/analyze.py assets/music/kids-song.mp3 > music/kids-song.json

Tempo from onset autocorrelation; beat phase from a comb over the onsets;
downbeat (which beat of four is 1) from low-frequency onsets, where the kick
lives; section changes from a novelty curve over chroma (a checkerboard
kernel on the self-similarity matrix), reported at the nearest downbeat.
numpy only.
"""
import json, subprocess, sys
import numpy as np

R = 22050
path = sys.argv[1]
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(R), "-f", "f32le", "-"], capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32).copy()

N, HOP = 2048, 512
frames = 1 + (len(x) - N) // HOP
win = np.hanning(N).astype(np.float32)
spec = np.empty((frames, N // 2 + 1), dtype=np.float32)
for i in range(frames):
    spec[i] = np.abs(np.fft.rfft(x[i * HOP:i * HOP + N] * win))
fr = R / HOP
freqs = np.fft.rfftfreq(N, 1 / R)

def flux(lo, hi):
    band = np.log1p(spec[:, (freqs >= lo) & (freqs < hi)] * 10)
    d = np.maximum(0, np.diff(band, axis=0)).sum(1)
    return np.concatenate([[0], d - np.convolve(d, np.ones(16) / 16, "same")]).clip(0)

onset = flux(30, 11000)
low = flux(30, 160)

def tempo_score(bpm):
    lag = fr * 60 / bpm
    tot = 0
    for m in (1, 2, 4):
        L = lag * m; l0 = int(L); w = L - l0
        tot += (1 - w) * np.dot(onset[:-l0 - 1], onset[l0:-1]) + w * np.dot(onset[:-l0 - 1], onset[l0 + 1:])
    return tot

cands = np.arange(70, 180, 0.02)
bpm = float(cands[int(np.argmax([tempo_score(b) for b in cands]))])
beat = 60 / bpm
dur = len(x) / R
at = lambda sig, t: sig[min(len(sig) - 1, int(round(t * fr)))]
phases = np.arange(0, beat, 0.002)
phase = float(phases[int(np.argmax([sum(at(onset, p + k * beat) for k in range(int((dur - p) / beat))) for p in phases]))])
beats = [phase + k * beat for k in range(int((dur - phase) / beat))]
# Which beat of four carries the kick most: that is beat 1.
kick = [np.mean([max(at(low, b), at(low, b + 0.02)) for b in beats[k::4]]) for k in range(4)]
first = int(np.argmax(kick))
downbeats = beats[first::4]

# Sections: chroma per beat, self-similarity, checkerboard novelty over 8 beats.
pc = (np.round(12 * np.log2(np.maximum(freqs, 1) / 440)) % 12).astype(int)
band = (freqs > 60) & (freqs < 4000)
chroma = np.zeros((frames, 12), dtype=np.float32)
for k in range(12):
    chroma[:, k] = spec[:, band & (pc == k)].sum(1)
per_beat = np.array([chroma[int(b * fr):int((b + beat) * fr)].mean(0) for b in beats])
per_beat /= np.linalg.norm(per_beat, axis=1, keepdims=True) + 1e-9
S = per_beat @ per_beat.T
K = 8
kern = np.kron(np.array([[1, -1], [-1, 1]]), np.ones((K, K)))
nov = np.zeros(len(beats))
for i in range(K, len(beats) - K):
    nov[i] = (S[i - K:i + K, i - K:i + K] * kern).sum()
nov = np.maximum(nov, 0)
peaks = [i for i in range(1, len(nov) - 1) if nov[i] >= nov[i - 1] and nov[i] >= nov[i + 1] and nov[i] > 0.35 * nov.max()]
sections = sorted({min(downbeats, key=lambda d: abs(d - beats[i])) for i in peaks})
loud = [float(20 * np.log10(np.sqrt(np.mean(x[int(d * R):int((d + 4 * beat) * R)] ** 2)) + 1e-9)) for d in downbeats]

print(json.dumps({
    "file": path, "duration": round(dur, 3), "bpm": round(bpm, 3), "beat": round(beat, 5),
    "first_beat": round(phase, 4), "downbeat_index": first, "kick_by_beat": [round(float(v), 3) for v in kick],
    "downbeats": [round(d, 3) for d in downbeats], "sections": [round(s, 3) for s in sections],
    "bar_loudness_db": [round(v, 1) for v in loud],
}, indent=1))
