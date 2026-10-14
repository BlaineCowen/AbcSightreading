"""
Take 4 (7 October 2026, a better microphone): one read, cleaned before it is
cut. DeepFilterNet (deep-filter 0.5.6, the command-line release) then Demucs
(htdemucs, vocals stem) take the room out: the noise floor between lines
went from -59 dB to -76 dB. The result is assets/vo/take4-clean.wav, which
this script cuts. To redo the cleaning:

    deep-filter -o df take4-48k.wav
    python -m demucs --two-stems vocals -n htdemucs -o out df/take4-48k.wav

The older notes, for takes 1-3:

The promo's voiceover from Blaine's takes (assets/vo/take1-3.m4a, transcribed
by whisper into take1-3.json with word times):

    whisper take1.m4a take2.m4a take3.m4a --model medium --language en --word_timestamps True --output_format json
    python3 vo.py      ->  assets/vo/line01..10.wav (cut, cleaned), v-lineNN.wav (levelled), lines.json, words.json

Take 3 throughout (Blaine's pick), line 4 from take 2 (take 3 slurred
"over rock, soul, cumbia"). Each line is cut on its words with a little air,
then: high-pass 80 Hz, light noise reduction, a low-end lift at 150 Hz, some
presence at 3.2 kHz, de-essing, gentle compression; then levelled to about
-16 LUFS each so the take 2 line matches.
"""
import json, subprocess

V = "assets/vo/"
PLAN = [("take4", k) for k in range(10)]
# The source each take is cut from: take 4 already cleaned (above), so no afftdn on it.
SOURCE = {"take4": "take4-clean.wav"}
# Blaine heard nasality and loud h's (8 October): the voice has a bump at 1.4-1.6 kHz, now cut
# 3.5 dB; the 3.2 kHz presence lift is gone (it raised every h and s), and the de-esser is harder.
# The compressor still lifts the unvoiced sounds, so after it soften_unvoiced turns them down.
CHAIN = ("highpass=f=80,bass=g=3:f=150:w=0.8,equalizer=f=1500:t=q:w=1.4:g=-3.5,"
         "deesser=i=0.45,acompressor=threshold=-26dB:ratio=3:attack=6:release=90:makeup=2")


def lines(take):
    s = json.load(open(f"{V}{take}.json"))["segments"]
    if take == "ai":
        # Whisper split "Or sing it. / Your melody..." and line 7 at its full stop: one line each.
        j = lambda a, b: {**a, "end": b["end"], "words": a["words"] + b["words"], "text": a["text"] + b["text"]}
        s = s[:4] + [j(s[4], s[5])] + s[6:7] + [j(s[7], s[8])] + s[9:]
    if take == "take2":
        # Take 2 split line 7 in two ("Counting... syllables." / "Movable do..."): one line.
        s = s[:6] + [{**s[6], "end": s[7]["end"], "words": s[6]["words"] + s[7]["words"], "text": s[6]["text"] + s[7]["text"]}] + s[8:]
    return s


def lufs(path):
    out = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float([l for l in out.splitlines() if l.strip().startswith("I:")][-1].split()[1])


import numpy as np, wave

# Take 4's first line was replaced by a new opening (7 October): "Sight reading
# music doesn't have to sound like this." over the cat at the piano.
PLAN = [("opening", 0)] + [("take4", k) for k in range(1, 10)]
SOURCE.update({"opening": "opening-clean.wav"})

# Breaths: a pause between words of at least BREATH_GAP is turned down by
# BREATH_DUCK in its middle only, BREATH_MARGIN clear of the words either side,
# so no syllable is touched and nothing is cut out (the first try chopped the
# line word by word and clipped onsets, 7 October). Lines are cut whole, with
# LEAD before the first word and TAIL after the last.
BREATH_GAP = 0.3
BREATH_MARGIN = 0.1
BREATH_DUCK = 0.15   # about -16 dB
LEAD, TAIL = 0.22, 0.18
SR = 48000


def read_mono(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


# Unvoiced sounds (h, s, f, sh, t's breath): a frame whose energy is mostly above 2.5 kHz is
# turned down by up to SOFTEN_DB, scaled by how noisy it is, the gain smoothed over 15 ms so no
# vowel is touched. It took the h's and s's from 1.6 dB under the vowels to about 6 under.
SOFTEN_DB = 6.0


def soften_unvoiced(x):
    n, hop = 1024, 256
    win = np.hanning(n)
    pad = np.concatenate([np.zeros(n // 2, np.float32), x, np.zeros(n, np.float32)])
    f = np.fft.rfftfreq(n, 1 / SR)
    hi = f > 2500
    g = []
    for i in range(0, len(x), hop):
        p = np.abs(np.fft.rfft(pad[i:i + n] * win)) ** 2
        share = p[hi].sum() / (p.sum() + 1e-12)
        g.append(min(1.0, max(0.0, (share - 0.35) / 0.3)))
    g = np.repeat(np.array(g, np.float32), hop)[:len(x)]
    k = int(0.015 * SR)
    g = np.convolve(g, np.ones(k, np.float32) / k, mode="same")
    return x * 10 ** (-SOFTEN_DB * g / 20)


def write_wav(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


# VOICE=ai (8 October): an ElevenLabs read of the same script (assets/vo/ai.mp3,
# whisper into ai.json), Kodaly said as "ta's and ti's". It is clean already, so
# none of the cleanup above, which was tuned to Blaine's room and voice.
import os
AI = os.environ.get("VOICE") == "ai"
if AI:
    PLAN = [("ai", k) for k in range(10)]
    SOURCE["ai"] = "ai.mp3"
    CHAIN = "highpass=f=60"

info, words = [], []
for k, (take, i) in enumerate(PLAN):
    L = lines(take)
    ws = L[i]["words"]
    a, b = ws[0]["start"] - LEAD, ws[-1]["end"] + TAIL
    if i > 0:
        a = max(a, L[i - 1]["words"][-1]["end"] + 0.15)
    if i + 1 < len(L):
        b = min(b, L[i + 1]["words"][0]["start"] - 0.15)
    src = read_mono(f"{V}{SOURCE.get(take, take + '.m4a')}")
    seg = src[int(a * SR):int(b * SR)].copy()
    gain_curve = np.ones(len(seg), np.float32)
    for w0, w1 in zip(ws, ws[1:]):
        g0, g1 = w0["end"] + BREATH_MARGIN - a, w1["start"] - BREATH_MARGIN - a
        if w1["start"] - w0["end"] < BREATH_GAP or g1 - g0 < 0.06:
            continue
        i0, i1, r = int(g0 * SR), int(g1 * SR), int(0.03 * SR)
        gain_curve[i0:i1] = BREATH_DUCK
        gain_curve[i0:i0 + r] = np.linspace(1, BREATH_DUCK, r)
        gain_curve[i1 - r:i1] = np.linspace(BREATH_DUCK, 1, r)
    seg *= gain_curve
    pieces = [seg]
    times = [{"w": w["word"].strip(), "t": round(w["start"] - a, 3), "e": round(w["end"] - a, 3)} for w in ws]
    t = len(seg) / SR
    tmp, raw, out = f"{V}cut{k + 1:02d}.wav", f"{V}line{k + 1:02d}.wav", f"{V}v-line{k + 1:02d}.wav"
    write_wav(tmp, np.concatenate(pieces))
    n = t
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp,
                    "-af", f"{CHAIN},afade=t=in:d=0.06,afade=t=out:st={max(0, n - 0.1):.3f}:d=0.1", "-ar", "48000", "-ac", "1", raw], check=True)
    if not AI:
        write_wav(raw, soften_unvoiced(read_mono(raw)))
    gain = -16 - lufs(raw)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:attack=3:release=40:level=disabled",
                    "-ar", "48000", out], check=True)
    x = {"line": k + 1, "take": take, "from": round(a, 3), "to": round(b, 3), "len": round(n, 3), "text": L[i]["text"].strip()}
    info.append(x)
    words.append({**x, "words": times})
    print(f"{k + 1:2d} {take:8s} {b - a:5.2f}s -> {n:5.2f}s {gain:+.1f} dB  {x['text']}")
json.dump(info, open(f"{V}lines.json", "w"), indent=1)
json.dump(words, open(f"{V}words.json", "w"), indent=1)
