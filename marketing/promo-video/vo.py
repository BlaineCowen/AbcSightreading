"""
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
PLAN = [("take3", 0), ("take3", 1), ("take3", 2), ("take2", 3), ("take3", 4), ("take3", 5), ("take3", 6), ("take3", 7), ("take3", 8), ("take3", 9)]
CHAIN = ("highpass=f=80,afftdn=nf=-58:nr=12:tn=1,bass=g=4:f=150:w=0.8,equalizer=f=3200:t=q:w=1.2:g=2.5,"
         "deesser=i=0.35,acompressor=threshold=-26dB:ratio=3:attack=6:release=90:makeup=2")


def lines(take):
    s = json.load(open(f"{V}{take}.json"))["segments"]
    if take == "take2":
        # Take 2 split line 7 in two ("Counting... syllables." / "Movable do..."): one line.
        s = s[:6] + [{**s[6], "end": s[7]["end"], "words": s[6]["words"] + s[7]["words"], "text": s[6]["text"] + s[7]["text"]}] + s[8:]
    return s


def lufs(path):
    out = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float([l for l in out.splitlines() if l.strip().startswith("I:")][-1].split()[1])


info, words = [], []
for k, (take, i) in enumerate(PLAN):
    L = lines(take)
    ws = L[i]["words"]
    a, b = ws[0]["start"] - 0.14, ws[-1]["end"] + 0.32
    if i > 0:
        a = max(a, L[i - 1]["words"][-1]["end"] + 0.05)
    if i + 1 < len(L):
        b = min(b, L[i + 1]["words"][0]["start"] - 0.05)
    raw, out = f"{V}line{k + 1:02d}.wav", f"{V}v-line{k + 1:02d}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", f"{V}{take}.m4a",
                    "-af", f"{CHAIN},afade=t=in:d=0.04,afade=t=out:st={max(0, b - a - 0.08):.3f}:d=0.08", "-ar", "48000", "-ac", "1", raw], check=True)
    gain = -16 - lufs(raw)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:attack=3:release=40:level=disabled",
                    "-ar", "48000", out], check=True)
    x = {"line": k + 1, "take": take, "from": round(a, 3), "to": round(b, 3), "len": round(b - a, 3), "text": L[i]["text"].strip()}
    info.append(x)
    all_words = [w for s in json.load(open(f"{V}{take}.json"))["segments"] for w in s["words"]]
    words.append({**x, "words": [{"w": w["word"].strip(), "t": round(w["start"] - a, 3), "e": round(w["end"] - a, 3)}
                                 for w in all_words if w["start"] >= a - 0.05 and w["end"] <= b + 0.05]})
    print(f"{k + 1:2d} {take} {b - a:5.2f}s {gain:+.1f} dB  {x['text']}")
json.dump(info, open(f"{V}lines.json", "w"), indent=1)
json.dump(words, open(f"{V}words.json", "w"), indent=1)
