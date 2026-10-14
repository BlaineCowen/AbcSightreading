"""The piano sight reading announcement: writes index.html (1920x1080) and
../ad-piano-vertical/index.html (1080x1920), cut to Fun Fun Music.

    python3 build.py && npx --yes hyperframes@0.8.125 check

It is the main ad's machinery (../ad/build.py: its template, wipes, the
bouncing-ball hook and the close), with the piano page's own captures
(../ad/capture/piano.ts, recorded at the song's tempo). The song starts on
its bar 12 so its ending closes the video; every scene is whole bars and
changes on a downbeat. The playing scenes are placed so a note lands on the
scene's first downbeat, so the cursor keeps the song's beat.
"""
import importlib.util
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("adbuild", os.path.join(HERE, "../ad/build.py"))
ad = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ad)
esc, keep_words, ABC_SVG, TINTS, WIPES = ad.esc, ad.keep_words, ad.ABC_SVG, ad.TINTS, ad.WIPES

ORDER = ["hook", "levels", "generate", "play", "grade", "close"]
HOOK_WORDS = [["Sight-reading"], ["for"], ["piano"], ["is"], ["here."]]
HOOK_RHYTHM = [4, 4, 4, 4, 8]
URL = "abcsightreading.com/piano-sightreading"

COPY = {
    "levels": dict(kicker="Piano · Levels 1 to 10", tint="sky", head="Ten levels, both hands.",
                   body="From five-finger C position to a beginner's Mozart sonata."),
    "generate": dict(kicker="A new exercise every click", tint="mint", flip=True, head="Real left-hand patterns.",
                     body="Block chords, waltz bass and Alberti bass, over real chord progressions."),
    "play": dict(kicker="Hear it", tint="peach", head="Follow along as it plays.",
                 body="A grand piano, the notes lit as they sound, or one line that scrolls."),
    "grade": dict(kicker="Pro · MIDI keyboard", tint="butter", flip=True, head="Play it. Get graded.",
                  body="Wrong keys, late notes and misses, marked right on the score."),
}

VERSIONS = {
    "landscape": dict(song="fun-fun-60-fix", start=28.731, end=62.2, final_hit=57.52, tag="100",
                      bars=[2, 2, 2, 3, 2], out=os.path.join(HERE, "index.html"), portrait=False, breaks=[3]),
    "vertical": dict(song="fun-fun-60-fix", start=28.731, end=62.2, final_hit=57.52, tag="100",
                     bars=[2, 2, 2, 3, 2], out=os.path.join(HERE, "../ad-piano-vertical/index.html"), portrait=True, breaks=[1, 3]),
}

# How each clip is framed in its window: zoomed in on the music where the
# page around it is empty (scale, and the point it scales from, in %).
ZOOM = {
    False: {"play": (1.3, 50, 7), "scroll": (1.45, 50, 25), "grade-live": (1.4, 50, 2), "grade-result": (1.4, 50, 2)},
    # The vertical cut shows the desktop site too (Blaine: not the phone view), a little closer in.
    True: {"play": (1.3, 50, 7), "scroll": (1.45, 50, 25), "grade-live": (1.4, 50, 2), "grade-result": (1.4, 50, 2)},
}


class Plan:
    """Beats, bars and scene changes in video seconds."""

    def __init__(self, v):
        a = json.load(open(os.path.join(HERE, f"../ad/music/{v['song']}.json")))
        self.v, self.beat, self.bar = v, a["beat"], 4 * a["beat"]
        self.duration = round(v["end"] - v["start"] + 0.7, 2)
        self.downbeats = [max(0.0, d - v["start"]) for d in a["downbeats"] if d >= v["start"] - 0.03]
        self.beats = [b for b in (a["first_beat"] + k * a["beat"] - v["start"] for k in range(int((v["end"] + 2) / a["beat"]))) if -0.03 <= b <= self.duration]
        self.beats = [max(0.0, b) for b in self.beats]
        cum = [sum(v["bars"][:i]) for i in range(len(v["bars"]) + 1)]
        self.cuts = [self.downbeats[c] for c in cum]
        self.scene_at = dict(zip(ORDER, self.cuts))

    def end_of(self, scene):
        i = ORDER.index(scene)
        return self.cuts[i + 1] if i + 1 < len(self.cuts) else self.duration

    def beat_after(self, t, n=0):
        ahead = [b for b in self.beats if b >= t - 0.01]
        return ahead[min(n, len(ahead) - 1)]


def cap(name, tag):
    return json.load(open(os.path.join(HERE, f"../ad/assets/captures/piano-{name}-{tag}.json")))


def clips_for(scene, p, tag):
    """(file, seconds into it, video start, seconds shown, zoom key)."""
    at, bar, beat, end = p.scene_at[scene], p.bar, p.beat, p.end_of(scene)
    f = lambda name: f"piano-{name}-{tag}"
    if scene == "levels":
        # The Level pill clicked on the scene's second beat, then a level a beat.
        first = next(w["at"] for w in cap("levels", tag)["words"] if w["word"] == "click")
        return [(f("levels"), first - beat, at, end - at, None)]
    if scene == "generate":
        # New exercise on the scene's first downbeat, then every two beats.
        first = next(w["at"] for w in cap("generate", tag)["words"] if w["word"] == "click")
        return [(f("generate"), first - 0.05, at, end - at, None)]
    if scene == "play":
        # Two bars of the score lit as it plays, its first note on the downbeat;
        # then a bar of the scrolling line, two bars into its music.
        play, scroll = cap("play", tag), cap("scroll", tag)
        return [(f("play"), play["music_start"], at, 2 * bar, "play"),
                (f("scroll"), scroll["music_start"] + 2 * bar, at + 2 * bar, end - at - 2 * bar, "scroll")]
    if scene == "grade":
        # A bar of the run (its third bar, the keys lighting), then the score
        # with what was played drawn on it.
        g = cap("grade", tag)
        return [(f("grade"), g["music_start"] + 2 * bar, at, bar, "grade-live"),
                (f("grade"), g["seconds"] - bar - 0.35, at + bar, end - at - bar, "grade-result")]
    raise KeyError(scene)


def feature(scene, p, tag, track0, portrait):
    s = COPY[scene]
    bg, ink = TINTS[s["tint"]]
    clips = []
    for k, (file, media, start, dur, zoom) in enumerate(clips_for(scene, p, tag)):
        z = ZOOM[portrait].get(zoom) if zoom else None
        style = f' style="transform:scale({z[0]});transform-origin:{z[1]}% {z[2]}%"' if z else ""
        clips.append(f'<div class="vw" id="{scene}-vw{k}"{style}>{ad.video_tag(f"{scene}-v{k}", file, start, dur + 0.3, media, track0 + k)}</div>')
    return f'''
<div class="scene" id="{scene}">
  {ad.blobs(scene)}
  <div class="scene-content{' flip' if s.get('flip') else ''}">
    <div class="copy">
      <span class="kicker" id="{scene}-kicker" style="background:{bg};color:{ink}">{esc(s["kicker"])}</span>
      <h2 class="head" id="{scene}-head">{keep_words(s["head"])}</h2>
      <p class="body" id="{scene}-body">{esc(s["body"])}</p>
    </div>
    <div class="window" id="{scene}-window">
      <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="url">{esc(URL)}</span></div>
      <div class="screen">{''.join(clips)}</div>
    </div>
  </div>
</div>'''


def build(p, tag, audio, portrait):
    parts, track = {}, 10
    for scene in COPY:
        parts[scene] = feature(scene, p, tag, track, portrait)
        track += 4
    words, i = [], 0
    for w, word in enumerate(HOOK_WORDS):
        spans = "".join(f'<span class="hw" id="hw{(i := i + 1) - 1}">{esc(syl)}</span>' for syl in word)
        words.append(("<br>" if w in p.v["breaks"] else " " if w else "") + f'<span class="hword">{spans}</span>')
    parts["hook"] = f'''
<div class="scene" id="hook">
  {ad.blobs("hook")}
  <div class="hook-content">
    <div class="wordmark hook-mark">{ABC_SVG}<span class="rest">sightreading.com</span></div>
    <span class="kicker new-badge" id="hook-new">New</span>
    <h1 class="hook-head">{"".join(words)}</h1>
  </div>
  <div class="ball" id="hook-ball" data-layout-allow-occlusion></div>
</div>'''
    parts["close"] = f'''
<div class="scene" id="close">
  {ad.blobs("close")}
  <div class="close-content">
    <div class="close-mark" id="close-mark">{ABC_SVG}<span class="rest">SightReading</span></div>
    <p class="close-line" id="close-line">Piano sight-reading, live now. Both hands, ten levels, a new exercise every click.</p>
    <div class="close-row">
      <span class="cta" id="close-cta">Try it free</span>
      <span class="url-pill" id="close-url">abcsightreading.com</span>
    </div>
    <p class="close-price" id="close-price">Free to start. Grading with a MIDI keyboard is Pro, $19.99 a year.</p>
  </div>
</div>'''
    body = "\n".join(parts[k] for k in ORDER)
    W, H = (1080, 1920) if portrait else (1920, 1080)
    extra = EXTRA_CSS + (ad.PORTRAIT_CSS + PORTRAIT_EXTRA if portrait else "")
    return (ad.TEMPLATE.replace("%%SCENES%%", body).replace("%%EXTRA_CSS%%", extra)
            .replace("%%W%%", str(W)).replace("%%H%%", str(H)).replace("%%RES%%", "portrait" if portrait else "landscape")
            .replace("%%SCRIPT%%", script(p, tag, W)).replace("%%DURATION%%", f"{p.duration:g}").replace("%%MUSIC%%", audio))


EXTRA_CSS = """
#hw3 { color: inherit; }
#hw2 { color: #2f6fe0; }
.new-badge { background: #ffd3bf; color: #5a2310; font-size: 40px; padding: 10px 34px; margin-top: -40px; }
.screen { overflow: hidden; }
.vw { transform-origin: 50% 50%; }
"""
PORTRAIT_EXTRA = """
/* The desktop site in a wide browser window under the words, not a phone. */
.scene-content, .scene-content.flip { justify-content: center; padding: 0 40px 120px; gap: 80px; }
.head { font-size: 92px; }
.body { font-size: 42px; }
.window { width: 1000px; border-radius: 30px; }
.window .bar { height: 48px; }
.url { font-size: 18px; }
.screen { height: 562px; }
.new-badge { margin-top: -50px; }
.close-line { font-size: 42px; }
"""


def script(p, tag, W):
    b, sixteenth = p.beat, p.beat / 4
    onsets, n = [], 0
    for d in HOOK_RHYTHM:
        onsets.append(p.beats[1] + n * sixteenth)
        n += d
    js = [f"  var HOOK = {json.dumps([round(t, 3) for t in onsets])}, LEN = {json.dumps([round(d * sixteenth, 4) for d in HOOK_RHYTHM])}, B = {b:.4f}, W = {W};"]
    # The main ad's hook (the ball onto each word), unchanged, from its script().
    js.append(HOOK_JS)
    js.append(f'  tl.from("#hook-new", {{ scale: 0.4, opacity: 0, duration: 0.45, ease: "back.out(2.6)" }}, {max(0.0, p.beats[0] + 0.02):.3f});')
    js.append("  tl.to('.blob', { y: '+=40', x: '-=20', duration: %g, ease: 'sine.inOut' }, 0);" % p.duration)
    for k in range(1, len(ORDER)):
        old, new, t = ORDER[k - 1], ORDER[k], p.cuts[k]
        w0 = t - ad.SWAP
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
            js.append(f"""  tl.from("#{new}-window", {{ x: {-sx}, scale: 0.94, opacity: 0, duration: {min(0.8, 1.2 * b):.2f}, ease: "power3.out" }}, {t:.3f});
  tl.from("#{new}-kicker", {{ y: 24, opacity: 0, duration: {0.7 * b:.3f}, ease: "back.out(2)" }}, {beat_n(1) - 0.05:.3f});
  tl.from("#{new}-head", {{ y: 46, opacity: 0, duration: {min(0.65, b):.2f}, ease: "power3.out" }}, {beat_n(2) - 0.05:.3f});
  tl.from("#{new}-body", {{ y: 28, opacity: 0, duration: {min(0.6, b):.2f}, ease: "expo.out" }}, {beat_n(3) - 0.05:.3f});""")
            for c, (_, _, start, _, _) in enumerate(clips_for(new, p, tag)):
                if c > 0:
                    js.append(f'  tl.fromTo("#{new}-vw{c}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.12, ease: "sine.inOut" }}, {start - 0.06:.3f});')
        elif new == "close":
            e = p.v["final_hit"] - p.v["start"]
            js.append(f"""  tl.from("#close-mark", {{ scale: 0.6, opacity: 0, duration: {min(0.8, 1.2 * b):.2f}, ease: "back.out(1.8)" }}, {t:.3f});
  tl.from("#close-line", {{ y: 30, opacity: 0, duration: {min(0.6, b):.2f}, ease: "power3.out" }}, {beat_n(1) - 0.05:.3f});
  tl.from("#close-cta", {{ y: 30, scale: 0.8, opacity: 0, duration: {min(0.55, b):.2f}, ease: "back.out(2.4)" }}, {beat_n(2) - 0.05:.3f});
  tl.from("#close-url", {{ x: 40, opacity: 0, duration: {min(0.55, b):.2f}, ease: "expo.out" }}, {beat_n(2) + b / 2 - 0.05:.3f});
  tl.from("#close-price", {{ y: 20, opacity: 0, duration: {min(0.5, b):.2f}, ease: "sine.out" }}, {beat_n(3) - 0.05:.3f});
  // On the ending's last hit, the logo and the button pop.
  tl.to(["#close-mark", "#close-cta"], {{ scale: 1.1, duration: 0.09, ease: "power2.out", yoyo: true, repeat: 1 }}, {e - 0.03:.3f});
  tl.to("#close", {{ opacity: 0, duration: 0.6, ease: "sine.in" }}, {p.duration - 0.6:.3f});""")
    return "\n".join(js)


# The main ad's hook: the ball lands on each word in time, wrapping between lines.
HOOK_JS = """
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
    var in0 = Math.max(0, HOOK[0] - B);
    tl.set("#hook-ball", { x: -80, y: hops[0].y, opacity: 1 }, in0);
    hop(hops[0].x, hops[0].y, in0, HOOK[0] - in0, 170);
    for (var i = 1; i < N; i++) {
      var d = LEN[i - 1], peak = d > 0.5 ? 150 : d > 0.2 ? 110 : 65;
      if (hops[i].y > hops[i - 1].y + 30) {
        var off = W + 60 - hops[i - 1].x, on = hops[i].x + 60, up = d * off / (off + on);
        tl.to("#hook-ball", { x: W + 60, y: hops[i - 1].y - peak, duration: up, ease: "power1.out" }, HOOK[i - 1]);
        tl.set("#hook-ball", { x: -60, y: hops[i].y - peak }, HOOK[i - 1] + up);
        tl.to("#hook-ball", { x: hops[i].x, y: hops[i].y, duration: d - up - 0.001, ease: "power1.in" }, HOOK[i - 1] + up);
      } else hop(hops[i].x, hops[i].y, HOOK[i - 1], d, peak);
    }
    hop(W + 90, hops[N - 1].y + 40, HOOK[N - 1], LEN[N - 1], 110);
  }"""


if __name__ == "__main__":
    for name, v in VERSIONS.items():
        os.makedirs(os.path.dirname(v["out"]), exist_ok=True)
        plan = Plan(v)
        # The mix is written into the shared assets (../ad/assets/music), which both cuts link to.
        cwd = os.getcwd()
        os.chdir(os.path.join(HERE, "../ad"))
        audio = ad.mix(f"piano-{name}", plan)
        os.chdir(cwd)
        open(v["out"], "w").write(build(plan, v["tag"], audio, v["portrait"]))
        print(f"{v['out']}: {plan.duration} s, bar {plan.bar:.3f} s; cuts", ", ".join(f"{c:.2f}" for c in plan.cuts[1:]))
