"""
The play-along promo: Blaine's voiceover over the app's own play-along
videos. Writes the HyperFrames compositions for both cuts and their one
audio mix:

    python3 build.py      ->  ../promo-landscape/index.html (1920x1080)
                              ../promo-vertical/index.html  (1080x1920)
                              assets/music/promo-mix.m4a

The voice: the best of three takes (take 3, line 4 from take 2), each line
cleaned and levelled (assets/vo/v-lineNN.wav, words.json for its word
times). The music: "calm soft" (atlasaudio) as the bed, the click alone
under the first line, then the bed entering on its own beat where the
picture snaps into colour; under line 4 and line 5 the bed gives way to the
real videos' own audio (rock, soul, cumbia, trap, then the band), so the
grooves sell themselves. Footage: capture/exports.ts (the app's Export
video) and capture/ui.ts (the interface, from the screen).
"""
import json, subprocess

W, H = 1920, 1080
FPS = 30
END = 53.0

# Each voice line's start (seconds), after its scene's cut.
VO = [0.55, 6.00, 10.55, 15.75, 20.60, 26.45, 29.55, 36.75, 42.15, 46.90]
WORDS = json.load(open("assets/vo/words.json"))
LEN = [x["len"] for x in WORDS]
def word_at(line, w):
    """The timeline time where line `line` (1-based) says word w (its index)."""
    return VO[line - 1] + WORDS[line - 1]["words"][w]["t"]

# The bed: calm soft's beat grid (0.495 + k * 0.6036 s in the file); its first
# grid beat lands on the snap into colour.
BEAT = 0.6036
SNAP = 5.65
BED_AT = lambda t: t - SNAP + 0.495   # file seconds at timeline t

# Montage cuts: each groove arrives as Blaine names it (line 4's words).
L4 = 4
CUT_SOUL = word_at(L4, 5) - 0.12
CUT_CUMBIA = word_at(L4, 6) - 0.12
CUT_TRAP = word_at(L4, 9) - 0.12
# Line 7: rhythm syllables until "movable", then solfège.
CUT_SOLFEGE = word_at(7, 6) - 0.15
# Line 8: the board (full screen) until "export".
CUT_EXPORT = word_at(8, 10) - 0.15

# Scenes: (id, start). Each runs to the next one's start.
SCENES = [
    ("plain", 0.0), ("open", SNAP), ("ball", 10.35), ("rock", 15.55), ("soul", CUT_SOUL), ("cumbia", CUT_CUMBIA),
    ("trap", CUT_TRAP), ("band", 20.35), ("tempo", 26.15), ("syll", 29.30), ("solf", CUT_SOLFEGE),
    ("board", 36.50), ("export", CUT_EXPORT), ("finish", 41.90), ("close", 46.60),
]
def span(sid):
    i = [s for s, _ in SCENES].index(sid)
    a = SCENES[i][1]
    b = SCENES[i + 1][1] if i + 1 < len(SCENES) else END
    return a, b

# Where each clip is taken from (seconds into its file), set from the captures.
FOOT = json.load(open("assets/footage/offsets.json"))

# Captions: the words as shown (Blaine's read, spelled for the page).
CAPTIONS = [
    "Sight reading doesn't have to sound like a metronome in an empty room.",
    "abcSightReading turns any exercise into a play-along video.",
    "A real groove, a bouncing ball, and the next bar always waiting below.",
    "Clap the rhythm over rock, soul, cumbia, or even trap.",
    "Or sing it: your melody, in your key, with a band behind you.",
    "Slow it down or speed it up.",
    "Counting, Kodály, or your own syllables. Movable do, fixed do, or note names.",
    "Put it on the board for the whole class, or export it and share it.",
    "Sight reading music can actually sound like, well, music.",
    "abcSightReading. Practice real music.",
]
# Kicker pills, by scene.
PILLS = {
    "open": ("Play-along videos", "#ffd3bf", "#5a2310"),
    "rock": ("Rock", "#c9e4ff", "#0e3563"), "soul": ("Soul", "#ffd3bf", "#5a2310"),
    "cumbia": ("Cumbia", "#bdebd9", "#0f3b2c"), "trap": ("Trap", "#ffefa8", "#5c4a00"),
    "band": ("Drums · bass · guitar", "#bdebd9", "#0f3b2c"),
    "tempo": ("Half speed to 150%", "#c9e4ff", "#0e3563"),
    "syll": ("Rhythm syllables", "#ffefa8", "#5c4a00"), "solf": ("Solfège", "#ffd3bf", "#5a2310"),
    "board": ("Full screen for the class", "#c9e4ff", "#0e3563"), "export": ("Export a video", "#bdebd9", "#0f3b2c"),
}

ABC_PATH = open("../ad/build.py").read().split('ABC_PATH = "')[1].split('"')[0]
ABC_SVG = f'<svg class="abc" viewBox="0 -736 1780 750" fill="currentColor" aria-hidden="true"><path d="{ABC_PATH}"/></svg>'


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def run(cmd):
    subprocess.run(cmd, check=True)


# ── The audio: one mix ───────────────────────────────────────────────────────
def mix():
    out = "assets/music/promo-mix.m4a"
    parts = []
    paths = []
    def inp(path, *opts):
        paths.append((path, opts))
        return len(paths) - 1
    # The lone click under line 1, on the bed's beat (accent every fourth, leading into the snap).
    click_beat = inp("../../public/clicks/quartz-beat.wav")
    click_acc = inp("../../public/clicks/quartz-accent.wav")
    clicks = [SNAP - k * BEAT for k in range(8, 0, -1)]
    for k, t in enumerate(clicks):
        src = click_acc if k % 4 == 0 else click_beat
        parts.append(f"[{src}:a]adelay={int(t * 1000)}|{int(t * 1000)},volume=0.55[c{k}]")
    # The bed: in on the snap (to the montage), back after the band, out at the end.
    bed = inp("assets/music/calm-soft.mp3")
    def bed_piece(name, a, b, fin, fout):
        parts.append(
            f"[{bed}:a]atrim=start={BED_AT(a):.3f}:end={BED_AT(b):.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={fin},afade=t=out:st={b - a - fout:.3f}:d={fout},volume=0.32,adelay={int(a * 1000)}|{int(a * 1000)}[{name}]")
    bed_piece("bed1", SNAP, 15.70, 0.02, 0.35)
    bed_piece("bed2", 26.0, END, 0.6, 2.2)
    # The grooves and the band: each video's own audio at the moment it shows.
    def clip_audio(name, sid, file, fin=0.04, fout=0.08, vol=0.55):
        a, b = span(sid)
        m = FOOT[sid]["media"]
        k = inp(f"assets/footage/{file}.mp4")
        parts.append(
            f"[{k}:a]atrim=start={m:.3f}:end={m + (b - a) + fout:.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={fin},afade=t=out:st={b - a:.3f}:d={fout},volume={vol},adelay={int(a * 1000)}|{int(a * 1000)}[{name}]")
    clip_audio("g1", "rock", "rock")
    clip_audio("g2", "soul", "soul")
    clip_audio("g3", "cumbia", "cumbia")
    clip_audio("g4", "trap", "trap", fout=0.35)
    clip_audio("g5", "band", "pitched", fin=0.1, fout=0.5, vol=0.5)
    # The finish: the last bar's crash and the card, on "well, music".
    clip_audio("g6", "finish", "rock", fin=0.3, fout=0.8, vol=0.5)
    # The voice.
    for i in range(10):
        k = inp(f"assets/vo/v-line{i + 1:02d}.wav")
        parts.append(f"[{k}:a]adelay={int(VO[i] * 1000)}|{int(VO[i] * 1000)},volume=1.0[v{i}]")
    labels = [f"[c{k}]" for k in range(len(clicks))] + ["[bed1]", "[bed2]", "[g1]", "[g2]", "[g3]", "[g4]", "[g5]", "[g6]"] + [f"[v{i}]" for i in range(10)]
    # Music ducks a little under the voice (sidechain), then the whole is levelled.
    music_labels = labels[: len(labels) - 10]
    voice_labels = labels[len(labels) - 10:]
    parts.append(f"{''.join(music_labels)}amix=inputs={len(music_labels)}:normalize=0[music]")
    # Padded to the end: the ducker stops when its key does, and the music rings on under the logo.
    parts.append(f"{''.join(voice_labels)}amix=inputs=10:normalize=0,apad=whole_dur={END},asplit=2[voice][key]")
    parts.append("[music][key]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=300[ducked]")
    parts.append(f"[ducked][voice]amix=inputs=2:normalize=0,atrim=end={END},loudnorm=I=-14:TP=-1.5:LRA=11,volume=2.6dB,alimiter=limit=0.84:level=disabled[out]")
    cmd = ["ffmpeg", "-v", "error", "-y"]
    for path, opts in paths:
        cmd += [*opts, "-i", path]
    cmd += ["-filter_complex", ";".join(parts), "-map", "[out]", "-ar", "48000", "-c:a", "aac", "-b:a", "256k", out]
    run(cmd)
    return out


# ── The picture ──────────────────────────────────────────────────────────────
def video(vid, sid, track):
    """A scene's own short clip (cut-<scene>.mp4, made by cut_clips: only its seconds, a keyframe every
    half second), so the preview can start it at once; the full exports seek slowly (a keyframe every 3.4 s)
    and showed nothing while they caught up."""
    a, b = span(sid)
    return (f'<video id="{vid}" class="clip" data-start="{a:.3f}" data-duration="{b - a + 0.15:.3f}" data-media-start="0" '
            f'data-track-index="{track}" src="assets/footage/cut-{sid}.mp4" muted playsinline preload="auto"></video>')


CLIP_FILES = {"open": "rock", "ball": "rock", "rock": "rock", "soul": "soul", "cumbia": "cumbia", "trap": "trap", "band": "pitched",
              "tempo": "tempo", "syll": "labels-rhythm", "solf": "labels-pitched", "board": "pitched", "export": "export", "finish": "rock"}


def cut_clips():
    for sid, f in CLIP_FILES.items():
        a, b = span(sid)
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{FOOT[sid]['media']:.3f}", "-i", f"assets/footage/{f}.mp4", "-t", f"{b - a + 0.6:.3f}", "-an",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-g", "15", "-keyint_min", "15", "-movflags", "+faststart",
             f"assets/footage/cut-{sid}.mp4"])


def frame_html(portrait):
    """Every scene's footage stacked in one frame; GSAP shows each in its window."""
    clips = []
    track = 10
    for sid in CLIP_FILES:
        if sid == "board":
            continue  # on the TV
        clips.append(f'<div class="vw" id="vw-{sid}">{video("v-" + sid, sid, track)}</div>')
        track += 1
    return "".join(clips)


def captions_html():
    out = []
    for i, text in enumerate(CAPTIONS):
        words = text.split(" ")
        spans = "".join(f'<span class="cw" id="cw{i}-{k}">{esc(w)}</span> ' for k, w in enumerate(words))
        out.append(f'<p class="cap" id="cap{i}">{spans}</p>')
    return "".join(out)


def pills_html():
    return "".join(f'<span class="pill" id="pill-{sid}" style="background:{bg};color:{ink}">{esc(t)}</span>' for sid, (t, bg, ink) in PILLS.items())


def script(portrait):
    js = []
    # Scenes: each clip shown in its window (a quick cut, a little push on entry).
    for sid, a in SCENES:
        if sid in ("plain", "close", "board"):
            continue
        b = span(sid)[1]
        js.append(f'tl.set("#vw-{sid}", {{ opacity: 1 }}, {a:.3f}); tl.fromTo("#vw-{sid}", {{ scale: 1.035 }}, {{ scale: 1, duration: 0.5, ease: "power2.out" }}, {a:.3f}); tl.set("#vw-{sid}", {{ opacity: 0 }}, {b + 0.05:.3f});')
    # The board: the band's video again, on a TV, for the class.
    a, b = span("board")
    js.append(f'tl.set("#tv", {{ opacity: 1 }}, {a:.3f}); tl.fromTo("#tv", {{ y: 60, scale: 0.92 }}, {{ y: 0, scale: 1, duration: 0.6, ease: "back.out(1.6)" }}, {a:.3f}); tl.set("#tv", {{ opacity: 0 }}, {b:.3f});')
    js.append(f'tl.set("#frame", {{ opacity: 0 }}, {a:.3f}); tl.set("#frame", {{ opacity: 1 }}, {b:.3f});')
    # The plain open: grey, a pulse on each click; then the snap into colour.
    clicks = [SNAP - k * BEAT for k in range(8, 0, -1)]
    for t in clicks:
        js.append(f'tl.fromTo("#tick", {{ scale: 1.35, opacity: 1 }}, {{ scale: 1, opacity: 0.55, duration: 0.25, ease: "power2.out" }}, {t:.3f});')
    js.append(f'tl.to("#plain", {{ opacity: 0, scale: 1.06, duration: 0.25, ease: "power2.in" }}, {SNAP - 0.12:.3f});')
    js.append(f'tl.fromTo("#flash", {{ opacity: 0.85 }}, {{ opacity: 0, duration: 0.45, ease: "power2.out" }}, {SNAP:.3f});')
    js.append(f'tl.fromTo("#frame", {{ opacity: 0, scale: 0.9 }}, {{ opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.5)" }}, {SNAP:.3f});')
    js.append(f'tl.to("#frame", {{ opacity: 0, scale: 0.94, duration: 0.35, ease: "power2.in" }}, {span("close")[0] - 0.05:.3f});')
    # Pills: in with their scene, out with it.
    for sid in PILLS:
        a, b = span(sid)
        js.append(f'tl.fromTo("#pill-{sid}", {{ opacity: 0, y: 18, scale: 0.9 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" }}, {a + 0.08:.3f}); tl.to("#pill-{sid}", {{ opacity: 0, duration: 0.15 }}, {b - 0.1:.3f});')
    # Captions: each line in as it starts, a word lighting as it is said, out after.
    for i, x in enumerate(WORDS):
        if i == len(WORDS) - 1:
            continue  # the close's logo and line say it
        start = VO[i]
        end = start + x["len"]
        nxt = VO[i + 1] if i + 1 < len(VO) else END
        js.append(f'tl.fromTo("#cap{i}", {{ opacity: 0, y: 14 }}, {{ opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }}, {start:.3f});')
        js.append(f'tl.to("#cap{i}", {{ opacity: 0, duration: 0.2 }}, {min(nxt - 0.05, end + 0.6):.3f});')
        n_cap = len(CAPTIONS[i].split(" "))
        times = [w["t"] for w in x["words"]]
        # The caption's words and the spoken ones line up one to one where the counts match; otherwise spread evenly.
        if len(times) != n_cap:
            span_t = (times[-1] - times[0]) if len(times) > 1 else x["len"] * 0.8
            times = [times[0] + span_t * k / max(1, n_cap - 1) for k in range(n_cap)]
        for k in range(n_cap):
            js.append(f'tl.to("#cw{i}-{k}", {{ color: "#15213a", duration: 0.12 }}, {start + times[k]:.3f});')
    # The close: the wordmark, the line, the address.
    a = span("close")[0]
    js.append(f'tl.set("#close", {{ opacity: 1 }}, {a:.3f});')
    js.append(f'tl.fromTo("#close-mark", {{ opacity: 0, scale: 0.7 }}, {{ opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.7)" }}, {a + 0.15:.3f});')
    js.append(f'tl.fromTo("#close-line", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }}, {word_at(10, 3) - 0.1:.3f});')
    js.append(f'tl.fromTo("#close-url", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }}, {word_at(10, 5) + 0.6:.3f});')
    return "\n".join(js)


def page(portrait):
    w, h = (1080, 1920) if portrait else (1920, 1080)
    css = PORTRAIT_CSS if portrait else LANDSCAPE_CSS
    return (TEMPLATE.replace("%%CSS%%", BASE_CSS + css).replace("%%W%%", str(w)).replace("%%H%%", str(h))
            .replace("%%RES%%", "portrait" if portrait else "landscape").replace("%%END%%", f"{END:g}")
            .replace("%%CLIPS%%", frame_html(portrait)).replace("%%TVCLIP%%", tv_clip())
            .replace("%%CAPTIONS%%", captions_html()).replace("%%PILLS%%", pills_html())
            .replace("%%ABC%%", ABC_SVG).replace("%%SCRIPT%%", script(portrait)))


def tv_clip():
    return video("v-board", "board", 30)


BASE_CSS = """
@font-face { font-family: "Fredoka"; src: url("assets/fonts/fredoka-latin.woff2") format("woff2"); font-weight: 300 700; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: %%W%%px; height: %%H%%px; overflow: hidden; background: #eaf0f9; }
body { font-family: "Nunito", sans-serif; color: #15213a; }
#root { position: relative; width: %%W%%px; height: %%H%%px; overflow: hidden; background: #eaf0f9; }
.blob { position: absolute; border-radius: 50%; opacity: 0.55; }
#frame { position: absolute; border-radius: 34px; overflow: hidden; background: #ffffff; box-shadow: 0 34px 80px rgba(21,33,58,0.22); border: 3px solid #ffffff; opacity: 0; }
.vw { position: absolute; inset: 0; opacity: 0; }
.vw video { width: 100%; height: 100%; object-fit: cover; display: block; }
/* The tempo shot: zoomed on the header, where the BPM steps. */
#vw-tempo video { transform: scale(2.4); transform-origin: 97% 4%; }
#plain { position: absolute; inset: 0; z-index: 5; background: #eef0f3; }
#plain img { position: absolute; filter: grayscale(1) contrast(0.92) brightness(1.03); opacity: 0.9; }
#tick { position: absolute; width: 34px; height: 34px; border-radius: 50%; background: #9aa3b2; opacity: 0.55; }
#flash { position: absolute; inset: 0; z-index: 6; background: #ffffff; opacity: 0; pointer-events: none; }
.pill { position: absolute; z-index: 8; font-family: "Fredoka", sans-serif; font-weight: 600; padding: 12px 30px; border-radius: 999px; opacity: 0; box-shadow: 0 12px 28px rgba(21,33,58,0.16); white-space: nowrap; }
.cap { position: absolute; z-index: 9; left: 0; right: 0; text-align: center; font-family: "Fredoka", sans-serif; font-weight: 600; color: #6f7a8f; opacity: 0; }
.cw { display: inline; }
#tv { position: absolute; z-index: 7; opacity: 0; }
#tv .bezel { position: absolute; inset: 0; border-radius: 26px; background: #1b2233; box-shadow: 0 40px 90px rgba(21,33,58,0.35); }
#tv .screen { position: absolute; overflow: hidden; border-radius: 10px; background: #000; }
#tv .screen video { width: 100%; height: 100%; object-fit: cover; display: block; }
#tv .stand { position: absolute; background: #1b2233; border-radius: 8px; }
#close { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; opacity: 0; }
.close-mark { display: inline-flex; align-items: baseline; gap: 0.1em; }
.close-mark .abc { height: 0.75em; width: auto; color: #1e56c0; }
.close-mark .rest { font-family: "Fredoka", sans-serif; font-weight: 600; color: #15213a; line-height: 1; }
.close-line { font-family: "Fredoka", sans-serif; font-weight: 700; color: #2f6fe0; }
.url-pill { font-family: "Fredoka", sans-serif; font-weight: 600; color: #15213a; background: #ffffff; border-radius: 999px; border: 2px solid #d8e2f1; box-shadow: 0 16px 34px rgba(21,33,58,0.12); }
"""
LANDSCAPE_CSS = """
#frame { left: 240px; top: 76px; width: 1440px; height: 810px; }
#plain img { left: 240px; top: 76px; width: 1440px; height: 810px; border-radius: 34px; }
#tick { left: 935px; top: 20px; }
.pill { left: 240px; top: 14px; font-size: 30px; padding: 9px 26px; }
.cap { top: 920px; padding: 0 160px; font-size: 50px; line-height: 1.2; }
#tv { left: 300px; top: 30px; width: 1320px; height: 860px; }
#tv .bezel { height: 780px; }
#tv .screen { left: 26px; top: 26px; width: 1268px; height: 713px; }
#tv .stand { left: 610px; top: 780px; width: 100px; height: 60px; }
.close-mark { font-size: 150px; } .close-mark .rest { font-size: 150px; }
#close { gap: 40px; padding-bottom: 140px; }
.close-line { font-size: 64px; }
.url-pill { font-size: 46px; padding: 18px 46px; }
"""
PORTRAIT_CSS = """
#frame { left: 40px; top: 560px; width: 1000px; height: 563px; }
#plain img { left: 40px; top: 560px; width: 1000px; height: 563px; border-radius: 34px; }
#tick { left: 523px; top: 330px; }
.pill { left: 60px; top: 470px; font-size: 38px; }
.cap { top: 1240px; padding: 0 70px; font-size: 64px; line-height: 1.18; }
#tv { left: 40px; top: 520px; width: 1000px; height: 680px; }
#tv .bezel { height: 600px; }
#tv .screen { left: 20px; top: 20px; width: 960px; height: 540px; }
#tv .stand { left: 460px; top: 600px; width: 80px; height: 50px; }
.close-mark { font-size: 96px; } .close-mark .rest { font-size: 96px; }
#close { gap: 44px; padding-bottom: 120px; }
.close-line { font-size: 66px; }
.url-pill { font-size: 48px; padding: 18px 46px; }
"""

TEMPLATE = r"""<!doctype html>
<html lang="en" data-resolution="%%RES%%">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=%%W%%, height=%%H%%" />
<!-- Written by ../promo-video/build.py: edit there, not here. -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
%%CSS%%
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="%%END%%" data-width="%%W%%" data-height="%%H%%">
  <div class="blob" style="width:620px;height:620px;left:-180px;top:-200px;background:#c9e4ff"></div>
  <div class="blob" style="width:520px;height:520px;right:-160px;bottom:-140px;background:#ffd3bf"></div>
  <div class="blob" style="width:360px;height:360px;right:12%;top:-120px;background:#bdebd9"></div>
  <div id="frame">%%CLIPS%%</div>
  <div id="tv"><div class="bezel"></div><div class="screen">%%TVCLIP%%</div><div class="stand"></div></div>
  %%PILLS%%
  <div id="plain"><img src="assets/footage/plain.png" alt="" /><div id="tick"></div></div>
  <div id="flash"></div>
  <div id="close">
    <div class="close-mark" id="close-mark">%%ABC%%<span class="rest">SightReading</span></div>
    <p class="close-line" id="close-line">Practice real music.</p>
    <span class="url-pill" id="close-url">abcsightreading.com</span>
  </div>
  %%CAPTIONS%%
  <audio id="mix" data-start="0" data-duration="%%END%%" data-track-index="1" src="assets/music/promo-mix.m4a" data-volume="1"></audio>
</div>
<script>
window.__timelines = window.__timelines || {};
var tl = gsap.timeline({ paused: true });
%%SCRIPT%%
window.__timelines["main"] = tl;
</script>
</body>
</html>
"""

if __name__ == "__main__":
    import os
    mix()
    if "--no-cut" not in __import__("sys").argv:
        cut_clips()
    for name, portrait in (("promo-landscape", False), ("promo-vertical", True)):
        os.makedirs(f"../{name}", exist_ok=True)
        if not os.path.exists(f"../{name}/assets"):
            os.symlink("../promo-video/assets", f"../{name}/assets")
        if not os.path.exists(f"../{name}/hyperframes.json"):
            open(f"../{name}/hyperframes.json", "w").write(open("../ad-fun/hyperframes.json").read())
        open(f"../{name}/index.html", "w").write(page(portrait))
        print(f"../{name}/index.html: {END} s")
