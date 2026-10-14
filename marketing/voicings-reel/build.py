"""Writes index.html and assets/audio/bed.wav for the voicings and full-length Reel.

Every score is a real exercise from the Choral page (../uil-reel-src/capture/forms.ts)
and every stretch of sound is that exercise as the app plays it (render-abc.ts).
The form labels are the app's own plan for each piece (the Length popover's Form
list, saved beside each capture), placed at the bars abcjs drew them at.

    python3 build.py
"""

import json
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent
SRC = ROOT / "../uil-reel-src/stills"
SCORES = ROOT / "assets/scores"
AUDIO = ROOT / "assets/audio"

W, H = 1080, 1920
CARD = dict(left=40, top=650, w=1000, h=990)
HOOK = 3.0
V_LEN = 2.0
VOICINGS = [
    ("sa", "SA", "2 Part Treble", "#bdebd9", "#0f3b2c"),
    ("tb", "TB", "2 Part Tenor/Bass", "#c9e4ff", "#0e3563"),
    ("ssa", "SSA", "3 Part Treble", "#ffefa8", "#5c4a00"),
    ("sab", "SAB", "3 Part Mixed", "#ffd3bf", "#5a2310"),
    ("ttb", "TTB", "3 Part Tenor/Bass", "#bdebd9", "#0f3b2c"),
    ("satb", "SATB", "4 Part Mixed", "#2f6fe0", "#ffffff"),
]
TAP_START = HOOK + len(VOICINGS) * V_LEN  # 15
TAP_LEN = 3.2
PIECES = [
    # id, level, voicing, seconds on screen
    ("full-l2", 2, "2 Part Treble", 7.0),
    ("full-l5", 5, "4 Part Mixed", 8.5),
]
P_START = TAP_START + TAP_LEN
CLOSE_LEN = 3.6
TOTAL = P_START + sum(p[3] for p in PIECES) + CLOSE_LEN

KEY_NAME = {"Bb": "B♭", "Eb": "E♭", "Ab": "A♭", "F#": "F♯"}
SECTION_COLORS = {"A": "#c9e4ff", "B": "#ffd3bf", "C": "#ffefa8", "A'": "#bdebd9", "close": "#e4dcff", "coda": "#dce6f5"}


def key_of(name: str) -> str:
    abc = (SRC / f"{name}.abc").read_text()
    k = next(l[2:].strip() for l in abc.splitlines() if l.startswith("K:"))
    return KEY_NAME.get(k, k) + " major"


def size(name: str) -> tuple[int, int]:
    return Image.open(SCORES / f"{name}.png").size


def shown_height(name: str) -> float:
    w, h = size(name)
    return CARD["w"] * h / w


def form_of(name: str):
    """[(label, first bar, last bar, style)] from the app's Form list."""
    d = json.loads((SRC / f"{name}.json").read_text())
    out = []
    for line in d["form"]:
        label, _, rng, *style = line.replace("–", "-").split()
        a, b = rng.split("-")
        out.append((label, int(a), int(b), " ".join(style).split(" · ")[0]))
    return out, {n: y for n, y in d["nums"]}


WORDMARK_SVG = (ROOT / "../uil-reel/build.py").read_text().split('WORDMARK_SVG = (\n    \'')[1].split("'\n)")[0]


def build_html() -> str:
    body: list[str] = []
    imgs: list[str] = []
    js: list[str] = ['tl.set("#card", {opacity:0}, 0);']

    # Hook
    body.append(
        f'''<div class="scene clip" id="hook" data-start="0" data-duration="{HOOK}" data-track-index="0">
  <div class="hook-wrap">
    <div class="wordmark" id="hook-mark">{WORDMARK_SVG}<span class="rest">sightreading.com</span></div>
    <h1 class="hook-head"><span class="hl blue" id="h1">Every voicing.</span><span class="hl" id="h2">Full-length pieces,</span><span class="hl" id="h3">in real forms.</span></h1>
  </div>
</div>'''
    )
    js.append('tl.fromTo("#hook-mark", {opacity:0, y:20}, {opacity:1, y:0, duration:0.45, ease:"power3.out"}, 0.05);')
    js.append('tl.fromTo(["#h1","#h2","#h3"], {opacity:0, y:50}, {opacity:1, y:0, duration:0.55, ease:"back.out(1.6)", stagger:0.16}, 0.15);')
    js.append('tl.to("#hook .hook-wrap", {opacity:0, y:-40, duration:0.35, ease:"power2.in"}, %.2f);' % (HOOK - 0.35))

    # Voicings, one exercise each at UIL Level 3
    js.append(f'tl.fromTo("#card", {{opacity:0, y:120}}, {{opacity:1, y:0, duration:0.45, ease:"power3.out"}}, {HOOK - 0.2:.2f});')
    for i, (vid, short, long, bg, ink) in enumerate(VOICINGS):
        name = f"v-{vid}"
        t0 = HOOK + i * V_LEN
        imgs.append(f'<div class="ex" data-layout-allow-overflow id="ex-{name}"><img id="img-{name}" class="clip score" data-start="{t0:.2f}" data-duration="{V_LEN:.2f}" data-track-index="2" src="assets/scores/{name}.png" alt="" /></div>')
        h = shown_height(name)
        if h < CARD["h"]:
            js.append(f'tl.set("#ex-{name}", {{top:{(CARD["h"] - h) / 2:.0f}}}, 0);')
        else:
            js.append(f'tl.fromTo("#ex-{name}", {{y:0}}, {{y:{-(h - CARD["h"]):.0f}, duration:{V_LEN - 0.4:.2f}, ease:"power1.inOut"}}, {t0 + 0.3:.2f});')
        if i:
            js.append(f'tl.set("#ex-{name}", {{x:70, opacity:0}}, 0);')
            js.append(f'tl.to("#ex-{name}", {{x:0, opacity:1, duration:0.28, ease:"power3.out"}}, {t0:.2f});')
        body.append(
            f'''<div class="scene clip" id="vh-{vid}" data-start="{t0:.2f}" data-duration="{V_LEN:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="vchip-{vid}" style="background:{bg};color:{ink}">{short}</span>
    <div class="lvl-sub" id="vsub-{vid}"><span>{long}</span><span class="sep">·</span><span>{key_of(name)}</span></div>
  </div>
</div>'''
        )
        js.append(f'tl.fromTo("#vchip-{vid}", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.35, ease:"back.out(2)"}}, {t0:.2f});')
        js.append(f'tl.fromTo("#vsub-{vid}", {{opacity:0, y:16}}, {{opacity:1, y:0, duration:0.3, ease:"power3.out"}}, {t0 + 0.08:.2f});')
    js.append(f'tl.to("#card", {{opacity:0, y:60, duration:0.3, ease:"power2.in"}}, {TAP_START - 0.3:.2f});')
    js.append(f'tl.set("#card", {{y:0}}, {TAP_START + 0.05:.2f});')

    # The tap: Length > Full length piece, and the form appears
    s = CARD["w"] / 1150
    off_h, on_h = 256 * s, 772 * s
    panel_top = 700
    tap = TAP_START + 1.1
    body.append(
        f'''<div class="scene clip" id="tapscene" data-start="{TAP_START:.2f}" data-duration="{TAP_LEN:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="len-chip" style="background:#15213a;color:#ffffff">Full length</span>
    <div class="lvl-sub" id="len-sub"><span>One tap. The form comes with it.</span></div>
  </div>
  <div class="lenpanel" id="lenpanel" style="top:{panel_top}px;height:{off_h:.0f}px">
    <img id="len-off" class="lenimg" src="assets/scores/len-off.png" alt="" style="height:{off_h:.0f}px" />
    <img id="len-on" class="lenimg" src="assets/scores/len-on.png" alt="" style="height:{on_h:.0f}px" />
  </div>
  <div class="tap" id="tap" style="left:{40 + 877 * s:.0f}px;top:{panel_top + 178 * s:.0f}px;width:250px"></div>
</div>'''
    )
    js.append(f'tl.fromTo("#len-chip", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.4, ease:"back.out(2)"}}, {TAP_START:.2f});')
    js.append(f'tl.fromTo("#len-sub", {{opacity:0, y:16}}, {{opacity:1, y:0, duration:0.3, ease:"power3.out"}}, {TAP_START + 0.1:.2f});')
    js.append(f'tl.fromTo("#lenpanel", {{opacity:0, y:80}}, {{opacity:1, y:0, duration:0.4, ease:"power3.out"}}, {TAP_START + 0.15:.2f});')
    js.append('tl.set("#len-on", {opacity:0}, 0);')
    js.append(f'tl.fromTo("#tap", {{opacity:0, scale:1.5}}, {{opacity:1, scale:1, duration:0.25, ease:"power2.out"}}, {tap - 0.35:.2f});')
    js.append(f'tl.to("#tap", {{scale:0.85, duration:0.1, yoyo:true, repeat:1}}, {tap - 0.05:.2f});')
    js.append(f'tl.to("#tap", {{opacity:0, duration:0.2}}, {tap + 0.25:.2f});')
    js.append(f'tl.set("#len-off", {{opacity:0}}, {tap + 0.1:.2f});')
    js.append(f'tl.set("#len-on", {{opacity:1}}, {tap + 0.1:.2f});')
    js.append(f'tl.to("#lenpanel", {{height:{on_h:.0f}, duration:0.45, ease:"power3.out"}}, {tap + 0.1:.2f});')
    js.append(f'tl.to("#lenpanel", {{opacity:0, y:-60, duration:0.3, ease:"power2.in"}}, {TAP_START + TAP_LEN - 0.3:.2f});')

    # The two full pieces, scrolled through with their form
    t = P_START
    scale = CARD["w"] / size("full-l2")[0]
    for pid, level, voicing, dur in PIECES:
        form, bars = form_of(pid)
        n_bars = form[-1][2]
        h = shown_height(pid)
        max_off = h - CARD["h"]
        lead, scroll = 0.7, dur - 1.2
        imgs.append(f'<div class="ex" data-layout-allow-overflow id="ex-{pid}"><img id="img-{pid}" class="clip score" data-start="{t:.2f}" data-duration="{dur:.2f}" data-track-index="2" src="assets/scores/{pid}.png" alt="" /></div>')
        js.append(f'tl.fromTo("#ex-{pid}", {{y:0}}, {{y:{-max_off:.0f}, duration:{scroll:.2f}, ease:"none"}}, {t + lead:.2f});')
        js.append(f'tl.fromTo("#card", {{opacity:0, y:100}}, {{opacity:1, y:0, duration:0.4, ease:"power3.out"}}, {t:.2f});')
        js.append(f'tl.to("#card", {{opacity:0, y:60, duration:0.3, ease:"power2.in"}}, {t + dur - 0.3:.2f});')
        js.append(f'tl.set("#card", {{y:0}}, {t + dur + 0.02:.2f});')
        # When each section reaches the top third of the card
        switch = []
        for label, a, b, style in form:
            y = 0 if a == 1 else bars[a] * scale
            frac = min(1.0, max(0.0, (y - 300) / max_off))
            switch.append((label, a, b, style, t + lead + frac * scroll))
        pills = "".join(
            f'<span class="fpill" id="fp-{pid}-{i}" style="flex-grow:{b - a + 1}"><b>{label.replace(chr(39), "′")}</b></span>' for i, (label, a, b, style, _) in enumerate(switch)
        )
        badges = "".join(
            f'<div class="badge" id="bd-{pid}-{i}" data-layout-allow-overlap style="background:{SECTION_COLORS.get(label, "#dce6f5")}"><b>{label.replace(chr(39), "′")}</b><span>{style} · bars {a}-{b}</span></div>'
            for i, (label, a, b, style, _) in enumerate(switch)
        )
        body.append(
            f'''<div class="scene clip" id="ph-{pid}" data-start="{t:.2f}" data-duration="{dur:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="pchip-{pid}" style="background:#2f6fe0;color:#ffffff">UIL Level {level} · {n_bars} bars</span>
    <div class="lvl-sub" id="psub-{pid}"><span>{voicing}</span><span class="sep">·</span><span>{key_of(pid)}</span></div>
    <div class="ribbon" id="rb-{pid}">{pills}</div>
  </div>
  <div class="badges" style="top:{CARD["top"] - 44}px">{badges}</div>
</div>'''
        )
        js.append(f'tl.fromTo("#pchip-{pid}", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.4, ease:"back.out(2)"}}, {t:.2f});')
        js.append(f'tl.fromTo("#psub-{pid}", {{opacity:0, y:16}}, {{opacity:1, y:0, duration:0.3, ease:"power3.out"}}, {t + 0.08:.2f});')
        js.append(f'tl.fromTo("#rb-{pid}", {{opacity:0, y:16}}, {{opacity:1, y:0, duration:0.3, ease:"power3.out"}}, {t + 0.16:.2f});')
        for i, (label, a, b, style, at) in enumerate(switch):
            at = max(at, t + 0.3)
            end = switch[i + 1][4] if i + 1 < len(switch) else t + dur
            end = max(end, at + 0.3)
            color = SECTION_COLORS.get(label, "#dce6f5")
            js.append(f'tl.set("#fp-{pid}-{i}", {{backgroundColor:"#ffffff", color:"#56637f"}}, 0);')
            js.append(f'tl.to("#fp-{pid}-{i}", {{backgroundColor:"{color}", color:"#15213a", duration:0.2}}, {at:.2f});')
            js.append(f'tl.set("#bd-{pid}-{i}", {{opacity:0, x:-30}}, 0);')
            js.append(f'tl.to("#bd-{pid}-{i}", {{opacity:1, x:0, duration:0.25, ease:"power3.out"}}, {at:.2f});')
            if i + 1 < len(switch):
                js.append(f'tl.to("#bd-{pid}-{i}", {{opacity:0, x:30, duration:0.2, ease:"power2.in"}}, {end - 0.05:.2f});')
        t += dur

    # Close
    close = t
    body.append(
        f'''<div class="scene clip" id="close" data-start="{close:.2f}" data-duration="{TOTAL - close:.2f}" data-track-index="1">
  <div class="close-wrap">
    <div class="wordmark big" id="close-mark">{WORDMARK_SVG}<span class="rest">sightreading.com</span></div>
    <p class="close-line" id="close-line">SA to SATB.<span class="nl">8 bars to a whole piece.</span></p>
    <span class="cta" id="cta">Try it free</span>
  </div>
</div>'''
    )
    js.append(f'tl.fromTo("#close-mark", {{opacity:0, scale:0.85}}, {{opacity:1, scale:1, duration:0.5, ease:"back.out(1.7)"}}, {close + 0.05:.2f});')
    js.append(f'tl.fromTo("#close-line", {{opacity:0, y:30}}, {{opacity:1, y:0, duration:0.45, ease:"power3.out"}}, {close + 0.35:.2f});')
    js.append(f'tl.fromTo("#cta", {{opacity:0, y:30}}, {{opacity:1, y:0, duration:0.45, ease:"back.out(1.6)"}}, {close + 0.6:.2f});')

    card = f'<div class="card" id="card" style="left:{CARD["left"]}px;top:{CARD["top"]}px;width:{CARD["w"]}px;height:{CARD["h"]}px">{"".join(imgs)}</div>'
    blobs = [(-90, 90, 320, "#c9e4ff"), (800, 150, 380, "#ffd3bf"), (740, 1600, 360, "#bdebd9"), (-40, 1560, 280, "#ffefa8")]
    blob_html = "\n".join(f'<div class="blob" data-layout-ignore style="left:{x}px;top:{y}px;width:{s_}px;height:{s_}px;background:{c}"></div>' for x, y, s_, c in blobs)
    css = (ROOT / "style.css").read_text() + (ROOT / "extra.css").read_text()
    return f'''<!doctype html>
<html lang="en" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<!-- Written by build.py: edit the scene table there, not this file. -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
{css}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL:.2f}" data-width="{W}" data-height="{H}">
{blob_html}
{card}
{chr(10).join(body)}
<audio id="bed" data-start="0" data-duration="{TOTAL:.2f}" data-track-index="5" src="assets/audio/bed.wav"></audio>
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
'''


def build_audio() -> None:
    """Each stretch plays the music on screen from its first beat."""
    segs: list[tuple[str, float, float]] = [("v-satb", 0.0, HOOK)]
    for i, (vid, *_) in enumerate(VOICINGS):
        segs.append((f"v-{vid}", HOOK + i * V_LEN, V_LEN))
    # The Level 2 piece starts under the tap, so it is already going when it appears.
    t = P_START
    segs.append(("full-l2", TAP_START, P_START + PIECES[0][3] - TAP_START))
    t += PIECES[0][3]
    segs.append(("full-l5", t, TOTAL - t))
    inputs, filters = [], []
    for i, (name, at, dur) in enumerate(segs):
        inputs += ["-i", str(AUDIO / f"{name}.wav")]
        last = i == len(segs) - 1
        fade_out = f"afade=t=out:st={dur - 1.2:.3f}:d=1.2" if last else f"afade=t=out:st={dur - 0.08:.3f}:d=0.08"
        filters.append(f"[{i}:a]atrim=0:{dur:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,{fade_out},adelay={int(at * 1000)}|{int(at * 1000)}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(segs))) + f"amix=inputs={len(segs)}:normalize=0,atrim=0:{TOTAL:.3f}[out]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters + [mix]), "-map", "[out]", "-ar", "48000", str(AUDIO / "bed.wav")], check=True)


if __name__ == "__main__":
    (ROOT / "index.html").write_text(build_html())
    build_audio()
    print(json.dumps({"duration": TOTAL}))
