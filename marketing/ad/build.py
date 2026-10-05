"""Writes the ad's compositions, one per song, cut to the song.

    python3 build.py && npx --yes hyperframes@0.8.125 check

Each version is planned in BARS of its song (music/<song>.json, from
music/analyze.py: tempo, beats, downbeats, sections). The song starts on a
downbeat chosen so its own ending lands just before the video's end; every
scene is a whole number of bars and every scene change lands exactly on a
downbeat (the wipe starts SWAP seconds early so the cover is complete on the
beat). The scenes change with the song's phrases, every 4 bars (the hook
is a 2-bar pickup into Unison, whose exercise starts where the band comes
in, bar 4). Text enters on beats; the hook's ball lands on each syllable;
the options montage swipes a card a beat; the close's button pulses on the
beat.

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
# The hook: the ball lands on a word a beat (each length in sixteenths).
HOOK_WORDS = [["Sight-reading"], ["practice"], ["that"], ["never"], ["runs"], ["out."]]
HOOK_BREAK = 2   # line two starts at this word
HOOK_RHYTHM = [4, 4, 4, 4, 4, 4]
SWAP = 0.24             # how long into a wipe the scenes change over: the wipe starts this much before the downbeat

VERSIONS = {
    # start: a downbeat of the song; end: where its music stops (measured).
    # The song's own 60 s cut, straight through. Its phrases, in bars from
    # 0: intro 0-3, build 4-7, chorus 8-15, verse 16-19, 20-22, a break
    # bar 23, the final hit on 24. The hook is the intro's first half;
    # Unison clicks Generate on the beat over its second half, and the
    # second example (bass clef) starts playing with the band (bar 4);
    # every other cut is on a phrase.
    # final_hit: the ending's last hit (Blaine's fix of the 60 s cut ends
    # on the full version's last riff), where the close's logo and button pop.
    "fun": dict(song="fun-fun-60-fix", start=0.0, end=62.2, tag="100", final_hit=57.80,
                bars=[2, 2, 4, 4, 2, 2, 4, 3, 2], credit="Fun Fun Music, 60 s (prettyjohn1)", out="../ad-fun/index.html"),
}
ORDER = ["hook", "unison", "bass", "choral", "rhythm", "tuner", "playalong", "options", "close"]

COPY = {
    "unison": dict(kicker="Unison", tint="sky", head="A new exercise every click.",
                   body="Your key, your notes, your rhythms, over real chord progressions.", url="abcsightreading.com/sightreading"),
    "bass": dict(kicker="Unison", tint="peach", flip=True, head="Treble, bass, alto or tenor.",
                 body="Any key, sung in time. Solfège, fixed do or note names.", url="abcsightreading.com/sightreading"),
    "choral": dict(kicker="Choral", tint="mint", flip=True, head="Two, three and four parts.",
                   body="SATB, SSA and TTB, from UIL Level 1 to 5.", url="abcsightreading.com/choral-sightreading"),
    "rhythm": dict(kicker="Rhythm", tint="butter", head="Ta, ti-ti, ti-ki-ti-ki.",
                   body="Ta and ti-ti, 1 & 2 &, or your own syllables.", url="abcsightreading.com/sightreading"),
    "tuner": dict(kicker="abcTuner · Pro", tint="sky", flip=True, head="A tuner that hears singers.",
                  body="Pitch, vowels, drone, metronome and timer, a tab each.", url="abcsightreading.com/tuner"),
}

# The options montage: the app's own settings panels (capture.ts panels,
# cropped into assets/footage/panels), a panel a beat for 12 beats, then all
# of them at once as a wall for the last bar.
PANELS = [
    ("u-setup", "Unison · Setup"), ("u-notes", "Unison · Notes and skips"), ("u-rhythm", "Unison · Rhythms"),
    ("u-score", "Sound, solfège, dynamics"), ("nyssma", "NYSSMA Levels I-V"), ("c-setup", "Choral · Setup"),
    ("c-harmony", "Choral · Harmony"), ("c-ranges", "Choral · Voice ranges"), ("c-rhythm", "Choral · Rhythms"),
    ("c-score", "Choral · Score options"), ("uil", "UIL Levels 1-5"), ("steps", "abcStepByStep · 23 steps"),
]
PANEL_BOX = (1560, 640, 960, 655)     # the largest a panel is shown, and its centre
WALL = (4, 3, 70, 300, 1850, 1050)   # the closing wall: columns, rows, and its box


def png_size(path):
    with open(path, "rb") as f:
        d = f.read(24)
    return int.from_bytes(d[16:20], "big"), int.from_bytes(d[20:24], "big")


def panel_geometry():
    """Each panel's size on screen, centred on PANEL_BOX, and where it sits in the wall."""
    bw, bh, cx, cy = PANEL_BOX
    cols, rows, x0, y0, x1, y1 = WALL
    cw, ch = (x1 - x0) / cols, (y1 - y0) / rows
    out = []
    for i, (name, label) in enumerate(PANELS):
        iw, ih = png_size(f"assets/footage/panels/{name}.png")
        k = min(bw / iw, bh / ih)
        w, h = iw * k, ih * k
        c, r = i % cols, i // cols
        wall_scale = min((cw - 24) / w, (ch - 24) / h)
        out.append(dict(name=name, label=label, w=w, h=h, x=cx - w / 2, y=cy - h / 2,
                        dx=x0 + (c + 0.5) * cw - cx, dy=y0 + (r + 0.5) * ch - cy, s=wall_scale))
    return out


TINTS = {"sky": ("#c9e4ff", "#0e3563"), "mint": ("#bdebd9", "#0f3b2c"),
         "peach": ("#ffd3bf", "#5a2310"), "butter": ("#ffefa8", "#5c4a00")}
WIPES = ["#c9e4ff", "#bdebd9", "#ffd3bf", "#ffefa8"]


def esc(s):
    return html.escape(s, quote=True)


def keep_words(s):
    """Escaped text with hyphenated words kept whole: ti-ki-ti-ki never breaks at a hyphen."""
    return re.sub(r"(\S*-\S*)", r'<span class="nw">\1</span>', esc(s))


# The site's logo "abc": the favicon's Edwin Bold Italic as outlines, as the navbar draws it.
ABC_PATH = "M440 -463 426 -416C402 -457 360 -477 301 -477C153 -477 15 -327 15 -166C15 -60 87 14 188 14C257 14 304 -11 351 -73C351 -51 351 -49 354 -41C363 -8 396 14 436 14C527 14 604 -85 646 -157L607 -181C570 -124 520 -70 503 -70C496 -70 489 -78 489 -86C489 -93 489 -94 499 -131L597 -463ZM334 -422C370 -422 395 -393 395 -350C395 -275 336 -56 239 -56C201 -56 178 -86 178 -135C178 -214 232 -422 334 -422ZM1018 -736 751 -722 744 -675H768C818 -675 830 -669 830 -644C830 -633 827 -623 814 -577L717 -251C696 -180 695 -177 695 -145C695 -49 776 14 899 14C981 14 1053 -14 1113 -70C1182 -133 1224 -223 1224 -306C1224 -404 1151 -478 1055 -478C1007 -478 973 -464 927 -426ZM997 -407C1034 -407 1061 -375 1061 -333C1061 -258 1000 -29 904 -29C865 -29 838 -60 838 -105C838 -155 864 -252 895 -315C925 -378 958 -407 997 -407ZM1684 -146C1625 -78 1577 -47 1528 -47C1480 -47 1446 -86 1446 -141C1446 -227 1497 -431 1609 -431C1634 -431 1651 -421 1651 -406C1651 -399 1648 -395 1639 -390C1611 -372 1601 -357 1601 -328C1601 -285 1633 -256 1679 -256C1731 -256 1765 -293 1765 -349C1765 -427 1698 -478 1594 -478C1424 -478 1281 -338 1281 -171C1281 -58 1362 14 1488 14C1576 14 1647 -26 1720 -116Z"
ABC_SVG = f'<svg class="abc" viewBox="0 -736 1780 750" fill="currentColor" aria-hidden="true"><path d="{ABC_PATH}"/></svg>'


def wordmark(rest="sightreading.com", cls="wordmark"):
    return f'<div class="{cls}">{ABC_SVG}<span class="rest">{esc(rest)}</span></div>'


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
        self.duration = round(v["end"] - v["start"] + 0.7, 2)
        self.downbeats = [max(0.0, d - v["start"]) for d in a["downbeats"] if d >= v["start"] - 0.03]
        first = a["first_beat"]
        self.beats = [first + k * a["beat"] - v["start"] for k in range(int((v["end"] + 2) / a["beat"]))]
        self.beats = [max(0.0, b) for b in self.beats if -0.03 <= b <= self.duration]
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
        # Generate clicked every two beats (capture.ts clicks): the first click on the scene's second beat.
        first = next(w["at"] for w in cap("unison-clicks")["words"] if w["word"] == "click")
        return [(f"unison-clicks-{tag}", first - p.beat, at, end - at)]
    if scene == "bass":
        # Already counted in: its first note on the scene's first downbeat, with the band.
        return [(f"unison-bass-{tag}", cap("unison-bass")["music_start"], at, end - at)]
    if scene == "choral":
        # Recorded from Play (capture.ts): the count-in's "1" on the scene's first downbeat.
        return [(f"choral-{tag}", cap("choral")["countin_start"], at, end - at)]
    if scene in ("choral", "rhythm"):
        c = cap(scene)
        if p.scene_bars[scene] >= 3:
            return [(f"{scene}-{tag}", 0.5, at, bar), (f"{scene}-{tag}", c["countin_start"], at + bar, end - at - bar)]
        # The first note on the scene's first downbeat.
        return [(f"{scene}-{tag}", c["music_start"], at, end - at)]
    if scene == "tuner":
        last = bar if end - at > 1.5 * bar else (end - at) / 2
        return [("tuner", 1.0, at, end - at - last), ("tuner", 9.8, end - last, last)]
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
    src = f"assets/music/{v['song']}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(v["start"]), "-i", src,
                    "-t", str(p.duration), "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.05,afade=t=out:st={p.duration - 0.5}:d=0.5",
                    "-ar", "48000", "-b:a", "192k", out], check=True)
    # MP3 framing trims the end a little: the video is as long as the audio really is.
    real = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                                capture_output=True, text=True, check=True).stdout)
    p.duration = round(min(p.duration, real), 2)
    return out


def build(p, tag, audio):
    parts, tracks = {}, 10
    for scene in (s for s in ORDER if s in COPY):
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
    cards = "".join(
        f'<div class="pcard" id="pc{i}" style="left:{g["x"]:.0f}px;top:{g["y"]:.0f}px;width:{g["w"]:.0f}px;height:{g["h"]:.0f}px">'
        f'<span class="plabel" id="pl{i}">{esc(g["label"])}</span>'
        f'<img src="assets/footage/panels/{g["name"]}.png" alt=""></div>' for i, g in enumerate(panel_geometry()))
    parts["options"] = f'''
<div class="scene" id="options">
  {blobs("options")}
  <div class="opt-top">
    <span class="kicker" id="options-kicker" style="background:#ffefa8;color:#5c4a00">And so much more</span>
    <h2 class="head opt-head" id="options-head">Set it up your way.</h2>
  </div>
  <div class="pdeck" data-layout-ignore>{cards}</div>
</div>'''
    def hook_words():
        # A span a syllable (the ball lands on each), the words whole on the page.
        out, i = [], 0
        for word in HOOK_WORDS:
            spans = []
            for syl in word:
                spans.append(f'<span class="hw" id="hw{i}">{syl}</span>')
                i += 1
            out.append(f'<span class="hword">{"".join(spans)}</span>')
        return " ".join(out[:HOOK_BREAK]) + "<br>" + " ".join(out[HOOK_BREAK:])
    parts["hook"] = f'''
<div class="scene" id="hook">
  {blobs("hook")}
  <div class="hook-content">
    {wordmark(cls="wordmark hook-mark")}
    <h1 class="hook-head">{hook_words()}</h1>
  </div>
  <div class="ball" id="hook-ball" data-layout-allow-occlusion></div>
</div>'''
    parts["close"] = f'''
<div class="scene" id="close">
  {blobs("close")}
  <div class="close-content">
    <div class="close-mark" id="close-mark">{ABC_SVG}<span class="rest">SightReading</span></div>
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
    # The hook: the line in time (HOOK_RHYTHM), the ball landing on each
    # word. In from off the left on beat 1, "Sight" landing on
    # beat 2 (so "out." lands on bar 2's downbeat); between the lines it wraps (off the right edge, in
    # from the left) rather than flying back across the words; away off the
    # right after "out.".
    sixteenth = b / 4
    onsets, n = [], 0
    for d in HOOK_RHYTHM:
        onsets.append(p.beats[1] + n * sixteenth)
        n += d
    line2 = sum(len(w) for w in HOOK_WORDS[:HOOK_BREAK])
    js = [f"  var HOOK = {json.dumps([round(t, 3) for t in onsets])}, LEN = {json.dumps([round(d * sixteenth, 4) for d in HOOK_RHYTHM])}, B = {b:.4f}, LINE2 = {line2};"]
    js.append("""
  // ---- Hook
  tl.from(".hook-mark", { y: -30, opacity: 0, duration: 0.6, ease: "back.out(1.7)" }, 0.05);
  var N = HOOK.length;
  for (var i = 0; i < N; i++) {
    tl.from("#hw" + i, { y: 40, scale: 0.85, opacity: 0, duration: 0.3, ease: "back.out(2.2)" }, HOOK[i] - 0.04);
  }
  var hops = window.__hops || [];
  function hop(x, y, from, d, peak) {
    tl.to("#hook-ball", { x: x, duration: d, ease: "none" }, from);
    tl.to("#hook-ball", { y: y - peak, duration: d / 2, ease: "power2.out" }, from);
    tl.to("#hook-ball", { y: y, duration: d / 2 - 0.001, ease: "power2.in" }, from + d / 2);
  }
  if (hops.length === N) {
    var in0 = Math.max(0, HOOK[0] - B);   // the song may start on the downbeat itself
    tl.set("#hook-ball", { x: -80, y: hops[0].y, opacity: 1 }, in0);
    hop(hops[0].x, hops[0].y, in0, HOOK[0] - in0, 170);
    // Each hop lasts its syllable: higher for the longer notes.
    for (var i = 1; i < N; i++) {
      var d = LEN[i - 1], peak = d > 0.5 ? 150 : d > 0.2 ? 110 : 65;
      if (i === LINE2) {
        // Wrap: off the right edge on the way up, in from the left on the way down.
        var off = 1920 + 60 - hops[i - 1].x, on = hops[i].x + 60, up = d * off / (off + on);
        tl.to("#hook-ball", { x: 1920 + 60, y: hops[i - 1].y - peak, duration: up, ease: "power1.out" }, HOOK[i - 1]);
        tl.set("#hook-ball", { x: -60, y: hops[i].y - peak }, HOOK[i - 1] + up);
        tl.to("#hook-ball", { x: hops[i].x, y: hops[i].y, duration: d - up - 0.001, ease: "power1.in" }, HOOK[i - 1] + up);
      } else hop(hops[i].x, hops[i].y, HOOK[i - 1], d, peak);
    }
    // "out." held, then away off the right.
    hop(1920 + 90, hops[N - 1].y + 40, HOOK[N - 1], LEN[N - 1], 110);
  }""")
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
        elif new == "options":
            # A panel swipes in on each beat, the last one out as it comes;
            # then, on the last bar's downbeat, every panel at once as a wall.
            # As many as the scene has beats for, keeping its last bar for the
            # wall (which shows every panel, flashed or not).
            n = min(len(PANELS), round((p.end_of(new) - t) / b) - 4)
            js.append(f'''  tl.from("#options-kicker", {{ y: 24, opacity: 0, duration: {0.7 * b:.3f}, ease: "back.out(2)" }}, {t + 0.05:.3f});
  tl.from("#options-head", {{ y: 40, opacity: 0, duration: {min(0.6, b):.2f}, ease: "power3.out" }}, {t + 0.12:.3f});''')
            for i in range(n):
                at = beat_n(i) - 0.14
                js.append(f'  tl.fromTo("#pc{i}", {{ x: 2100, rotation: 5, opacity: 1 }}, {{ x: 0, rotation: 0, duration: 0.3, ease: "power3.out" }}, {at:.3f});')
                if i:
                    js.append(f'  tl.to("#pc{i - 1}", {{ x: -2100, rotation: -5, duration: 0.3, ease: "power3.in" }}, {at:.3f});')
            wall = beat_n(n) - 0.2
            for i, g in enumerate(panel_geometry()):
                if i >= n:   # never flashed: out of the deck, from the middle
                    js.append(f'  tl.set("#pc{i}", {{ x: 0, scale: 0.6 }}, {wall - 0.01:.3f});')
                js.append(f'  tl.to("#pl{i}", {{ opacity: 0, duration: 0.15 }}, {wall:.3f});')
                js.append(f'  tl.to("#pc{i}", {{ x: {g["dx"]:.0f}, y: {g["dy"]:.0f}, scale: {g["s"]:.3f}, rotation: 0, opacity: 1, duration: 0.45, ease: "back.out(1.2)" }}, {wall + 0.03 * i:.3f});')
        elif new == "close":
            e = p.v.get("final_hit")
            pulses = max(1, int((p.duration - 1.2 - beat_n(4)) / b))
            js.append(f"""  tl.from("#close-mark", {{ scale: 0.6, opacity: 0, duration: {min(0.8, 1.2 * b):.2f}, ease: "back.out(1.8)" }}, {t:.3f});
  tl.from("#close-line", {{ y: 30, opacity: 0, duration: {min(0.6, b):.2f}, ease: "power3.out" }}, {beat_n(1) - 0.05:.3f});
  tl.from("#close-cta", {{ y: 30, scale: 0.8, opacity: 0, duration: {min(0.55, b):.2f}, ease: "back.out(2.4)" }}, {beat_n(2) - 0.05:.3f});
  tl.from("#close-url", {{ x: 40, opacity: 0, duration: {min(0.55, b):.2f}, ease: "expo.out" }}, {beat_n(2) + b / 2 - 0.05:.3f});
  tl.from("#close-price", {{ y: 20, opacity: 0, duration: {min(0.5, b):.2f}, ease: "sine.out" }}, {beat_n(3) - 0.05:.3f});
  {"// The button pulses on each beat until the music ends." if not e else "// Over the stop it waits; on the ending's last hit, the logo and the button pop."}
  {f'tl.to("#close-cta", {{ scale: 1.07, duration: {b / 2:.4f}, ease: "sine.inOut", yoyo: true, repeat: {2 * pulses - 1} }}, {beat_n(4) - b / 4:.3f});' if not e else
   f'tl.to(["#close-mark", "#close-cta"], {{ scale: 1.1, duration: 0.09, ease: "power2.out", yoyo: true, repeat: 1 }}, {e - p.v["start"] - 0.03:.3f});'}
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

.wordmark { display: inline-flex; align-items: baseline; gap: 0.1em; background: #ffffff; border-radius: 999px; padding: 14px 34px; box-shadow: 0 12px 30px rgba(21,33,58,0.10); }
.wordmark .abc, .close-mark .abc { height: 0.75em; width: auto; color: #1e56c0; }
.wordmark .rest, .close-mark .rest { font-family: "Fredoka", sans-serif; font-weight: 600; letter-spacing: -0.005em; line-height: 1; color: #15213a; }
.wordmark { font-size: 44px; } .wordmark .rest { font-size: 44px; }

.hook-content { position: relative; z-index: 2; width: 100%; height: 100%; padding: 120px 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 70px; text-align: center; }
.hook-head { font-family: "Fredoka", sans-serif; font-weight: 700; font-size: 132px; line-height: 1.22; letter-spacing: -0.01em; color: #15213a; }
.hook-head .hw { display: inline-block; }
.hook-head .hword { display: inline-block; }
#hw3 { color: #2f6fe0; }
#hook-ball { z-index: 1; } /* behind the words, so a hop never covers line one */
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

.opt-top { position: absolute; z-index: 3; left: 0; right: 0; top: 54px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
.opt-head { font-size: 76px; max-width: none; white-space: nowrap; }
.pdeck { position: absolute; inset: 0; z-index: 2; }
.pcard { position: absolute; border-radius: 26px; background: #fff; box-shadow: 0 30px 70px rgba(21,33,58,0.22); border: 2px solid #d8e2f1; opacity: 0; }
.pcard img { display: block; width: 100%; height: 100%; border-radius: 24px; }
.plabel { position: absolute; left: 22px; top: -26px; font-family: "Fredoka", sans-serif; font-weight: 600; font-size: 30px; color: #0e3563; background: #c9e4ff; padding: 6px 22px; border-radius: 999px; white-space: nowrap; }
.pa-content { position: relative; z-index: 2; width: 100%; height: 100%; padding: 46px 120px 40px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
.pa-top { display: flex; align-items: center; gap: 28px; }
.pa-head { font-size: 60px; max-width: none; white-space: nowrap; }
.pa-frame { position: relative; width: 1376px; height: 774px; border-radius: 30px; overflow: hidden; box-shadow: 0 30px 70px rgba(21,33,58,0.22); border: 2px solid #d8e2f1; }
.pa-sub { font-family: "Nunito", sans-serif; font-weight: 800; font-size: 32px; color: #34405e; }

.close-content { position: relative; z-index: 2; width: 100%; height: 100%; padding: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 44px; text-align: center; }
.close-mark { display: inline-flex; align-items: baseline; gap: 0.1em; font-size: 150px; }
.close-mark .rest { font-size: 150px; }
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
  for (var i = 0; document.getElementById("hw" + i); i++) {
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
