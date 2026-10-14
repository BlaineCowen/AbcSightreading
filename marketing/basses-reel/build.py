"""Writes index.html and assets/audio/bed.wav for "Don't let the basses hold back your sight-reading".

Solfège part by part (Display > Annotations > Under, commit adf66be): a Level 3
SATB exercise with syllables under every part, the three upper parts tapped
off in the app's own panel, and the same exercise with syllables under the
basses alone. Captures: ../uil-reel-src/capture/basses.ts. The sound is that
exercise as the app plays it.

    python3 build.py
"""

import json
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent
SCORES = ROOT / "assets/scores"
AUDIO = ROOT / "assets/audio"

W, H = 1080, 1920
CARD = dict(left=40, top=560, w=1000, h=1040)
HOOK = 3.4
PROBLEM = 4.0
TAPS = 4.6
PAYOFF = 7.0
CLOSE = 3.6
T_PROBLEM = HOOK
T_TAPS = T_PROBLEM + PROBLEM
T_PAYOFF = T_TAPS + TAPS
T_CLOSE = T_PAYOFF + PAYOFF
TOTAL = T_CLOSE + CLOSE

# The Under row's buttons in the panel crop (b-pan-*.png: the description line and the Under row, 1350 px wide).
BUTTONS = {"Soprano": (255, 143), "Alto": (502, 143), "Tenor": (723, 143)}
PAN_W = 1350
PAN_SHOWN = 920

WORDMARK_SVG = (ROOT / "../uil-reel/build.py").read_text().split('WORDMARK_SVG = (\n    \'')[1].split("'\n)")[0]


def shown_height(name: str) -> float:
    w, h = Image.open(SCORES / f"{name}.png").size
    return CARD["w"] * h / w


def build_html() -> str:
    body: list[str] = []
    js: list[str] = ['tl.set("#card", {opacity:0}, 0);']

    body.append(
        f'''<div class="scene clip" id="hook" data-start="0" data-duration="{HOOK}" data-track-index="0">
  <div class="hook-wrap">
    <div class="wordmark" id="hook-mark">{WORDMARK_SVG}<span class="rest">sightreading.com</span></div>
    <h1 class="hook-head"><span class="hl" id="h1">Don't let the</span><span class="hl blue" id="h2">basses</span><span class="hl" id="h3">hold back your</span><span class="hl" id="h4">sight-reading.</span></h1>
  </div>
</div>'''
    )
    js.append('tl.fromTo("#hook-mark", {opacity:0, y:20}, {opacity:1, y:0, duration:0.45, ease:"power3.out"}, 0.05);')
    js.append('tl.fromTo(["#h1","#h2","#h3","#h4"], {opacity:0, y:50}, {opacity:1, y:0, duration:0.55, ease:"back.out(1.6)", stagger:0.16}, 0.15);')
    js.append(f'tl.to("#hook .hook-wrap", {{opacity:0, y:-40, duration:0.35, ease:"power2.in"}}, {HOOK - 0.35:.2f});')

    # Problem: syllables under every part
    h_all = shown_height("b-all")
    imgs = [
        f'<div class="ex" data-layout-allow-overflow id="ex-all"><img id="img-all" class="clip score" data-start="{T_PROBLEM:.2f}" data-duration="{PROBLEM:.2f}" data-track-index="2" src="assets/scores/b-all.png" alt="" /></div>',
    ]
    js.append(f'tl.fromTo("#card", {{opacity:0, y:120}}, {{opacity:1, y:0, duration:0.45, ease:"power3.out"}}, {T_PROBLEM - 0.15:.2f});')
    js.append(f'tl.fromTo("#ex-all", {{y:0}}, {{y:{-min(h_all - CARD["h"], 1300):.0f}, duration:{PROBLEM - 0.9:.2f}, ease:"power1.inOut"}}, {T_PROBLEM + 0.5:.2f});')
    js.append(f'tl.to("#card", {{opacity:0, y:60, duration:0.3, ease:"power2.in"}}, {T_TAPS - 0.3:.2f});')
    body.append(
        f'''<div class="scene clip" id="problem" data-start="{T_PROBLEM:.2f}" data-duration="{PROBLEM:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="pr-chip" style="background:#ffd3bf;color:#5a2310">Solfège under everyone?</span>
    <div class="lvl-sub" id="pr-sub"><span>Then everyone reads the syllables.</span></div>
  </div>
</div>'''
    )
    js.append(f'tl.fromTo("#pr-chip", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.4, ease:"back.out(2)"}}, {T_PROBLEM:.2f});')
    js.append(f'tl.fromTo("#pr-sub", {{opacity:0, y:16}}, {{opacity:1, y:0, duration:0.3, ease:"power3.out"}}, {T_PROBLEM + 0.15:.2f});')

    # The taps: Soprano, Alto, Tenor off in the app's own Annotations panel
    s = PAN_SHOWN / PAN_W
    pan_h = 202 * s
    panel_top = 820
    pad = (1000 - PAN_SHOWN) / 2
    tap_times = [T_TAPS + 1.2, T_TAPS + 2.1, T_TAPS + 3.0]
    pans = []
    for i in range(4):
        start = T_TAPS if i == 0 else tap_times[i - 1] + 0.08
        end = tap_times[i] + 0.08 if i < 3 else T_PAYOFF
        pans.append(f'<img id="pan-{i}" class="clip panimg" data-start="{start:.2f}" data-duration="{end - start:.2f}" data-track-index="3" src="assets/scores/b-pan-{i}.png" alt="" style="left:{pad:.0f}px;top:{pad:.0f}px;width:{PAN_SHOWN}px" />')
    body.append(
        f'''<div class="scene clip" id="taps" data-start="{T_TAPS:.2f}" data-duration="{TAPS:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="tp-chip" style="background:#15213a;color:#ffffff">Now: part by part</span>
    <div class="lvl-sub" id="tp-sub"><span>Display · Annotations · Under</span></div>
  </div>
  <div class="bpanel" id="bpanel" style="top:{panel_top}px;height:{pan_h + 2 * pad:.0f}px">{"".join(pans)}</div>
  <div class="tap" id="tap" data-layout-allow-overlap style="left:0px;top:{panel_top + pad + 143 * s:.0f}px"></div>
</div>'''
    )
    js.append(f'tl.fromTo("#tp-chip", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.4, ease:"back.out(2)"}}, {T_TAPS:.2f});')
    js.append(f'tl.fromTo("#tp-sub", {{opacity:0, y:16}}, {{opacity:1, y:0, duration:0.3, ease:"power3.out"}}, {T_TAPS + 0.12:.2f});')
    js.append(f'tl.fromTo("#bpanel", {{opacity:0, y:80}}, {{opacity:1, y:0, duration:0.4, ease:"power3.out"}}, {T_TAPS + 0.15:.2f});')
    js.append('tl.set("#tap", {opacity:0, scale:1}, 0);')
    for (name, (bx, _), at) in zip(BUTTONS, BUTTONS.values(), tap_times):
        x = CARD["left"] + pad + bx * s
        js.append(f'tl.set("#tap", {{x:{x:.0f}}}, {at - 0.4:.2f});')
        js.append(f'tl.fromTo("#tap", {{opacity:0, scale:1.4}}, {{opacity:1, scale:1, duration:0.22, ease:"power2.out"}}, {at - 0.35:.2f});')
        js.append(f'tl.to("#tap", {{scale:0.85, duration:0.08, yoyo:true, repeat:1}}, {at - 0.04:.2f});')
        js.append(f'tl.to("#tap", {{opacity:0, duration:0.15}}, {at + 0.25:.2f});')
    js.append(f'tl.to("#bpanel", {{opacity:0, y:-60, duration:0.3, ease:"power2.in"}}, {T_PAYOFF - 0.3:.2f});')

    # Payoff: the basses alone carry syllables
    h_b = shown_height("b-bass")
    imgs.append(f'<div class="ex" data-layout-allow-overflow id="ex-bass"><img id="img-bass" class="clip score" data-start="{T_PAYOFF:.2f}" data-duration="{PAYOFF:.2f}" data-track-index="2" src="assets/scores/b-bass.png" alt="" /></div>')
    js.append(f'tl.fromTo("#card", {{opacity:0, y:100}}, {{opacity:1, y:0, duration:0.45, ease:"power3.out"}}, {T_PAYOFF:.2f});')
    js.append(f'tl.fromTo("#ex-bass", {{y:0}}, {{y:{-(h_b - CARD["h"]):.0f}, duration:{PAYOFF - 1.6:.2f}, ease:"power1.inOut"}}, {T_PAYOFF + 0.9:.2f});')
    js.append(f'tl.to("#card", {{opacity:0, y:60, duration:0.3, ease:"power2.in"}}, {T_CLOSE - 0.3:.2f});')
    body.append(
        f'''<div class="scene clip" id="payoff" data-start="{T_PAYOFF:.2f}" data-duration="{PAYOFF:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="po-chip" style="background:#2f6fe0;color:#ffffff">Solfège for the basses</span>
    <div class="lvl-sub" id="po-sub"><span>Notes for everyone else.</span></div>
  </div>
</div>'''
    )
    js.append(f'tl.fromTo("#po-chip", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.4, ease:"back.out(2)"}}, {T_PAYOFF:.2f});')
    js.append(f'tl.fromTo("#po-sub", {{opacity:0, y:16}}, {{opacity:1, y:0, duration:0.3, ease:"power3.out"}}, {T_PAYOFF + 0.15:.2f});')

    body.append(
        f'''<div class="scene clip" id="close" data-start="{T_CLOSE:.2f}" data-duration="{CLOSE:.2f}" data-track-index="1">
  <div class="close-wrap">
    <div class="wordmark big" id="close-mark">{WORDMARK_SVG}<span class="rest">sightreading.com</span></div>
    <p class="close-line" id="close-line">Solfège,<span class="nl">part by part.</span></p>
    <span class="cta" id="cta">Try it free</span>
  </div>
</div>'''
    )
    js.append(f'tl.fromTo("#close-mark", {{opacity:0, scale:0.85}}, {{opacity:1, scale:1, duration:0.5, ease:"back.out(1.7)"}}, {T_CLOSE + 0.05:.2f});')
    js.append(f'tl.fromTo("#close-line", {{opacity:0, y:30}}, {{opacity:1, y:0, duration:0.45, ease:"power3.out"}}, {T_CLOSE + 0.35:.2f});')
    js.append(f'tl.fromTo("#cta", {{opacity:0, y:30}}, {{opacity:1, y:0, duration:0.45, ease:"back.out(1.6)"}}, {T_CLOSE + 0.6:.2f});')

    card = f'<div class="card" id="card" style="left:{CARD["left"]}px;top:{CARD["top"]}px;width:{CARD["w"]}px;height:{CARD["h"]}px">{"".join(imgs)}</div>'
    blobs = [(-90, 90, 320, "#c9e4ff"), (800, 150, 380, "#ffd3bf"), (740, 1600, 360, "#bdebd9"), (-40, 1560, 280, "#ffefa8")]
    blob_html = "\n".join(f'<div class="blob" data-layout-ignore style="left:{x}px;top:{y}px;width:{d}px;height:{d}px;background:{c}"></div>' for x, y, d, c in blobs)
    css = (ROOT / "style.css").read_text() + (ROOT / "extra.css").read_text()
    return f'''<!doctype html>
<html lang="en" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<!-- Written by build.py: edit it, not this file. -->
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
    """The exercise on screen, from its first beat, under the whole film."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(AUDIO / "b.wav"), "-af",
         f"atrim=0:{TOTAL:.3f},afade=t=in:d=0.05,afade=t=out:st={TOTAL - 1.4:.3f}:d=1.4", "-ar", "48000", str(AUDIO / "bed.wav")],
        check=True,
    )


if __name__ == "__main__":
    (ROOT / "index.html").write_text(build_html())
    build_audio()
    print(json.dumps({"duration": TOTAL}))
