"""Writes index.html, the ad's composition, from the scene table below.

    python3 build.py && npx --yes hyperframes@0.8.125 check

Footage is recorded by capture/ (bun run capture) into assets/captures and
copied to assets/footage. Times are seconds on the 60 s timeline; cuts land on
the music's beat (Maple Leaf Rag at 120 bpm, first note at 0.28 s).
"""
import html, json, subprocess, sys

W, H = 1920, 1080

# The music, one composition each (python3 build.py writes them all). `start`:
# where in the song the video begins, a downbeat chosen so the song's own
# ending lands just before 0:60. Beat grid measured from each file: tempo, and
# where its beats fall (seconds into the file). Cuts snap to these beats.
MUSIC = {
    "index": dict(file="kids-song.mp3", bpm=85.05, phase=0.26, start=8.726,
                  credit="Kids Song (atlasaudio)"),
    "fun": dict(file="fun-fun-music.mp3", bpm=133.35, phase=0.175, start=13.67,
                credit="Fun Fun Music (prettyjohn1)"),
}
SWAP = 0.24             # how long into a wipe the scenes change over

# Each feature scene: when it starts (the wipe), copy, and the footage shown in
# its browser window, in order: (file, seconds into the file, seconds shown).
SCENES = [
    dict(id="unison", t=4.28, kicker="Unison", tint="sky",
         head="A new exercise every click.",
         body="Your key, your notes, your rhythms. Solfège included.",
         url="abcsightreading.com/sightreading",
         clips=[("unison", 0.8, 3.4), ("unison", 9.3, 4.4)]),
    dict(id="choral", t=12.28, kicker="Choral", tint="mint", flip=True,
         head="Two, three and four parts.",
         body="SATB, SSA and TTB, from UIL Level 1 to 5.",
         url="abcsightreading.com/choral-sightreading",
         clips=[("choral", 0.3, 3.0), ("choral", 9.4, 3.8)]),
    dict(id="rhythm", t=19.28, kicker="Rhythm", tint="butter",
         head="Ta, ti-ti, ti-ki-ti-ki.",
         body="Kodály, counting, or your own syllables.",
         url="abcsightreading.com/sightreading",
         clips=[("rhythm", 0.8, 2.3), ("rhythm", 6.0, 3.8)]),
    dict(id="chromatic", t=35.28, kicker="Real music", tint="peach",
         head="Melodies over real chord progressions.",
         body="Chromatic notes that resolve. Skips only where you want them.",
         url="abcsightreading.com/sightreading",
         clips=[("chromatic", 0.5, 6.2)]),
    dict(id="tuner", t=41.28, kicker="abcTuner · Pro", tint="sky", flip=True,
         head="A tuner that hears singers.",
         body="Pitch, vowels, drone, metronome and timer, a tab each.",
         url="abcsightreading.com/tuner",
         clips=[("tuner", 1.0, 4.3), ("tuner", 9.8, 2.9)]),
    dict(id="teachers", t=48.28, kicker="For teachers", tint="mint",
         head="Step by step, class by class.",
         body="23 steps from ta to four parts.",
         chips=["Assign practice", "Track minutes", "Student logins, no email"],
         url="abcsightreading.com/sightreading",
         clips=[("ladder", 0.7, 6.0)]),
]
PLAYALONG = dict(id="playalong", t=25.28, file="playalong", media=0.25)
CLOSE_T = 54.28
DURATION = 60.0
ORDER = ["hook", "unison", "choral", "rhythm", "playalong", "chromatic", "tuner", "teachers", "close"]

TINTS = {"sky": ("#c9e4ff", "#0e3563"), "mint": ("#bdebd9", "#0f3b2c"),
         "peach": ("#ffd3bf", "#5a2310"), "butter": ("#ffefa8", "#5c4a00")}
WIPES = ["#c9e4ff", "#bdebd9", "#ffd3bf", "#ffefa8"]


def esc(s):
    return html.escape(s, quote=True)


def keep_words(s):
    """Escaped text with hyphenated words kept whole: ti-ki-ti-ki never breaks at a hyphen."""
    import re
    return re.sub(r"(\S*-\S*)", r'<span class="nw">\1</span>', esc(s))


def wordmark(rest="sightreading.com", cls="wordmark"):
    return f'<div class="{cls}"><span class="abc">abc</span><span class="rest">{esc(rest)}</span></div>'


def blobs(sid, seed):
    # Soft pastel circles drifting behind each scene: deterministic.
    out = []
    spots = [(0.08, 0.12, 300, "sky"), (0.9, 0.18, 380, "peach"), (0.82, 0.92, 340, "mint"), (0.12, 0.88, 260, "butter")]
    for k, (x, y, r, tint) in enumerate(spots):
        out.append(f'<div class="blob" id="{sid}-blob{k}" data-layout-ignore '
                   f'style="left:{x * W - r / 2:.0f}px;top:{y * H - r / 2:.0f}px;width:{r}px;height:{r}px;background:{TINTS[tint][0]}"></div>')
    return "\n".join(out)


def video_tag(vid, file, start, dur, media, track):
    return (f'<video id="{vid}" class="clip" data-start="{start:.2f}" data-duration="{dur:.2f}" data-media-start="{media:.2f}" '
            f'data-track-index="{track}" src="assets/footage/{file}.mp4" muted playsinline></video>')


def feature(s, track0):
    start = s["t"] + SWAP
    bg, ink = TINTS[s["tint"]]
    clips, at = [], start
    for k, (file, media, dur) in enumerate(s["clips"]):
        clips.append(f'<div class="vw" id="{s["id"]}-vw{k}">{video_tag(s["id"] + "-v" + str(k), file, at, dur + 0.25, media, track0 + k)}</div>')
        at += dur
    chips = "".join(f'<span class="chip">{esc(c)}</span>' for c in s.get("chips", []))
    return f'''
<div class="scene" id="{s["id"]}">
  {blobs(s["id"], 1)}
  <div class="scene-content{' flip' if s.get('flip') else ''}">
    <div class="copy">
      <span class="kicker" id="{s["id"]}-kicker" style="background:{bg};color:{ink}">{esc(s["kicker"])}</span>
      <h2 class="head" id="{s["id"]}-head">{keep_words(s["head"])}</h2>
      <p class="body" id="{s["id"]}-body">{esc(s["body"])}</p>
      {f'<div class="chips" id="{s["id"]}-chips">{chips}</div>' if chips else ''}
    </div>
    <div class="window" id="{s["id"]}-window">
      <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="url">{esc(s["url"])}</span></div>
      <div class="screen">{''.join(clips)}</div>
    </div>
  </div>
</div>'''


def beat_grid(m):
    """The song's beats on the video's timeline."""
    beat = 60 / m["bpm"]
    first = m["phase"] + beat * -(-(m["start"] - m["phase"]) // beat)  # first beat at or after the start
    return [first - m["start"] + k * beat for k in range(int(DURATION / beat) + 2)]


def snap(t, beats):
    return min(beats, key=lambda b: abs(b - t))


def retime(m):
    """Scene cuts and the hook's word entrances, moved onto this song's beats."""
    beats = beat_grid(m)
    for s in SCENES:
        s["t"] = snap(s["base_t"], beats)
    PLAYALONG["t"] = snap(PLAYALONG["base_t"], beats)
    global CLOSE_T, HOOK_BEATS
    CLOSE_T = snap(54.28, beats)
    HOOK_BEATS = [b for b in beats if b >= 0.15][:6]
    while HOOK_BEATS[-1] > 3.6 and len(HOOK_BEATS) > 1:  # six words before the first cut, on the beat or half beat
        half = 30 / m["bpm"]
        HOOK_BEATS = [HOOK_BEATS[0] + k * half for k in range(6)]
        break


def mix(name, m):
    """The song from `start`, 60 s, levelled, faded in briefly and out under the close."""
    out = f"assets/music/ad-mix-{name}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(m["start"]), "-i", f"assets/music/{m['file']}",
                    "-t", str(DURATION), "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.08,afade=t=out:st={DURATION - 1.2}:d=1.2",
                    "-ar", "48000", "-b:a", "192k", out], check=True)
    return out


def build():
    scenes_html, tracks = [], 10
    for s in SCENES:
        scenes_html.append((s["id"], feature(s, tracks)))
        tracks += 4
    pa_start = PLAYALONG["t"] + SWAP
    pa_dur = SCENES[3]["t"] - PLAYALONG["t"] + 0.1
    playalong = f'''
<div class="scene" id="playalong">
  {blobs("playalong", 2)}
  <div class="pa-content">
    <div class="pa-top">
      <span class="kicker" id="playalong-kicker" style="background:#ffd3bf;color:#5a2310">Play-along videos · Pro</span>
      <h2 class="head pa-head" id="playalong-head">Turn any exercise into a play-along video.</h2>
    </div>
    <div class="pa-frame" id="playalong-frame">
      <div class="vw" id="playalong-vw0">{video_tag("playalong-v0", PLAYALONG["file"], pa_start, pa_dur, PLAYALONG["media"], 40)}</div>
    </div>
    <p class="pa-sub" id="playalong-sub">Drums, bass and strummed guitar at your tempo. Export it and share it.</p>
  </div>
</div>'''
    hook = f'''
<div class="scene" id="hook">
  {blobs("hook", 3)}
  <div class="hook-content">
    {wordmark(cls="wordmark hook-mark")}
    <h1 class="hook-head"><span class="hw" id="hw0">Sight-reading</span> <span class="hw" id="hw1">practice</span><br><span class="hw" id="hw2">that</span> <span class="hw" id="hw3">never</span> <span class="hw" id="hw4">runs</span> <span class="hw" id="hw5">out.</span></h1>
  </div>
  <div class="ball" id="hook-ball" data-layout-allow-occlusion></div>
</div>'''
    close = f'''
<div class="scene" id="close">
  {blobs("close", 4)}
  <div class="close-content">
    <div class="close-mark" id="close-mark"><span class="abc">abc</span><span class="rest">SightReading</span></div>
    <p class="close-line" id="close-line">Sight-reading practice for every choir and classroom.</p>
    <div class="close-row">
      <span class="cta" id="close-cta">Try it free</span>
      <span class="url-pill" id="close-url">abcsightreading.com</span>
    </div>
    <p class="close-price" id="close-price">Free to start. Pro is $19.99 a year.</p>
  </div>
</div>'''
    parts = {"hook": hook, "playalong": playalong, "close": close, **dict(scenes_html)}
    body = "\n".join(parts[k] for k in ORDER)
    timeline = script()
    return TEMPLATE.replace("%%SCENES%%", body).replace("%%SCRIPT%%", timeline).replace("%%DURATION%%", f"{DURATION:g}")


def script():
    cuts = [(s["id"], s["t"]) for s in SCENES] + [("playalong", PLAYALONG["t"]), ("close", CLOSE_T)]
    cuts.sort(key=lambda c: c[1])
    order = ["hook"] + [c[0] for c in cuts]
    feats = {s["id"]: s for s in SCENES}
    js = [f"  var HOOK = {json.dumps([round(b, 3) for b in HOOK_BEATS])};"]
    # Hook: words pop in on the beat while the ball hops across them.
    js.append("""
  // ---- Hook
  tl.from(".hook-mark", { y: -30, opacity: 0, duration: 0.6, ease: "back.out(1.7)" }, 0.15);
  for (var i = 0; i < 6; i++) {
    tl.from("#hw" + i, { y: 50, scale: 0.85, opacity: 0, duration: 0.45, ease: i % 2 ? "back.out(2.2)" : "power3.out" }, HOOK[i]);
  }
  // The ball (the play-along video's own) lands on each word as it appears.
  var hops = window.__hops || [];
  tl.set("#hook-ball", { opacity: 1 }, 0.2);
  for (var i = 0; i < hops.length; i++) {
    var h = hops[i], land = HOOK[i], from = i ? HOOK[i - 1] : Math.max(0, land - 0.5), d = land - from;
    tl.to("#hook-ball", { x: h.x, duration: d, ease: "none" }, from);
    tl.to("#hook-ball", { y: h.y - 150, duration: d / 2, ease: "power2.out" }, from);
    tl.to("#hook-ball", { y: h.y, duration: d / 2, ease: "power2.in" }, from + d / 2);
  }
""")
    js.append("  tl.to('.blob', { y: '+=40', x: '-=20', duration: %g, ease: 'sine.inOut' }, 0);" % DURATION)
    # Wipes and entrances
    for k in range(1, len(order)):
        old, new, t = order[k - 1], order[k], cuts[k - 1][1]
        color_a, color_b, color_c = WIPES[k % 4], WIPES[(k + 1) % 4], WIPES[(k + 2) % 4]
        js.append(f"""
  // ---- {old} -> {new} at {t}
  tl.set("#wipe-a", {{ x: -{W}, backgroundColor: "{color_a}" }}, {t - 0.01:.2f});
  tl.set("#wipe-b", {{ x: -{W}, backgroundColor: "{color_b}" }}, {t - 0.01:.2f});
  tl.set("#wipe-c", {{ x: -{W}, backgroundColor: "{color_c}" }}, {t - 0.01:.2f});
  tl.to("#wipe-a", {{ x: 0, duration: 0.24, ease: "power3.inOut" }}, {t:.2f});
  tl.to("#wipe-b", {{ x: 0, duration: 0.24, ease: "power3.inOut" }}, {t + 0.05:.2f});
  tl.to("#wipe-c", {{ x: 0, duration: 0.24, ease: "power3.inOut" }}, {t + 0.1:.2f});
  tl.set("#{old}", {{ opacity: 0 }}, {t + SWAP:.2f});
  tl.set("#{new}", {{ opacity: 1 }}, {t + SWAP:.2f});
  tl.to("#wipe-a", {{ x: {W}, duration: 0.26, ease: "power3.inOut" }}, {t + 0.36:.2f});
  tl.to("#wipe-b", {{ x: {W}, duration: 0.26, ease: "power3.inOut" }}, {t + 0.41:.2f});
  tl.to("#wipe-c", {{ x: {W}, duration: 0.26, ease: "power3.inOut" }}, {t + 0.46:.2f});""")
        e = t + 0.4
        if new in feats:
            s = feats[new]
            sx = 90 if s.get("flip") else -90
            js.append(f"""  tl.from("#{new}-kicker", {{ y: 24, opacity: 0, duration: 0.5, ease: "back.out(2)" }}, {e:.2f});
  tl.from("#{new}-head", {{ y: 46, opacity: 0, duration: 0.65, ease: "power3.out" }}, {e + 0.1:.2f});
  tl.from("#{new}-body", {{ y: 28, opacity: 0, duration: 0.6, ease: "expo.out" }}, {e + 0.3:.2f});
  tl.from("#{new}-window", {{ x: {-sx}, scale: 0.94, opacity: 0, duration: 0.8, ease: "power3.out" }}, {e - 0.15:.2f});
  tl.to("#{new}-window", {{ scale: 1.03, duration: {max(1, (cuts[k][1] if k < len(cuts) else DURATION) - e - 0.7):.2f}, ease: "sine.inOut" }}, {e + 0.7:.2f});""")
            if s.get("chips"):
                js.append(f'  tl.from("#{new}-chips .chip", {{ y: 20, opacity: 0, duration: 0.45, stagger: 0.18, ease: "back.out(2)" }}, {e + 0.6:.2f});')
            # A second clip in the window crossfades in over the first.
            at = t + SWAP
            for c, (_, _, dur) in enumerate(s["clips"]):
                if c > 0:
                    js.append(f'  tl.fromTo("#{new}-vw{c}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.25, ease: "sine.inOut" }}, {at:.2f});')
                at += dur
        elif new == "playalong":
            js.append(f"""  tl.from("#playalong-kicker", {{ y: 24, opacity: 0, duration: 0.5, ease: "back.out(2)" }}, {e:.2f});
  tl.from("#playalong-head", {{ y: 40, opacity: 0, duration: 0.6, ease: "power3.out" }}, {e + 0.12:.2f});
  tl.from("#playalong-frame", {{ y: 120, scale: 0.9, opacity: 0, duration: 0.9, ease: "back.out(1.2)" }}, {e - 0.1:.2f});
  tl.from("#playalong-sub", {{ y: 20, opacity: 0, duration: 0.5, ease: "expo.out" }}, {e + 1.2:.2f});""")
        elif new == "close":
            js.append(f"""  tl.from("#close-mark", {{ scale: 0.6, opacity: 0, duration: 0.8, ease: "back.out(1.8)" }}, {e:.2f});
  tl.from("#close-line", {{ y: 30, opacity: 0, duration: 0.6, ease: "power3.out" }}, {e + 0.4:.2f});
  tl.from("#close-cta", {{ y: 30, scale: 0.8, opacity: 0, duration: 0.55, ease: "back.out(2.4)" }}, {e + 0.8:.2f});
  tl.from("#close-url", {{ x: 40, opacity: 0, duration: 0.55, ease: "expo.out" }}, {e + 0.95:.2f});
  tl.from("#close-price", {{ y: 20, opacity: 0, duration: 0.5, ease: "sine.out" }}, {e + 1.3:.2f});
  tl.to("#close-cta", {{ scale: 1.06, duration: 0.25, ease: "sine.inOut", yoyo: true, repeat: 5 }}, {e + 2.0:.2f});
  // The final scene fades out with the music.
  tl.to("#close", {{ opacity: 0, duration: 1.2, ease: "sine.in" }}, {DURATION - 1.3:.2f});""")
    return "\n".join(js)


TEMPLATE = r"""<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<!-- Written by build.py: edit the scene table there, not this file. -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face { font-family: "Fredoka"; src: url("assets/fonts/fredoka-latin.woff2") format("woff2"); font-weight: 300 700; font-style: normal; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #eaf0f9; }
body { font-family: "Nunito", sans-serif; color: #15213a; }
#root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #eaf0f9; }
.scene { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: hidden; background: #eaf0f9; opacity: 0; }
#hook { opacity: 1; z-index: 1; }
.blob { position: absolute; border-radius: 50%; opacity: 0.55; }
.wipe { position: absolute; inset: 0; width: 1920px; height: 1080px; z-index: 1000; transform: translateX(-1920px); }

.wordmark { display: inline-flex; align-items: baseline; gap: 2px; background: #ffffff; border-radius: 999px; padding: 14px 34px; box-shadow: 0 12px 30px rgba(21,33,58,0.10); }
.wordmark .abc, .close-mark .abc { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 600; color: #2f6fe0; }
.wordmark .rest, .close-mark .rest { font-family: "Fredoka", sans-serif; font-weight: 700; color: #15213a; }
.wordmark .abc { font-size: 44px; } .wordmark .rest { font-size: 44px; }

.hook-content { position: relative; z-index: 2; width: 100%; height: 100%; padding: 120px 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 70px; text-align: center; }
.hook-head { font-family: "Fredoka", sans-serif; font-weight: 700; font-size: 132px; line-height: 1.08; letter-spacing: -0.01em; color: #15213a; }
.hook-head .hw { display: inline-block; }
#hw3 { color: #2f6fe0; }
.ball { position: absolute; left: 0; top: 0; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #8dbaff 0%, #2f6fe0 55%, #1e56c0 100%); box-shadow: 0 10px 24px rgba(30,86,192,0.35); z-index: 5; opacity: 0; }

.scene-content { position: relative; z-index: 2; width: 100%; height: 100%; padding: 90px 96px; display: flex; flex-direction: row; align-items: center; gap: 72px; }
.scene-content.flip { flex-direction: row-reverse; }
.copy { flex: 0 0 560px; display: flex; flex-direction: column; align-items: flex-start; gap: 30px; }
.kicker { font-family: "Fredoka", sans-serif; font-weight: 600; font-size: 30px; padding: 10px 26px; border-radius: 999px; }
.nw { white-space: nowrap; }
.head { font-family: "Fredoka", sans-serif; font-weight: 700; font-size: 80px; line-height: 1.04; color: #15213a; max-width: 560px; }
.body { font-family: "Nunito", sans-serif; font-weight: 700; font-size: 36px; line-height: 1.3; color: #34405e; max-width: 540px; }
.chips { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.chip { font-family: "Nunito", sans-serif; font-weight: 800; font-size: 28px; color: #0f3b2c; background: #bdebd9; padding: 10px 24px; border-radius: 999px; }

.window { flex: 0 0 1152px; width: 1152px; border-radius: 30px; overflow: hidden; background: #ffffff; border: 2px solid #d8e2f1; box-shadow: 0 30px 70px rgba(21,33,58,0.18); }
.window .bar { height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 20px; background: #f0f5fc; border-bottom: 2px solid #e6edf8; }
.dot { width: 14px; height: 14px; border-radius: 50%; }
.dot.r { background: #ffb4a8; } .dot.y { background: #ffe08a; } .dot.g { background: #9fe0c5; }
.url { margin-left: 18px; font-family: "Nunito", sans-serif; font-weight: 700; font-size: 18px; color: #56637f; background: #ffffff; border-radius: 999px; padding: 5px 18px; }
.screen { position: relative; width: 100%; height: 648px; background: #eaf0f9; }
.vw { position: absolute; inset: 0; }
.vw video { width: 100%; height: 100%; object-fit: cover; display: block; }

.pa-content { position: relative; z-index: 2; width: 100%; height: 100%; padding: 46px 120px 40px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
.pa-top { display: flex; align-items: center; gap: 28px; }
.pa-head { font-size: 60px; max-width: none; white-space: nowrap; }
.pa-frame { position: relative; width: 1376px; height: 774px; border-radius: 30px; overflow: hidden; box-shadow: 0 30px 70px rgba(21,33,58,0.22); border: 2px solid #d8e2f1; }
.pa-sub { font-family: "Nunito", sans-serif; font-weight: 800; font-size: 32px; color: #34405e; }

.close-content { position: relative; z-index: 2; width: 100%; height: 100%; padding: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 44px; text-align: center; }
.close-mark { display: inline-flex; align-items: baseline; gap: 4px; }
.close-mark .abc { font-size: 150px; } .close-mark .rest { font-size: 150px; }
.close-line { font-family: "Nunito", sans-serif; font-weight: 700; font-size: 40px; color: #34405e; max-width: 1300px; }
.close-row { display: flex; align-items: center; gap: 28px; }
.cta { font-family: "Fredoka", sans-serif; font-weight: 700; font-size: 46px; color: #ffffff; background: #2f6fe0; padding: 20px 54px; border-radius: 999px; box-shadow: 0 16px 34px rgba(47,111,224,0.35); }
.url-pill { font-family: "Fredoka", sans-serif; font-weight: 600; font-size: 44px; color: #15213a; background: #ffffff; padding: 18px 44px; border-radius: 999px; border: 2px solid #d8e2f1; }
.close-price { font-family: "Nunito", sans-serif; font-weight: 800; font-size: 34px; color: #1e56c0; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="%%DURATION%%" data-width="1920" data-height="1080">
%%SCENES%%
<div class="wipe" id="wipe-a" data-layout-ignore></div>
<div class="wipe" id="wipe-b" data-layout-ignore></div>
<div class="wipe" id="wipe-c" data-layout-ignore></div>
<audio id="music" data-start="0" data-duration="%%DURATION%%" data-track-index="1" src="%%MUSIC%%" data-volume="0.9"></audio>
</div>
<script>
window.__timelines = window.__timelines || {};
var tl = gsap.timeline({ paused: true });
// Where the hook's ball lands: on top of each word, measured from the layout.
(function () {
  var root = document.getElementById("root").getBoundingClientRect();
  window.__hops = [];
  for (var i = 0; i < 6; i++) {
    var r = document.getElementById("hw" + i).getBoundingClientRect();
    window.__hops.push({ x: r.left - root.left + r.width / 2, y: r.top - root.top - 10 });
  }
  var first = window.__hops[0];
  gsap.set("#hook-ball", { x: first.x - 260, y: first.y });
})();
%%SCRIPT%%
window.__timelines["main"] = tl;
</script>
</body>
</html>
"""

if __name__ == "__main__":
    for s in SCENES:
        s.setdefault("base_t", s["t"])
    PLAYALONG.setdefault("base_t", PLAYALONG["t"])
    for name, m in MUSIC.items():
        retime(m)
        audio = mix(name, m)
        page = build().replace("%%MUSIC%%", audio)
        # One root composition per HyperFrames project: each song's version
        # is its own project, the alternatives beside this one sharing assets.
        open("index.html" if name == "index" else f"../ad-{name}/index.html", "w").write(page)
        print(f"{'index.html' if name == 'index' else f'../ad-{name}/index.html'}: {m['credit']}, from {m['start']} s; cuts at",
              ", ".join(f"{t:.2f}" for t in sorted([s['t'] for s in SCENES] + [PLAYALONG['t'], CLOSE_T])))
