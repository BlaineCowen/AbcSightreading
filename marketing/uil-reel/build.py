"""Writes index.html and assets/audio/bed.wav for the UIL Levels 1-5 Reel.

The scores are real exercises from the Choral page at each UIL level, and the
sound is each exercise as the app plays it (render-abc.ts), so what is heard is
what is on screen. Captures: ../uil-reel-src/capture/stills.ts.

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
CARD = dict(left=40, top=540, w=1000, h=1040)
HOOK = 3.0
LEVEL_LEN = 4.0
SOL_START = HOOK + 5 * LEVEL_LEN  # 23
SOL_LEN = 8.0
CLOSE_START = SOL_START + SOL_LEN  # 31
TOTAL = CLOSE_START + 4.0  # 35

LEVELS = [
    (1, "2 Part Treble", "#bdebd9", "#0f3b2c"),
    (2, "3 Part Treble", "#c9e4ff", "#0e3563"),
    (3, "4 Part Mixed", "#ffefa8", "#5c4a00"),
    (4, "3 Part Mixed", "#ffd3bf", "#5a2310"),
    (5, "4 Part Mixed", "#2f6fe0", "#ffffff"),
]

KEY_NAME = {"Bb": "B♭", "Eb": "E♭", "Ab": "A♭", "F#": "F♯"}


def key_of(name: str) -> str:
    abc = (ROOT / "../uil-reel-src/stills" / f"{name}.abc").read_text()
    k = next(l[2:].strip() for l in abc.splitlines() if l.startswith("K:"))
    return KEY_NAME.get(k, k) + " major"


def shown_height(name: str) -> float:
    w, h = Image.open(SCORES / f"{name}.png").size
    return CARD["w"] * h / w


WORDMARK_SVG = (
    '<svg class="abc" viewBox="0 -736 1780 750" fill="currentColor" aria-hidden="true"><path d="M440 -463 426 -416C402 -457 360 -477 301 -477C153 -477 15 -327 15 -166C15 -60 87 14 188 14C257 14 304 -11 351 -73C351 -51 351 -49 354 -41C363 -8 396 14 436 14C527 14 604 -85 646 -157L607 -181C570 -124 520 -70 503 -70C496 -70 489 -78 489 -86C489 -93 489 -94 499 -131L597 -463ZM334 -422C370 -422 395 -393 395 -350C395 -275 336 -56 239 -56C201 -56 178 -86 178 -135C178 -214 232 -422 334 -422ZM1018 -736 751 -722 744 -675H768C818 -675 830 -669 830 -644C830 -633 827 -623 814 -577L717 -251C696 -180 695 -177 695 -145C695 -49 776 14 899 14C981 14 1053 -14 1113 -70C1182 -133 1224 -223 1224 -306C1224 -404 1151 -478 1055 -478C1007 -478 973 -464 927 -426ZM997 -407C1034 -407 1061 -375 1061 -333C1061 -258 1000 -29 904 -29C865 -29 838 -60 838 -105C838 -155 864 -252 895 -315C925 -378 958 -407 997 -407ZM1684 -146C1625 -78 1577 -47 1528 -47C1480 -47 1446 -86 1446 -141C1446 -227 1497 -431 1609 -431C1634 -431 1651 -421 1651 -406C1651 -399 1648 -395 1639 -390C1611 -372 1601 -357 1601 -328C1601 -285 1633 -256 1679 -256C1731 -256 1765 -293 1765 -349C1765 -427 1698 -478 1594 -478C1424 -478 1281 -338 1281 -171C1281 -58 1362 14 1488 14C1576 14 1647 -26 1720 -116Z"/></svg>'
)


def build_html() -> str:
    body: list[str] = []
    js: list[str] = []

    js.append('tl.set("#newex", {scale:1}, 0);')
    js.append('tl.set("#newex-ring", {opacity:0, scale:0.6}, 0);')
    # Hook
    body.append(
        f'''<div class="scene clip" id="hook" data-start="0" data-duration="{HOOK}" data-track-index="0">
  <div class="hook-wrap">
    <div class="wordmark" id="hook-mark">{WORDMARK_SVG}<span class="rest">sightreading.com</span></div>
    <h1 class="hook-head"><span class="hl" id="h1">Never run out of</span><span class="hl blue" id="h2">UIL choir</span><span class="hl" id="h3">sight-reading music.</span></h1>
  </div>
</div>'''
    )
    js.append('tl.fromTo("#hook-mark", {opacity:0, y:20}, {opacity:1, y:0, duration:0.45, ease:"power3.out"}, 0.05);')
    js.append('tl.fromTo(["#h1","#h2","#h3"], {opacity:0, y:50}, {opacity:1, y:0, duration:0.55, ease:"back.out(1.6)", stagger:0.16}, 0.15);')
    js.append('tl.to("#hook .hook-wrap", {opacity:0, y:-40, duration:0.35, ease:"power2.in"}, %.2f);' % (HOOK - 0.35))

    # The card the scores sit on, from the first level to the end of the solfège scene
    card_start, card_len = HOOK, SOL_START + SOL_LEN - HOOK
    imgs: list[str] = []
    for lv, voicing, bg, ink in LEVELS:
        t0 = HOOK + (lv - 1) * LEVEL_LEN
        for n in (1, 2):
            name = f"l{lv}-{n}"
            s = t0 + (n - 1) * LEVEL_LEN / 2
            d = LEVEL_LEN / 2
            imgs.append(
                f'<div class="ex" data-layout-allow-overflow id="ex-{name}"><img id="img-{name}" class="clip score" data-start="{s:.2f}" data-duration="{d:.2f}" data-track-index="2" src="assets/scores/{name}.png" alt="" /></div>'
            )
            pan = max(0.0, shown_height(name) - CARD["h"])
            if pan == 0:
                js.append(f'tl.set("#ex-{name}", {{top:{(CARD["h"] - shown_height(name)) / 2:.0f}}}, 0);')
            if n == 2:
                js.append(f'tl.set("#ex-{name}", {{y:0, x:60, opacity:0}}, 0);')
                js.append(f'tl.to("#ex-{name}", {{opacity:1, x:0, duration:0.3, ease:"power3.out"}}, {s:.2f});')
                js.append(f'tl.to("#ex-{name}", {{y:{-pan:.0f}, duration:{d - 0.25:.2f}, ease:"power1.inOut"}}, {s + 0.2:.2f});')
            else:
                js.append(f'tl.fromTo("#ex-{name}", {{y:0}}, {{y:{-pan:.0f}, duration:{d - 0.25:.2f}, ease:"power1.inOut"}}, {s + 0.2:.2f});')
        # Level header
        body.append(
            f'''<div class="scene clip lvl" id="lvl{lv}" data-start="{t0:.2f}" data-duration="{LEVEL_LEN:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="chip{lv}" style="background:{bg};color:{ink}">UIL Level {lv}</span>
    <div class="dots">{"".join(f'<span class="dot{" on" if i <= lv else ""}"></span>' for i in range(1, 6))}</div>
    <div class="lvl-sub"><span>{voicing}</span><span class="sep">·</span><span class="keys"><span class="k" data-layout-allow-overlap id="k{lv}a">{key_of(f"l{lv}-1")}</span><span class="k" data-layout-allow-overlap id="k{lv}b">{key_of(f"l{lv}-2")}</span></span></div>
  </div>
</div>'''
        )
        js.append(f'tl.fromTo("#chip{lv}", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.4, ease:"back.out(2)"}}, {t0:.2f});')
        js.append(f'tl.fromTo("#lvl{lv} .lvl-sub", {{opacity:0, y:20}}, {{opacity:1, y:0, duration:0.35, ease:"power3.out"}}, {t0 + 0.1:.2f});')
        js.append(f'tl.fromTo("#k{lv}b", {{opacity:0}}, {{opacity:1, duration:0.2}}, {t0 + LEVEL_LEN / 2:.2f});')
        js.append(f'tl.fromTo("#k{lv}a", {{opacity:1}}, {{opacity:0, duration:0.2}}, {t0 + LEVEL_LEN / 2:.2f});')
        # "New exercise" pressed between the two
        js.append(f'tl.to("#newex", {{scale:0.88, duration:0.12, yoyo:true, repeat:1, ease:"power2.out"}}, {t0 + LEVEL_LEN / 2 - 0.25:.2f});')
        js.append(f'tl.set("#newex-ring", {{opacity:0.9, scale:0.6}}, {t0 + LEVEL_LEN / 2 - 0.25:.2f});')
        js.append(f'tl.to("#newex-ring", {{opacity:0, scale:1.6, duration:0.5, ease:"power2.out"}}, {t0 + LEVEL_LEN / 2 - 0.24:.2f});')

    # Solfège scene: the same exercise, off, on, off
    s0 = SOL_START
    tap1, tap2 = s0 + 1.7, s0 + 5.9
    sol_on_pan = shown_height("sol-on") - CARD["h"]
    imgs.append(f'<div class="ex" data-layout-allow-overflow id="ex-sol-off1"><img id="img-sol-off1" class="clip score" data-start="{s0:.2f}" data-duration="{tap1 - s0:.2f}" data-track-index="2" src="assets/scores/sol-off.png" alt="" /></div>')
    imgs.append(f'<div class="ex" data-layout-allow-overflow id="ex-sol-on"><img id="img-sol-on" class="clip score" data-start="{tap1:.2f}" data-duration="{tap2 - tap1:.2f}" data-track-index="2" src="assets/scores/sol-on.png" alt="" /></div>')
    imgs.append(f'<div class="ex" data-layout-allow-overflow id="ex-sol-off2"><img id="img-sol-off2" class="clip score" data-start="{tap2:.2f}" data-duration="{s0 + SOL_LEN - tap2:.2f}" data-track-index="2" src="assets/scores/sol-off.png" alt="" /></div>')
    js.append(f'tl.fromTo("#ex-sol-on", {{y:0}}, {{y:{-min(sol_on_pan, 1500):.0f}, duration:3.0, ease:"power1.inOut"}}, {tap1 + 0.9:.2f});')

    body.append(
        f'''<div class="scene clip" id="sol" data-start="{s0:.2f}" data-duration="{SOL_LEN:.2f}" data-track-index="1">
  <div class="lvl-top">
    <span class="lvl-chip" id="sol-chip" style="background:#15213a;color:#ffffff">Solfège</span>
    <div class="lvl-sub" id="sol-sub"><span id="sol-state-a" data-layout-allow-overlap>One tap: on</span><span id="sol-state-b" data-layout-allow-overlap>One tap: off</span></div>
  </div>
</div>'''
    )
    js.append(f'tl.fromTo("#sol-chip", {{opacity:0, scale:0.7}}, {{opacity:1, scale:1, duration:0.4, ease:"back.out(2)"}}, {s0:.2f});')
    js.append(f'tl.fromTo("#sol-sub", {{opacity:0, y:20}}, {{opacity:1, y:0, duration:0.35, ease:"power3.out"}}, {s0 + 0.1:.2f});')
    js.append(f'tl.fromTo("#sol-state-b", {{opacity:0}}, {{opacity:1, duration:0.2}}, {tap2 - 1.0:.2f});')
    js.append(f'tl.fromTo("#sol-state-a", {{opacity:1}}, {{opacity:0, duration:0.2}}, {tap2 - 1.0:.2f});')

    # The Display sheet's Annotations row (the app's own, captured), up for each tap
    panel_top = 1290
    scale = CARD["w"] / 1800
    tap_x = CARD["left"] + 1104 * scale
    tap_y = panel_top + 150 * scale
    body.append(
        f'''<div class="panel" id="panel" style="top:{panel_top}px">
  <img id="annot-off1" class="clip panel-img" data-start="{s0:.2f}" data-duration="{tap1 + 0.05 - s0:.2f}" data-track-index="3" src="assets/scores/display-pop-annot.png" alt="" />
  <img id="annot-on" class="clip panel-img" data-start="{tap1 + 0.05:.2f}" data-duration="{tap2 + 0.05 - tap1 - 0.05:.2f}" data-track-index="3" src="assets/scores/display-pop-on-annot.png" alt="" />
  <img id="annot-off2" class="clip panel-img" data-start="{tap2 + 0.05:.2f}" data-duration="{s0 + SOL_LEN - tap2 - 0.05:.2f}" data-track-index="3" src="assets/scores/display-pop-annot.png" alt="" />
</div>
<div class="tap" id="tap" style="left:{tap_x:.0f}px;top:{tap_y:.0f}px"></div>'''
    )
    off_y = H - panel_top + 40
    js.append(f'tl.set("#panel", {{y:{off_y}}}, 0);')
    js.append(f'tl.set("#tap", {{opacity:0}}, 0);')
    for tap in (tap1, tap2):
        js.append(f'tl.to("#panel", {{y:0, duration:0.45, ease:"power3.out"}}, {tap - 0.75:.2f});')
        js.append(f'tl.fromTo("#tap", {{opacity:0, scale:1.5}}, {{opacity:1, scale:1, duration:0.25, ease:"power2.out"}}, {tap - 0.3:.2f});')
        js.append(f'tl.to("#tap", {{scale:0.8, duration:0.1, yoyo:true, repeat:1}}, {tap - 0.05:.2f});')
        js.append(f'tl.to("#tap", {{opacity:0, duration:0.25}}, {tap + 0.3:.2f});')
        js.append(f'tl.to("#panel", {{y:{off_y}, duration:0.45, ease:"power3.in"}}, {tap + 0.55:.2f});')

    # Close
    body.append(
        f'''<div class="scene clip" id="close" data-start="{CLOSE_START:.2f}" data-duration="{TOTAL - CLOSE_START:.2f}" data-track-index="1">
  <div class="close-wrap">
    <div class="wordmark big" id="close-mark">{WORDMARK_SVG}<span class="rest">sightreading.com</span></div>
    <p class="close-line" id="close-line">Written to UIL's criteria,<span class="nl">Level 1 to Level 5.</span></p>
    <span class="cta" id="cta">Try it free</span>
  </div>
</div>'''
    )
    js.append(f'tl.fromTo("#close-mark", {{opacity:0, scale:0.85}}, {{opacity:1, scale:1, duration:0.5, ease:"back.out(1.7)"}}, {CLOSE_START + 0.05:.2f});')
    js.append(f'tl.fromTo("#close-line", {{opacity:0, y:30}}, {{opacity:1, y:0, duration:0.45, ease:"power3.out"}}, {CLOSE_START + 0.35:.2f});')
    js.append(f'tl.fromTo("#cta", {{opacity:0, y:30}}, {{opacity:1, y:0, duration:0.45, ease:"back.out(1.6)"}}, {CLOSE_START + 0.6:.2f});')

    # Card in at the first level, out at the close
    js.append(f'tl.fromTo("#card", {{opacity:0, y:120}}, {{opacity:1, y:0, duration:0.5, ease:"power3.out"}}, {card_start - 0.2:.2f});')
    js.append(f'tl.to("#card", {{opacity:0, y:80, duration:0.35, ease:"power2.in"}}, {card_start + card_len - 0.3:.2f});')

    card = (
        f'''<div class="card" id="card" style="left:{CARD["left"]}px;top:{CARD["top"]}px;width:{CARD["w"]}px;height:{CARD["h"]}px">
  {"".join(imgs)}
</div>
<div class="newex clip" id="newex-host" data-start="{HOOK:.2f}" data-duration="{5 * LEVEL_LEN:.2f}" data-track-index="4" style="top:{CARD["top"] - 40}px"><span class="ring" id="newex-ring"></span><span class="newex-btn" id="newex">↻ New exercise</span></div>'''
    )

    blobs = [(-90, 90, 320, "#c9e4ff"), (800, 150, 380, "#ffd3bf"), (740, 1600, 360, "#bdebd9"), (-40, 1560, 280, "#ffefa8")]
    blob_html = "\n".join(
        f'<div class="blob" data-layout-ignore style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;background:{c}"></div>' for x, y, s, c in blobs
    )

    css = (ROOT / "style.css").read_text()
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
    """One bed: each stretch of the film plays the exercise on screen, from its first beat."""
    segs: list[tuple[str, float, float]] = [("l5-1", 0.0, HOOK)]
    for lv, *_ in LEVELS:
        t0 = HOOK + (lv - 1) * LEVEL_LEN
        segs += [(f"l{lv}-1", t0, LEVEL_LEN / 2), (f"l{lv}-2", t0 + LEVEL_LEN / 2, LEVEL_LEN / 2)]
    segs.append(("sol", SOL_START, TOTAL - SOL_START))
    inputs, filters = [], []
    for i, (name, at, dur) in enumerate(segs):
        inputs += ["-i", str(AUDIO / f"{name}.wav")]
        last = i == len(segs) - 1
        fade_out = f"afade=t=out:st={dur - 1.2:.3f}:d=1.2" if last else f"afade=t=out:st={dur - 0.08:.3f}:d=0.08"
        filters.append(
            f"[{i}:a]atrim=0:{dur:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,{fade_out},adelay={int(at * 1000)}|{int(at * 1000)}[a{i}]"
        )
    mix = "".join(f"[a{i}]" for i in range(len(segs))) + f"amix=inputs={len(segs)}:normalize=0,atrim=0:{TOTAL:.3f}[out]"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters + [mix]), "-map", "[out]", "-ar", "48000", str(AUDIO / "bed.wav")],
        check=True,
    )


if __name__ == "__main__":
    (ROOT / "index.html").write_text(build_html())
    build_audio()
    print(json.dumps({"duration": TOTAL}))
