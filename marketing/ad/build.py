"""Writes the ad's compositions, one per song, cut to the song.

    python3 build.py && npx --yes hyperframes@0.8.125 check

Each version is planned in BARS of its song (music/<song>.json, from
music/analyze.py: tempo, beats, downbeats, sections). The song starts on a
downbeat chosen so its own ending lands just before the video's end; every
scene is a whole number of bars and every scene change lands exactly on a
downbeat (the wipe starts SWAP seconds early so the cover is complete on the
beat). Text enters on beats; the hook's ball lands on a word each beat; the
close's button pulses on the beat.

The footage follows the music too. The playing scenes (Unison, Choral,
rhythm) were recorded at the song's tempo (capture.ts, TEMPO=) with their
count-in logged on the recording's own clock (<name>.json): each is placed so
its first note - or its count-in's "1" - sits on a downbeat, and the cursor
then keeps the song's beat. The play-along video is rendered at the song's
exact tempo with its count-in starting on its scene's first downbeat
(playalong.ts), so the ball lands on the song's beats.

HyperFrames allows one root composition per project: the first version is
index.html here, the others ../ad-<name>/index.html over these assets.
"""
import html, json, re, subprocess

W, H = 1920, 1080
SWAP = 0.24             # how long into a wipe the scenes change over: the wipe starts this much before the downbeat

VERSIONS = {
    # start: a downbeat of the song; end: where its music stops (measured).
    "index": dict(song="kids-song", start=9.383, end=68.67, tag="85",
                  bars=[2, 3, 2, 2, 4, 2, 2, 2, 2], credit="Kids Song (atlasaudio)", out="index.html"),
    "fun": dict(song="fun-fun-music", start=14.928, end=73.06, tag="100",
                bars=[2, 3, 3, 2, 4, 3, 3, 2, 2], credit="Fun Fun Music (prettyjohn1)", out="../ad-fun/index.html"),
}
ORDER = ["hook", "unison", "choral", "rhythm", "playalong", "chromatic", "tuner", "teachers", "close"]

COPY = {
    "unison": dict(kicker="Unison", tint="sky", head="A new exercise every click.",
                   body="Your key, your notes, your rhythms. Solfège included.", url="abcsightreading.com/sightreading"),
    "choral": dict(kicker="Choral", tint="mint", flip=True, head="Two, three and four parts.",
                   body="SATB, SSA and TTB, from UIL Level 1 to 5.", url="abcsightreading.com/choral-sightreading"),
    "rhythm": dict(kicker="Rhythm", tint="butter", head="Ta, ti-ti, ti-ki-ti-ki.",
                   body="Kodály, counting, or your own syllables.", url="abcsightreading.com/sightreading"),
    "chromatic": dict(kicker="Real music", tint="peach", head="Melodies over real chord progressions.",
                      body="Chromatic notes that resolve. Skips only where you want them.", url="abcsightreading.com/sightreading"),
    "tuner": dict(kicker="abcTuner · Pro", tint="sky", flip=True, head="A tuner that hears singers.",
                  body="Pitch, vowels, drone, metronome and timer, a tab each.", url="abcsightreading.com/tuner"),
    "teachers": dict(kicker="For teachers", tint="mint", head="Step by step, class by class.",
                     body="23 steps from ta to four parts.", chips=["Assign practice", "Track minutes", "Student logins, no email"],
                     url="abcsightreading.com/sightreading"),
}

TINTS = {"sky": ("#c9e4ff", "#0e3563"), "mint": ("#bdebd9", "#0f3b2c"),
         "peach": ("#ffd3bf", "#5a2310"), "butter": ("#ffefa8", "#5c4a00")}
WIPES = ["#c9e4ff", "#bdebd9", "#ffd3bf", "#ffefa8"]


def esc(s):
    return html.escape(s, quote=True)


def keep_words(s):
    """Escaped text with hyphenated words kept whole: ti-ki-ti-ki never breaks at a hyphen."""
    return re.sub(r"(\S*-\S*)", r'<span class="nw">\1</span>', esc(s))


def wordmark(rest="sightreading.com", cls="wordmark"):
    return f'<div class="{cls}"><span class="abc">abc</span><span class="rest">{esc(rest)}</span></div>'


def blobs(sid):
    # Soft pastel circles drifting behind each scene: deterministic.
    out = []
    spots = [(0.08, 0.12, 300, "sky"), (0.9, 0.18, 380, "peach"), (0.82, 0.92, 340, "mint"), (0.12, 0.88, 260, "butter")]
    for k, (x, y, r, tint) in enumerate(spots):
        out.append(f'<div class="blob" id="{sid}-blob{k}" data-layout-ignore '
                   f'style="left:{x * W - r / 2:.0f}px;top:{y * H - r / 2:.0f}px;width:{r}px;height:{r}px;background:{TINTS[tint][0]}"></div>')
    return "\n".join(out)


def video_tag(vid, file, start, dur, media, track):
    return (f'<video id="{vid}" class="clip" data-start="{start:.3f}" data-duration="{dur:.3f}" data-media-start="{media:.3f}" '
            f'data-track-index="{track}" src="assets/footage/{file}.mp4" muted playsinline></video>')


class Plan:
    """One version's musical timeline: beats, bars and scene changes in video seconds."""

    def __init__(self, v):
        a = json.load(open(f"music/{v['song']}.json"))
        self.v, self.beat = v, a["beat"]
        self.bar = 4 * a["beat"]
        self.duration = round(min(60.0, v["end"] - v["start"] + 0.7), 2)
        self.downbeats = [d - v["start"] for d in a["downbeats"] if d >= v["start"] - 0.02]
        first = a["first_beat"]
        self.beats = [first + k * a["beat"] - v["start"] for k in range(int((v["end"] + 2) / a["beat"]))]
        self.beats = [b for b in self.beats if -0.01 <= b <= self.duration]
        cum = [sum(v["bars"][:i]) for i in range(len(v["bars"]) + 1)]
        # cuts[i]: the downbeat where scene i starts (cuts[0] = 0, the hook).
        self.cuts = [self.downbeats[c] if c < len(self.downbeats) else self.downbeats[-1] + (c - len(self.downbeats) + 1) * self.bar for c in cum[:-1]]
        self.scene_bars = dict(zip(ORDER, v["bars"]))
        self.scene_at = dict(zip(ORDER, self.cuts))

    def end_of(self, scene):
        i = ORDER.index(scene)
        return self.cuts[i + 1] if i + 1 < len(self.cuts) else self.duration

    def beat_after(self, t, n=0):
        """The n-th beat at or after t."""
        ahead = [b for b in self.beats if b >= t - 0.01]
        return ahead[min(n, len(ahead) - 1)]


def clips_for(scene, p, tag):
    """The footage in a scene's window: (file, seconds into it, video start, seconds shown)."""
    at, bar, end = p.scene_at[scene], p.bar, p.end_of(scene)
    cap = lambda name: json.load(open(f"assets/captures/{name}-{tag}.json"))
    if scene == "unison":
        c = cap("unison")
        # Bar 1: the Notes tab and Generate; then the count-in's "1" on a downbeat, the cursor on the next.
        return [(f"unison-{tag}", max(0.3, 2.5 - 0.65 * bar), at, bar),
                (f"unison-{tag}", c["countin_start"], at + bar, end - at - bar)]
    if scene in ("choral", "rhythm"):
        c = cap(scene)
        if p.scene_bars[scene] >= 3:
            return [(f"{scene}-{tag}", 0.5, at, bar), (f"{scene}-{tag}", c["countin_start"], at + bar, end - at - bar)]
        # The first note on the scene's first downbeat.
        return [(f"{scene}-{tag}", c["music_start"], at, end - at)]
    if scene == "chromatic":
        return [("chromatic", 0.5, at, end - at)]
    if scene == "tuner":
        last = bar if end - at > 1.5 * bar else (end - at) / 2
        return [("tuner", 1.0, at, end - at - last), ("tuner", 9.8, end - last, last)]
    if scene == "teachers":
        return [("ladder", 0.7, at, end - at)]
    raise KeyError(scene)


def feature(scene, p, tag, track0):
    s = COPY[scene]
    bg, ink = TINTS[s["tint"]]
    clips = []
    for k, (file, media, start, dur) in enumerate(clips_for(scene, p, tag)):
        clips.append(f'<div class="vw" id="{scene}-vw{k}">{video_tag(f"{scene}-v{k}", file, start, dur + 0.3, media, track0 + k)}</div>')
    chips = "".join(f'<span class="chip">{esc(c)}</span>' for c in s.get("chips", []))
    return f'''
<div class="scene" id="{scene}">
  {blobs(scene)}
  <div class="scene-content{' flip' if s.get('flip') else ''}">
    <div class="copy">
      <span class="kicker" id="{scene}-kicker" style="background:{bg};color:{ink}">{esc(s["kicker"])}</span>
      <h2 class="head" id="{scene}-head">{keep_words(s["head"])}</h2>
      <p class="body" id="{scene}-body">{esc(s["body"])}</p>
      {f'<div class="chips" id="{scene}-chips">{chips}</div>' if chips else ''}
    </div>
    <div class="window" id="{scene}-window">
      <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="url">{esc(s["url"])}</span></div>
      <div class="screen">{''.join(clips)}</div>
    </div>
  </div>
</div>'''


def mix(name, p):
    """The song from its start downbeat, levelled, faded in briefly; its own ending closes the video."""
    out = f"assets/music/ad-mix-{name}.mp3"
    v = p.v
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(v["start"]), "-i", f"assets/music/{v['song']}.mp3",
                    "-t", str(p.duration), "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.05,afade=t=out:st={p.duration - 0.5}:d=0.5",
                    "-ar", "48000", "-b:a", "192k", out], check=True)
    # MP3 framing trims the end a little: the video is as long as the audio really is.
    real = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                                capture_output=True, text=True, check=True).stdout)
    p.duration = round(min(p.duration, real), 2)
    return out


def build(p, tag, audio):
    parts, tracks = {}, 10
    for scene in COPY:
        parts[scene] = feature(scene, p, tag, tracks)
        tracks += 4
    pa_at = p.scene_at["playalong"]
    parts["playalong"] = f'''
<div class="scene" id="playalong">
  {blobs("playalong")}
  <div class="pa-content">
    <div class="pa-top">
      <span class="kicker" id="playalong-kicker" style="background:#ffd3bf;color:#5a2310">Play-along videos · Pro</span>
      <h2 class="head pa-head" id="playalong-head">Turn any exercise into a play-along video.</h2>
    </div>
    <div class="pa-frame" id="playalong-frame">
      <div class="vw" id="playalong-vw0">{video_tag("playalong-v0", f"playalong-{tag}", pa_at, p.end_of("playalong") - pa_at + 0.3, 0, 40)}</div>
    </div>
    <p class="pa-sub" id="playalong-sub">Drums, bass and strummed guitar at your tempo. Export it and share it.</p>
  </div>
</div>'''
    parts["hook"] = f'''
<div class="scene" id="hook">
  {blobs("hook")}
  <div class="hook-content">
    {wordmark(cls="wordmark hook-mark")}
    <h1 class="hook-head"><span class="hw" id="hw0">Sight-reading</span> <span class="hw" id="hw1">practice</span><br><span class="hw" id="hw2">that</span> <span class="hw" id="hw3">never</span> <span class="hw" id="hw4">runs</span> <span class="hw" id="hw5">out.</span></h1>
  </div>
  <div class="ball" id="hook-ball" data-layout-allow-occlusion></div>
</div>'''
    parts["close"] = f'''
<div class="scene" id="close">
  {blobs("close")}
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
    body = "\n".join(parts[k] for k in ORDER)
    return (TEMPLATE.replace("%%SCENES%%", body).replace("%%SCRIPT%%", script(p))
            .replace("%%DURATION%%", f"{p.duration:g}").replace("%%MUSIC%%", audio))


def script(p):
    b = p.beat
    # The hook: one word a beat from beat 1, the ball landing on each.
    hook = [p.beats[k] for k in range(1, 7)]
    js = [f"  var HOOK = {json.dumps([round(t, 3) for t in hook])};"]
    js.append(f"""
  // ---- Hook: a word a beat, the play-along video's ball landing on each.
  tl.from(".hook-mark", {{ y: -30, opacity: 0, duration: {min(0.6, b):.2f}, ease: "back.out(1.7)" }}, 0.05);
  for (var i = 0; i < 6; i++) {{
    tl.from("#hw" + i, {{ y: 50, scale: 0.85, opacity: 0, duration: {0.6 * b:.3f}, ease: i % 2 ? "back.out(2.2)" : "power3.out" }}, HOOK[i] - 0.06);
  }}
  var hops = window.__hops || [];
  tl.set("#hook-ball", {{ opacity: 1 }}, 0.05);
  for (var i = 0; i < hops.length; i++) {{
    var h = hops[i], land = HOOK[i], from = land - {b:.4f}, d = {b:.4f};
    tl.to("#hook-ball", {{ x: h.x, duration: d, ease: "none" }}, from);
    tl.to("#hook-ball", {{ y: h.y - 150, duration: d / 2, ease: "power2.out" }}, from);
    tl.to("#hook-ball", {{ y: h.y, duration: d / 2 - 0.001, ease: "power2.in" }}, from + d / 2);
  }}
  // One more bounce on the beat before the first cut.
  tl.to("#hook-ball", {{ y: hops.length ? hops[hops.length - 1].y - 90 : 0, duration: {b / 2:.4f}, ease: "power2.out", yoyo: true, repeat: 1 }}, HOOK[5]);""")
    js.append("  tl.to('.blob', { y: '+=40', x: '-=20', duration: %g, ease: 'sine.inOut' }, 0);" % p.duration)
    for k in range(1, len(ORDER)):
        old, new, t = ORDER[k - 1], ORDER[k], p.cuts[k]
        w0 = t - SWAP
        ca, cb, cc = WIPES[k % 4], WIPES[(k + 1) % 4], WIPES[(k + 2) % 4]
        js.append(f"""
  // ---- {old} -> {new}: covered on the downbeat at {t:.3f}
  tl.set("#wipe-a", {{ x: -{W}, backgroundColor: "{ca}" }}, {w0 - 0.01:.3f});
  tl.set("#wipe-b", {{ x: -{W}, backgroundColor: "{cb}" }}, {w0 - 0.01:.3f});
  tl.set("#wipe-c", {{ x: -{W}, backgroundColor: "{cc}" }}, {w0 - 0.01:.3f});
  tl.to("#wipe-a", {{ x: 0, duration: 0.24, ease: "power3.inOut" }}, {w0 - 0.1:.3f});
  tl.to("#wipe-b", {{ x: 0, duration: 0.24, ease: "power3.inOut" }}, {w0 - 0.05:.3f});
  tl.to("#wipe-c", {{ x: 0, duration: 0.24, ease: "power3.inOut" }}, {w0:.3f});
  tl.set("#{old}", {{ opacity: 0 }}, {t:.3f});
  tl.set("#{new}", {{ opacity: 1 }}, {t:.3f});
  tl.to("#wipe-a", {{ x: {W}, duration: 0.26, ease: "power3.inOut" }}, {t + 0.02:.3f});
  tl.to("#wipe-b", {{ x: {W}, duration: 0.26, ease: "power3.inOut" }}, {t + 0.07:.3f});
  tl.to("#wipe-c", {{ x: {W}, duration: 0.26, ease: "power3.inOut" }}, {t + 0.12:.3f});""")
        beat_n = lambda n: p.beat_after(t, n)
        if new in COPY:
            s = COPY[new]
            sx = 90 if s.get("flip") else -90
            end = p.end_of(new)
            js.append(f"""  tl.from("#{new}-window", {{ x: {-sx}, scale: 0.94, opacity: 0, duration: {min(0.8, 1.2 * b):.2f}, ease: "power3.out" }}, {t:.3f});
  tl.from("#{new}-kicker", {{ y: 24, opacity: 0, duration: {0.7 * b:.3f}, ease: "back.out(2)" }}, {beat_n(1) - 0.05:.3f});
  tl.from("#{new}-head", {{ y: 46, opacity: 0, duration: {min(0.65, b):.2f}, ease: "power3.out" }}, {beat_n(2) - 0.05:.3f});
  tl.from("#{new}-body", {{ y: 28, opacity: 0, duration: {min(0.6, b):.2f}, ease: "expo.out" }}, {beat_n(3) - 0.05:.3f});
  tl.to("#{new}-window", {{ scale: 1.03, duration: {max(1, end - t - 1.0):.2f}, ease: "sine.inOut" }}, {t + 0.9:.3f});""")
            if s.get("chips"):
                js.append(f'  tl.from("#{new}-chips .chip", {{ y: 20, opacity: 0, duration: {0.6 * b:.3f}, stagger: {b:.4f}, ease: "back.out(2)" }}, {beat_n(4) - 0.05:.3f});')
            # A later clip in the window comes in on its downbeat.
            for c, (_, _, start, _) in enumerate(clips_for(new, p, CURRENT_TAG)):
                if c > 0:
                    js.append(f'  tl.fromTo("#{new}-vw{c}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.12, ease: "sine.inOut" }}, {start - 0.06:.3f});')
        elif new == "playalong":
            js.append(f"""  tl.from("#playalong-frame", {{ y: 120, scale: 0.9, opacity: 0, duration: {min(0.7, b):.2f}, ease: "back.out(1.2)" }}, {t:.3f});
  tl.from("#playalong-kicker", {{ y: 24, opacity: 0, duration: {0.7 * b:.3f}, ease: "back.out(2)" }}, {beat_n(1) - 0.05:.3f});
  tl.from("#playalong-head", {{ y: 40, opacity: 0, duration: {min(0.6, b):.2f}, ease: "power3.out" }}, {beat_n(2) - 0.05:.3f});
  tl.from("#playalong-sub", {{ y: 20, opacity: 0, duration: {min(0.5, b):.2f}, ease: "expo.out" }}, {beat_n(4) - 0.05:.3f});""")
        elif new == "close":
            pulses = max(1, int((p.duration - 1.2 - beat_n(4)) / b))
            js.append(f"""  tl.from("#close-mark", {{ scale: 0.6, opacity: 0, duration: {min(0.8, 1.2 * b):.2f}, ease: "back.out(1.8)" }}, {t:.3f});
  tl.from("#close-line", {{ y: 30, opacity: 0, duration: {min(0.6, b):.2f}, ease: "power3.out" }}, {beat_n(1) - 0.05:.3f});
  tl.from("#close-cta", {{ y: 30, scale: 0.8, opacity: 0, duration: {min(0.55, b):.2f}, ease: "back.out(2.4)" }}, {beat_n(2) - 0.05:.3f});
  tl.from("#close-url", {{ x: 40, opacity: 0, duration: {min(0.55, b):.2f}, ease: "expo.out" }}, {beat_n(2) + b / 2 - 0.05:.3f});
  tl.from("#close-price", {{ y: 20, opacity: 0, duration: {min(0.5, b):.2f}, ease: "sine.out" }}, {beat_n(3) - 0.05:.3f});
  // The button pulses on each beat until the music ends.
  tl.to("#close-cta", {{ scale: 1.07, duration: {b / 2:.4f}, ease: "sine.inOut", yoyo: true, repeat: {2 * pulses - 1} }}, {beat_n(4) - b / 4:.3f});
  // The final scene fades out with the music.
  tl.to("#close", {{ opacity: 0, duration: 0.6, ease: "sine.in" }}, {p.duration - 0.6:.3f});""")
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
    for name, v in VERSIONS.items():
        plan = Plan(v)
        CURRENT_TAG = v["tag"]
        audio = mix(name, plan)
        open(v["out"], "w").write(build(plan, v["tag"], audio))
        print(f"{v['out']}: {v['credit']} from {v['start']} s, {plan.duration} s, bar {plan.bar:.3f} s;",
              "cuts", ", ".join(f"{c:.2f}" for c in plan.cuts[1:]))
