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
WORDS = json.load(open("assets/vo/words.json"))
LEN = [x["len"] for x in WORDS]

# Each voice line's start (seconds): the read's long breaths closed up to a
# beat. GAP[i] is the pause after line i+1: a full beat after line 1 for the
# snap into colour, room after line 4 for the trap groove to land, about
# half a second elsewhere (take 4, 7 October 2026).
# The opening (7 October): "Sight reading music doesn't have to sound like
# this" over the still score, then the cat at the piano for CAT_DUR with its
# own sound, then the snap into colour and the ad.
CAT_DUR = 3.0
# After line 4 the trap groove plays on its own a couple of seconds; after
# line 6 the tempo keeps stepping up; after line 8 the export turns into a file.
GAP = [None, 0.45, 0.5, 2.2, 0.55, 1.1, 0.6, 1.4, 0.75]
VO = [0.3]
CAT_AT = round(VO[0] + WORDS[0]["words"][-1]["e"] + 0.12, 3)
_snap = CAT_AT + CAT_DUR
VO.append(round(_snap + 0.35, 3))
for _i, _g in enumerate(GAP[1:], start=1):
    VO.append(round(VO[-1] + LEN[_i] + _g, 3))
# The end card holds 4 s past the last word, long enough to read the free month under the address.
END = round(VO[-1] + LEN[-1] + 4.0, 2)
def word_at(line, w):
    """The timeline time where line `line` (1-based) says word w (its index)."""
    return VO[line - 1] + WORDS[line - 1]["words"][w]["t"]
# A word's index in its line, found by how it starts.
def word_index(line, starts):
    return next(i for i, w in enumerate(WORDS[line - 1]["words"]) if w["w"].lower().startswith(starts))

# The bed: calm soft's beat grid (0.495 + k * 0.6036 s in the file); its first
# grid beat lands on the snap into colour.
BEAT = 0.6036
SNAP = round(VO[1] - 0.35, 3)
BED_AT = lambda t: t - SNAP + 0.495   # file seconds at timeline t

# Line 4: rock (in Counting) until "trap", then trap on its own (Blaine,
# 7 October: no quick switches through soul and cumbia).
CUT_TRAP = word_at(4, word_index(4, "trap")) - 0.12
# Line 7: each label as it is named: Counting, Kodály, your own; movable do,
# fixed do, note names.
# Found by the words themselves, so Blaine's read and the ElevenLabs one (VOICE=ai
# in vo.py, which says "ta's and ti's" for Kodaly) both cut on them.
LABEL_CUTS = [("syll-count", 0), ("syll-kod", 1), ("syll-mine", word_index(7, "your")), ("solf-movable", word_index(7, "movable")),
              ("solf-fixed", word_index(7, "fixed")), ("solf-names", word_index(7, "note"))]
# Line 8: the board (full screen) until "export".
CUT_EXPORT = word_at(8, word_index(8, "export")) - 0.15

# Scenes: (id, start). Each runs to the next one's start.
# Each scene cuts in a little before its line.
SCENES = [
    ("plain", 0.0), ("cat", CAT_AT), ("open", SNAP), ("ball", VO[2] - 0.2), ("rock", VO[3] - 0.2),
    ("trap", CUT_TRAP), ("band", VO[4] - 0.25), ("tempo", VO[5] - 0.3),
    *[(sid, (VO[6] - 0.25) if w == 0 else word_at(7, w) - 0.12) for sid, w in LABEL_CUTS],
    ("board", VO[7] - 0.25), ("export", CUT_EXPORT), ("finish", VO[8] - 0.25), ("close", VO[9] - 0.3),
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
    "Sight reading music doesn't have to sound like this.",
    "abcSightReading turns any exercise into a play-along video.",
    "A real groove, a bouncing ball, and the next bar always waiting below.",
    "Clap the rhythm over rock, soul, cumbia, or even trap.",
    "Or sing it: your melody in your key, with a band behind you.",
    "Slow it down or speed it up.",
    ("Counting, ta's and ti's, or your own syllables. Movable do, fixed do, or note names."
     if WORDS[6]["words"][1]["w"].lower().startswith("ta") else
     "Counting, Kodály, or your own syllables. Movable do, fixed do, or note names."),
    "Put it on the board for the whole class, or export it and share it.",
    "Sight reading music can actually sound like music.",
    "abcSightReading. Practice real music.",
]
# Kicker pills, by scene.
PILLS = {
    "open": ("Play-along videos", "#ffd3bf", "#5a2310"),
    "rock": ("Rock · Counting", "#c9e4ff", "#0e3563"), "trap": ("Trap", "#ffefa8", "#5c4a00"),
    "band": ("Drums · bass · guitar", "#bdebd9", "#0f3b2c"),
    "tempo": ("Half speed to 150%", "#c9e4ff", "#0e3563"),
    "syll-count": ("Counting", "#ffefa8", "#5c4a00"), "syll-kod": ("Kodály", "#bdebd9", "#0f3b2c"),
    "syll-mine": ("Your own syllables", "#ffd3bf", "#5a2310"), "solf-movable": ("Movable do", "#c9e4ff", "#0e3563"),
    "solf-fixed": ("Fixed do", "#ffefa8", "#5c4a00"), "solf-names": ("Note names", "#bdebd9", "#0f3b2c"),
    "board": ("Full screen for the class", "#c9e4ff", "#0e3563"), "export": ("Export a video", "#bdebd9", "#0f3b2c"),
}

ABC_PATH = open("../ad/build.py").read().split('ABC_PATH = "')[1].split('"')[0]
ABC_SVG = f'<svg class="abc" viewBox="0 -736 1780 750" fill="currentColor" aria-hidden="true"><path d="{ABC_PATH}"/></svg>'


# The end card's staff: four notes, do mi so do, that the ball hops across.
NOTE_X = [150, 300, 450, 600]
NOTE_Y = [100, 80, 60, 30]   # notehead centres (the staff runs 40-120, a step is 10)
STAFF_SVG = (
    '<svg class="end-staff" viewBox="0 -60 760 200" aria-hidden="true">'
    + "".join(f'<line x1="40" x2="720" y1="{40 + 20 * k}" y2="{40 + 20 * k}" stroke="#c4cddb" stroke-width="4"/>' for k in range(5))
    + "".join(
        f'<g id="end-n{i}" class="end-note"><ellipse cx="{x}" cy="{y}" rx="16" ry="12" transform="rotate(-20 {x} {y})"/>'
        f'<line x1="{x + 14}" x2="{x + 14}" y1="{y - 4}" y2="{y - 66}" stroke-width="5"/></g>'
        for i, (x, y) in enumerate(zip(NOTE_X, NOTE_Y)))
    + '<circle id="end-ball" cx="0" cy="0" r="13" fill="#2f6fe0"/></svg>'
)


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
    # The cat at the piano, its own sound (quiet as recorded: -30 LUFS), up to sit with the voice.
    cat = inp("assets/footage/cat.mp4")
    parts.append(f"[{cat}:a]atrim=end={CAT_DUR:.3f},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,volume=12dB,"
                 f"afade=t=out:st={CAT_DUR - 0.15:.3f}:d=0.15,adelay={int(CAT_AT * 1000)}|{int(CAT_AT * 1000)}[cat]")
    clicks = []
    # The bed: in on the snap (to the montage), back after the band, out at the end.
    bed = inp("assets/music/calm-soft.mp3")
    def bed_piece(name, a, b, fin, fout):
        parts.append(
            f"[{bed}:a]atrim=start={BED_AT(a):.3f}:end={BED_AT(b):.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={fin},afade=t=out:st={b - a - fout:.3f}:d={fout},volume=0.32,adelay={int(a * 1000)}|{int(a * 1000)}[{name}]")
    bed_piece("bed1", SNAP, span("rock")[0] + 0.15, 0.02, 0.35)
    bed_piece("bed2", span("tempo")[0] - 0.15, END, 0.6, 2.2)
    # The grooves and the band: each video's own audio at the moment it shows.
    def clip_audio(name, sid, file, fin=0.04, fout=0.08, vol=0.55):
        a, b = span(sid)
        m = FOOT[sid]["media"]
        k = inp(f"assets/footage/{file}.mp4")
        parts.append(
            f"[{k}:a]atrim=start={m:.3f}:end={m + (b - a) + fout:.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={fin},afade=t=out:st={b - a:.3f}:d={fout},volume={vol},adelay={int(a * 1000)}|{int(a * 1000)}[{name}]")
    clip_audio("g1", "rock", "rock-count")
    clip_audio("g4", "trap", "trap", fout=0.35)
    clip_audio("g5", "band", "pitched", fin=0.1, fout=0.5, vol=0.5)
    # The finish: the last bar's crash and the card, on "well, music".
    clip_audio("g6", "finish", "rock", fin=0.3, fout=0.8, vol=0.5)
    # The voice.
    for i in range(10):
        k = inp(f"assets/vo/v-line{i + 1:02d}.wav")
        # The voice sat too far forward (Blaine, 7 October): 3 dB down against the music.
        parts.append(f"[{k}:a]adelay={int(VO[i] * 1000)}|{int(VO[i] * 1000)},volume=0.7[v{i}]")
    labels = ["[cat]", "[bed1]", "[bed2]", "[g1]", "[g4]", "[g5]", "[g6]"] + [f"[v{i}]" for i in range(10)]
    # Music ducks a little under the voice (sidechain), then the whole is levelled, and the
    # whole brought down 9 dB, as Blaine set the track in the Studio (7 October).
    music_labels = labels[: len(labels) - 10]
    voice_labels = labels[len(labels) - 10:]
    parts.append(f"{''.join(music_labels)}amix=inputs={len(music_labels)}:normalize=0[music]")
    # Padded to the end: the ducker stops when its key does, and the music rings on under the logo.
    parts.append(f"{''.join(voice_labels)}amix=inputs=10:normalize=0,apad=whole_dur={END},asplit=2[voice][key]")
    parts.append("[music][key]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=300[ducked]")
    parts.append(f"[ducked][voice]amix=inputs=2:normalize=0,atrim=end={END},loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:level=disabled,volume=-9dB[out]")
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


CLIP_FILES = {"open": "rock", "ball": "rock", "rock": "rock-count", "trap": "trap", "band": "pitched", "tempo": "tempo",
              "syll-count": "labels-rhythm-count", "syll-kod": "labels-rhythm-kod", "syll-mine": "labels-rhythm-mine",
              "solf-movable": "labels-pitched-movable", "solf-fixed": "labels-pitched-fixed", "solf-names": "labels-pitched-note",
              "board": "pitched", "export": "export", "finish": "rock"}


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


# The opening line as the picture: big words landing as they are said, "this" the biggest.
HOOK_LINES = [["Sight", "reading", "music"], ["doesn't", "have", "to"], ["sound", "like"], ["this..."]]


def hook_html():
    out, k = [], 0
    for row in HOOK_LINES:
        spans = []
        for w in row:
            cls = "hw hw-this" if w.startswith("this") else "hw"
            spans.append(f'<span class="{cls}" id="hw{k}">{esc(w)}</span>')
            k += 1
        out.append(f'<div class="hook-row">{" ".join(spans)}</div>')
    return f'<div id="hook">{"".join(out)}</div>'


def captions_html():
    out = []
    for i, text in enumerate(CAPTIONS):
        words = text.split(" ")
        spans = "".join(f'<span class="cw" id="cw{i}-{k}">{esc(w)}</span> ' for k, w in enumerate(words))
        out.append(f'<p class="cap" id="cap{i}"><span class="cap-card">{spans}</span></p>')
    return "".join(out)


def pills_html():
    return "".join(f'<span class="pill" id="pill-{sid}" style="background:{bg};color:{ink}">{esc(t)}</span>' for sid, (t, bg, ink) in PILLS.items())


def _centred(name, scale):
    """GSAP vars that zoom by `scale` with a control the capture noted (assets/footage/<name>.json) moved to the
    frame's centre: origin top left, then a shift in percent of the picture, so it holds in either cut."""
    r = json.load(open(f"assets/footage/{name}.json"))["rect"]
    px, py = (r["x"] + r["w"] / 2) / 1920, (r["y"] + r["h"] / 2) / 1080
    return f'scale: {scale}, transformOrigin: "0% 0%", xPercent: {50 - scale * px * 100:.2f}, yPercent: {50 - scale * py * 100:.2f}'


ZERO = 'scale: 1, transformOrigin: "0% 0%", xPercent: 0, yPercent: 0'


def _tempo(a, b):
    # Slow it down or speed it up: straight in on the tempo control as it steps down, then up.
    return [f'tl.fromTo("#vw-tempo video", {{ {ZERO} }}, {{ {_centred("tempo", 3.6)}, duration: 0.55, ease: "power3.inOut" }}, {a:.3f});']


def _export(a, b):
    # Export: in close on the button as it is pressed, back out to the video recording, then the file it makes.
    press = json.load(open("assets/footage/export.json"))["pressAt"] - FOOT["export"]["media"]
    return [
        f'tl.fromTo("#vw-export video", {{ {_centred("export", 3.4)} }}, {{ {_centred("export", 3.4)}, duration: 0.01 }}, {a:.3f});',
        f'tl.fromTo("#press-ring", {{ opacity: 0.9, scale: 0.4 }}, {{ opacity: 0, scale: 1.6, duration: 0.5, ease: "power2.out", immediateRender: false }}, {a + press:.3f});',
        f'tl.to("#vw-export video", {{ {ZERO}, duration: 0.6, ease: "power3.inOut" }}, {a + press + 0.45:.3f});',
        f'tl.fromTo("#file-card", {{ opacity: 0, scale: 0.5, rotation: -8, y: 40 }}, {{ opacity: 1, scale: 1, rotation: -2, y: 0, duration: 0.55, ease: "back.out(2)", immediateRender: false }}, {a + press + 1.15:.3f});',
        f'tl.to("#file-card", {{ opacity: 0, scale: 0.9, duration: 0.2 }}, {b - 0.15:.3f});',
    ]


ZOOM = {"tempo": _tempo, "export": _export}


def script(portrait):
    js = []
    # Scenes: each clip shown in its window (a quick cut, a little push on entry).
    for sid, a in SCENES:
        if sid in ("plain", "close", "board"):
            continue
        b = span(sid)[1]
        montage = sid in ("rock", "trap")
        k = [x for x, _ in SCENES].index(sid)
        origin = ["30% 35%", "70% 40%", "50% 30%", "35% 60%"][k % 4]
        js.append(f'tl.set("#vw-{sid}", {{ opacity: 1 }}, {a:.3f});')
        if montage:
            # A cut on the beat: a punch in, settling.
            js.append(f'tl.fromTo("#vw-{sid}", {{ scale: 1.12, rotation: {(-1.2 if k % 2 else 1.2)} }}, {{ scale: 1, rotation: 0, duration: 0.35, ease: "back.out(1.4)" }}, {a:.3f});')
        else:
            js.append(f'tl.fromTo("#vw-{sid}", {{ opacity: 0.0, scale: 1.04 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" }}, {a:.3f});')
        if sid in ZOOM:
            js.extend(ZOOM[sid](a, b))
            js.append(f'tl.set("#vw-{sid}", {{ opacity: 0 }}, {b + 0.05:.3f});')
            continue
        # The camera: a slow push in on part of the picture for the scene's length.
        js.append(f'tl.fromTo("#vw-{sid} video", {{ scale: 1.0, transformOrigin: "{origin}" }}, {{ scale: 1.07, duration: {max(0.5, b - a):.3f}, ease: "none" }}, {a:.3f});')
        js.append(f'tl.set("#vw-{sid}", {{ opacity: 0 }}, {b + 0.05:.3f});')
    # The board: the band's video again, on a TV, for the class.
    a, b = span("board")
    js.append(f'tl.set("#tv", {{ opacity: 1 }}, {a:.3f}); tl.fromTo("#tv", {{ y: 60, scale: 0.92 }}, {{ y: 0, scale: 1, duration: 0.6, ease: "back.out(1.6)" }}, {a:.3f}); tl.set("#tv", {{ opacity: 0 }}, {b:.3f});')
    js.append(f'tl.set("#frame", {{ opacity: 0 }}, {a:.3f}); tl.set("#frame", {{ opacity: 1 }}, {b:.3f});')
    # The background: the blobs drift the whole time; the tint follows the scene.
    for i, (dx, dy) in enumerate([(160, 90), (-140, -110), (-120, 140), (110, -80)]):
        js.append(f'tl.to("#blob{i}", {{ x: {dx}, y: {dy}, duration: {END / 2:.2f}, ease: "sine.inOut", yoyo: true, repeat: 1 }}, 0);')
    TINT = {"open": "#eaf0f9", "rock": "#e3eefc", "trap": "#fdf6d8", "band": "#e1f5ec", "tempo": "#e3eefc",
            "syll-count": "#fdf6d8", "solf-movable": "#fdebe2", "board": "#e3eefc", "export": "#e1f5ec", "finish": "#fdf6d8", "close": "#eaf0f9"}
    for sid, a in SCENES:
        if sid in TINT:
            js.append(f'tl.to("#root", {{ backgroundColor: "{TINT[sid]}", duration: 0.5, ease: "power1.inOut" }}, {a:.3f});')
    # The plain open: grey, a pulse on each click; then the snap into colour.
    # The opening line, word by word, big (each lands on its spoken time); the cat cuts in after "this".
    spoken = WORDS[0]["words"]
    k = 0
    for row in HOOK_LINES:
        for _w in row:
            t = VO[0] + (spoken[k]["t"] if k < len(spoken) else spoken[-1]["t"])
            big = k == len(spoken) - 1
            js.append(f'tl.fromTo("#hw{k}", {{ opacity: 0, y: 60, scale: {0.4 if big else 0.7} }}, {{ opacity: 1, y: 0, scale: 1, duration: {0.4 if big else 0.28}, ease: "back.out({3.2 if big else 2.2})" }}, {t - 0.04:.3f});')
            k += 1
    # The still score while the line is said; the cat cuts in on "this" and plays, with a slow push in.
    js.append(f'tl.set("#cat-video", {{ opacity: 0 }}, 0); tl.set("#cat-video", {{ opacity: 1 }}, {CAT_AT:.3f});')
    js.append(f'tl.fromTo("#cat-video", {{ scale: 1.0 }}, {{ scale: 1.08, duration: {CAT_DUR:.3f}, ease: "none", immediateRender: false }}, {CAT_AT:.3f});')
    js.append(f'tl.to("#plain", {{ opacity: 0, scale: 1.06, duration: 0.25, ease: "power2.in" }}, {SNAP - 0.12:.3f});')
    # immediateRender off: a fromTo otherwise holds its start (a white flash) from the first frame, over the cat.
    js.append(f'tl.fromTo("#flash", {{ opacity: 0.85 }}, {{ opacity: 0, duration: 0.45, ease: "power2.out", immediateRender: false }}, {SNAP:.3f});')
    js.append(f'tl.fromTo("#frame", {{ opacity: 0, scale: 0.9 }}, {{ opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.5)" }}, {SNAP:.3f});')
    js.append(f'tl.to("#frame", {{ opacity: 0, scale: 0.94, duration: 0.35, ease: "power2.in" }}, {span("close")[0] - 0.05:.3f});')
    # Pills: in with their scene, out with it.
    for sid in PILLS:
        a, b = span(sid)
        js.append(f'tl.fromTo("#pill-{sid}", {{ opacity: 0, scale: 0.4, rotation: -14 }}, {{ opacity: 1, scale: 1, rotation: -4, duration: 0.45, ease: "back.out(2.6)" }}, {a + 0.08:.3f}); tl.to("#pill-{sid}", {{ opacity: 0, scale: 0.85, duration: 0.15 }}, {b - 0.1:.3f});')
    # Captions: each line in as it starts, a word lighting as it is said, out after.
    for i, x in enumerate(WORDS):
        if i == len(WORDS) - 1 or i == 0:
            continue  # line 1 is the big text itself; the close's logo and line say the last
        start = VO[i]
        end = start + x["len"]
        nxt = VO[i + 1] if i + 1 < len(VO) else END
        js.append(f'tl.fromTo("#cap{i}", {{ opacity: 0, y: 24, scale: 0.96 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.8)" }}, {start - 0.05:.3f});')
        js.append(f'tl.to("#cap{i}", {{ opacity: 0, duration: 0.2 }}, {min(nxt - 0.05, end + 0.6):.3f});')
        n_cap = len(CAPTIONS[i].split(" "))
        times = [w["t"] for w in x["words"]]
        # The caption's words and the spoken ones line up one to one where the counts match; otherwise spread evenly.
        if len(times) != n_cap:
            span_t = (times[-1] - times[0]) if len(times) > 1 else x["len"] * 0.8
            times = [times[0] + span_t * k / max(1, n_cap - 1) for k in range(n_cap)]
        for k in range(n_cap):
            js.append(f'tl.fromTo("#cw{i}-{k}", {{ color: "#a7b1c2", y: 6 }}, {{ color: "#15213a", y: 0, duration: 0.18, ease: "back.out(3)" }}, {start + times[k]:.3f});')
    # The close: the wordmark, the line, the address (the vertical's own address at the foot leaves).
    a = span("close")[0]
    if portrait:
        js.append(f'tl.fromTo("#foot", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, {SNAP:.3f}); tl.to("#foot", {{ opacity: 0, duration: 0.25 }}, {a - 0.1:.3f});')
    js.append(f'tl.set("#close", {{ opacity: 1 }}, {a:.3f});')
    js.append(f'tl.fromTo("#end-card", {{ opacity: 0, scale: 0.6, rotation: -4 }}, {{ opacity: 1, scale: 1, rotation: 0, duration: 0.6, ease: "back.out(1.7)" }}, {a:.3f});')
    js.append(f'tl.fromTo("#close-mark", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }}, {a + 0.2:.3f});')
    # The notes pop in, then the ball hops across them on the bed's beat, each lighting as it lands.
    for i in range(4):
        js.append(f'tl.fromTo("#end-n{i}", {{ opacity: 0, scale: 0.3, transformOrigin: "50% 80%" }}, {{ opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }}, {a + 0.35 + 0.08 * i:.3f});')
    hop = BEAT
    t = a + 0.75
    js.append(f'tl.set("#end-ball", {{ attr: {{ cx: {NOTE_X[0] - 110}, cy: {NOTE_Y[0] - 40} }}, opacity: 1 }}, {a:.3f});')
    prev_x, prev_y = NOTE_X[0] - 110, NOTE_Y[0] - 40
    for i, (x, y) in enumerate(zip(NOTE_X, NOTE_Y)):
        top = min(prev_y, y - 30) - 70
        js.append(f'tl.to("#end-ball", {{ attr: {{ cx: {x} }}, duration: {hop:.3f}, ease: "none" }}, {t:.3f});')
        js.append(f'tl.to("#end-ball", {{ attr: {{ cy: {top} }}, duration: {hop / 2:.3f}, ease: "power2.out" }}, {t:.3f});')
        js.append(f'tl.to("#end-ball", {{ attr: {{ cy: {y - 40} }}, duration: {hop / 2:.3f}, ease: "power2.in" }}, {t + hop / 2:.3f});')
        js.append(f'tl.to("#end-n{i}", {{ fill: "#2f6fe0", stroke: "#2f6fe0", duration: 0.12 }}, {t + hop:.3f});')
        js.append(f'tl.fromTo("#end-n{i}", {{ scale: 1.3 }}, {{ scale: 1, duration: 0.3, ease: "back.out(3)", immediateRender: false }}, {t + hop:.3f});')
        prev_x, prev_y = x, y
        t += hop
    # Home on the last note, the ball pops away (left there it reads as a second notehead).
    js.append(f'tl.to("#end-ball", {{ attr: {{ r: 0 }}, opacity: 0, duration: 0.25, ease: "back.in(2)" }}, {t + 0.05:.3f});')
    for i in range(3):
        js.append(f'tl.fromTo("#chip{i}", {{ opacity: 0, y: 30, scale: 0.8 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(2.4)" }}, {t + 0.15 * i:.3f});')
    js.append(f'tl.fromTo("#close-line", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }}, {word_at(10, 3) - 0.1:.3f});')
    js.append(f'tl.fromTo("#close-url", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }}, {word_at(10, 5) + 0.6:.3f});')
    # The free month (the site's own wording, FreeMonthPromo), on the bed's next beat after the address.
    js.append(f'tl.fromTo("#close-offer", {{ opacity: 0, y: 24, scale: 0.9 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2.2)" }}, {word_at(10, 5) + 0.6 + BEAT:.3f});')
    return "\n".join(js)


def page(portrait):
    w, h = (1080, 1920) if portrait else (1920, 1080)
    css = PORTRAIT_CSS if portrait else LANDSCAPE_CSS
    return (TEMPLATE.replace("%%CSS%%", BASE_CSS + css).replace("%%W%%", str(w)).replace("%%H%%", str(h))
            .replace("%%RES%%", "portrait" if portrait else "landscape").replace("%%END%%", f"{END:g}")
            .replace("%%CLIPS%%", frame_html(portrait)).replace("%%TVCLIP%%", tv_clip())
            .replace("%%CAPTIONS%%", captions_html()).replace("%%PILLS%%", pills_html())
            .replace("%%CATAT%%", f"{CAT_AT:.3f}").replace("%%CATDUR%%", f"{CAT_DUR + 0.1:.3f}").replace("%%ABC%%", ABC_SVG).replace("%%SCRIPT%%", script(portrait))
            .replace("%%STAFF%%", STAFF_SVG).replace("%%HOOK%%", hook_html())
            .replace("%%FOOT%%", '<div id="foot"><span class="url-pill">abcsightreading.com</span></div>' if portrait else ""))


def tv_clip():
    return video("v-board", "board", 30)


BASE_CSS = """
@font-face { font-family: "Fredoka"; src: url("assets/fonts/fredoka-latin.woff2") format("woff2"); font-weight: 300 700; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: %%W%%px; height: %%H%%px; overflow: hidden; background: #eaf0f9; }
body { font-family: "Nunito", sans-serif; color: #15213a; }
#root { position: relative; width: %%W%%px; height: %%H%%px; overflow: hidden; background: #eaf0f9; }
.blob { position: absolute; border-radius: 50%; opacity: 0.6; filter: blur(2px); }
#frame { position: absolute; border-radius: 30px; overflow: hidden; background: #ffffff; box-shadow: 0 40px 90px rgba(21,33,58,0.26), 0 0 0 8px rgba(255,255,255,0.85); opacity: 0; }
.vw { position: absolute; inset: 0; opacity: 0; }
.vw video { width: 100%; height: 100%; object-fit: cover; display: block; will-change: transform; }
/* The tempo shot: zoomed on the header, where the BPM steps. */

#plain { position: absolute; inset: 0; z-index: 5; }
#plain { background: transparent; }
#hook { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: "Fredoka", sans-serif; font-weight: 700; color: #15213a; line-height: 1.04; }
.hw { display: inline-block; opacity: 0; }
.hw-this { color: #2f6fe0; }
#cat-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
#tick { position: absolute; width: 34px; height: 34px; border-radius: 50%; background: #9aa3b2; opacity: 0.55; }
#flash { position: absolute; inset: 0; z-index: 6; background: #ffffff; opacity: 0; pointer-events: none; }
.pill { position: absolute; z-index: 8; font-family: "Fredoka", sans-serif; font-weight: 700; padding: 14px 36px; border-radius: 22px; opacity: 0; box-shadow: 0 16px 34px rgba(21,33,58,0.22); border: 5px solid #ffffff; white-space: nowrap; transform-origin: 20% 50%; }
.cap { position: absolute; z-index: 9; left: 0; right: 0; text-align: center; font-family: "Fredoka", sans-serif; font-weight: 600; opacity: 0; }
.cap-card { display: inline-block; background: #ffffff; border-radius: 30px; box-shadow: 0 18px 44px rgba(21,33,58,0.18); color: #a7b1c2; }
.cw { display: inline-block; }
#press-ring { position: absolute; left: 50%; top: 50%; width: 260px; height: 260px; margin: -130px 0 0 -130px; border-radius: 50%; border: 10px solid #2f6fe0; opacity: 0; z-index: 3; }
#file-card { position: absolute; z-index: 8; opacity: 0; display: flex; align-items: center; gap: 28px; background: #ffffff; border-radius: 34px; padding: 28px 34px; box-shadow: 0 30px 70px rgba(21,33,58,0.3); border: 4px solid #ffffff; }
.fc-icon { width: 104px; height: 104px; border-radius: 26px; background: linear-gradient(135deg, #ff9a76, #f26b4a); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 24px rgba(242,107,74,0.35); }
.fc-name { font-family: "Fredoka", sans-serif; font-weight: 700; color: #15213a; }
.fc-meta { font-family: "Fredoka", sans-serif; font-weight: 500; color: #6f7a8f; margin-top: 6px; }
.fc-share { font-family: "Fredoka", sans-serif; font-weight: 700; color: #ffffff; background: #2f6fe0; border-radius: 999px; padding: 14px 34px; }
#tv { position: absolute; z-index: 7; opacity: 0; }
#tv .bezel { position: absolute; inset: 0; border-radius: 26px; background: #1b2233; box-shadow: 0 40px 90px rgba(21,33,58,0.35); }
#tv .screen { position: absolute; overflow: hidden; border-radius: 10px; background: #000; }
#tv .screen video { width: 100%; height: 100%; object-fit: cover; display: block; }
#tv .stand { position: absolute; background: #1b2233; border-radius: 8px; }
#close { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; opacity: 0; }
.end-card { background: #ffffff; border-radius: 48px; box-shadow: 0 40px 90px rgba(21,33,58,0.2); display: flex; flex-direction: column; align-items: center; }
.end-staff { display: block; }
.end-note { fill: #15213a; stroke: #15213a; }
#end-ball { opacity: 0; }
.chips { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; }
.chip { font-family: "Fredoka", sans-serif; font-weight: 700; border-radius: 999px; border: 4px solid #ffffff; box-shadow: 0 12px 28px rgba(21,33,58,0.14); opacity: 0; }
.close-mark { display: inline-flex; align-items: baseline; gap: 0.1em; }
.close-mark .abc { height: 0.75em; width: auto; color: #1e56c0; }
.close-mark .rest { font-family: "Fredoka", sans-serif; font-weight: 600; color: #15213a; line-height: 1; }
.close-line { font-family: "Fredoka", sans-serif; font-weight: 700; color: #2f6fe0; }
.url-pill { font-family: "Fredoka", sans-serif; font-weight: 600; color: #15213a; background: #ffffff; border-radius: 999px; border: 2px solid #d8e2f1; box-shadow: 0 16px 34px rgba(21,33,58,0.12); }
.close-offer { font-family: "Nunito", sans-serif; font-weight: 800; color: #1f5c46; background: #d6f3e6; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.5em; margin: 0; }
.offer-badge { font-weight: 900; font-size: 0.62em; letter-spacing: 0.06em; text-transform: uppercase; color: #ffffff; background: #2f6fe0; padding: 0.35em 0.8em; border-radius: 999px; }
"""
LANDSCAPE_CSS = """
#frame { left: 176px; top: 40px; width: 1568px; height: 882px; }

#tick { left: 943px; top: 6px; width: 26px; height: 26px; }
.pill { left: 120px; top: 14px; font-size: 40px; }
.cap { top: 880px; padding: 0 140px; font-size: 46px; line-height: 1.25; }
#file-card { left: 560px; top: 330px; } .fc-name { font-size: 40px; } .fc-meta { font-size: 28px; } .fc-share { font-size: 30px; }
.cap-card { padding: 20px 40px; }
#hook { font-size: 132px; gap: 4px; } .hw-this { font-size: 230px; margin-top: 10px; }
#tv { left: 300px; top: 30px; width: 1320px; height: 860px; }
#tv .bezel { height: 780px; }
#tv .screen { left: 26px; top: 26px; width: 1268px; height: 713px; }
#tv .stand { left: 610px; top: 780px; width: 100px; height: 60px; }
.close-mark { font-size: 120px; } .close-mark .rest { font-size: 120px; }
#close { gap: 44px; padding-bottom: 20px; }
.end-card { padding: 50px 110px 54px; gap: 6px; }
.end-staff { width: 900px; margin: 0 0 -6px; }
.close-line { font-size: 56px; margin-bottom: 22px; }
.chip { font-size: 34px; padding: 12px 30px; }
.url-pill { font-size: 46px; padding: 18px 46px; }
.close-offer { font-size: 36px; padding: 14px 32px; margin-top: 18px; }
"""
PORTRAIT_CSS = """
#frame { left: 24px; top: 600px; width: 1032px; height: 580px; }
#cat-video { object-position: 58% 50%; }
#hook { font-size: 118px; gap: 8px; } .hw-this { font-size: 210px; margin-top: 20px; }
#tick { left: 527px; top: 470px; }
.pill { left: 50%; top: 330px; font-size: 64px; translate: -50% 0; transform-origin: 50% 50%; }
.cap { top: 1260px; padding: 0 56px; font-size: 62px; line-height: 1.22; }
#file-card { left: 70px; top: 760px; padding: 24px 26px; gap: 20px; } .fc-name { font-size: 34px; } .fc-meta { font-size: 24px; } .fc-share { font-size: 26px; padding: 12px 26px; }
.cap-card { padding: 30px 40px; }
#foot { position: absolute; left: 0; right: 0; bottom: 120px; text-align: center; z-index: 4; }
#foot .url-pill { font-size: 40px; padding: 14px 40px; }
#tv { left: 40px; top: 520px; width: 1000px; height: 680px; }
#tv .bezel { height: 600px; }
#tv .screen { left: 20px; top: 20px; width: 960px; height: 540px; }
#tv .stand { left: 460px; top: 600px; width: 80px; height: 50px; }
.close-mark { font-size: 96px; } .close-mark .rest { font-size: 96px; }
#close { gap: 50px; padding-bottom: 60px; }
.end-card { padding: 60px 40px 64px; gap: 10px; width: 960px; }
.end-staff { width: 820px; margin: 10px 0 4px; }
.close-line { font-size: 66px; margin-bottom: 26px; }
.chips { width: 960px; }
.chip { font-size: 40px; padding: 14px 34px; }
.url-pill { font-size: 48px; padding: 18px 46px; }
.close-offer { font-size: 40px; padding: 22px 36px; margin-top: 22px; flex-direction: column; gap: 14px; border-radius: 36px; max-width: 900px; }
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
  <div class="blob" id="blob0" style="width:720px;height:720px;left:-220px;top:-240px;background:#c9e4ff"></div>
  <div class="blob" id="blob1" style="width:620px;height:620px;right:-200px;bottom:-180px;background:#ffd3bf"></div>
  <div class="blob" id="blob2" style="width:420px;height:420px;right:14%;top:-150px;background:#bdebd9"></div>
  <div class="blob" id="blob3" style="width:380px;height:380px;left:10%;bottom:-160px;background:#ffefa8"></div>
  <div id="frame">%%CLIPS%%<div id="press-ring"></div></div>
  <div id="file-card">
    <div class="fc-icon"><svg viewBox="0 0 24 24" width="56" height="56" fill="#ffffff" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg></div>
    <div class="fc-text"><p class="fc-name">rock-beat-play-along.mp4</p><p class="fc-meta">1:30 · 1080p · ready to share</p></div>
    <span class="fc-share">Share</span>
  </div>
  <div id="tv"><div class="bezel"></div><div class="screen">%%TVCLIP%%</div><div class="stand"></div></div>
  %%PILLS%%
  <div id="plain">%%HOOK%%<video id="cat-video" data-start="%%CATAT%%" data-duration="%%CATDUR%%" data-media-start="0" data-track-index="9" src="assets/footage/cat.mp4" muted playsinline preload="auto"></video></div>
  <div id="flash"></div>
  <div id="close">
    <div class="end-card" id="end-card">
      <div class="close-mark" id="close-mark">%%ABC%%<span class="rest">SightReading</span></div>
      %%STAFF%%
      <p class="close-line" id="close-line">Practice real music.</p>
      <span class="url-pill" id="close-url">abcsightreading.com</span>
      <p class="close-offer" id="close-offer"><span class="offer-badge">Limited time</span> Try Pro free for a month. No card needed.</p>
    </div>
    <div class="chips">
      <span class="chip" id="chip0" style="background:#ffd3bf;color:#5a2310">Play-along videos</span>
      <span class="chip" id="chip1" style="background:#c9e4ff;color:#0e3563">Unison &amp; choral</span>
      <span class="chip" id="chip2" style="background:#bdebd9;color:#0f3b2c">Clap &amp; sing to grade</span>
    </div>
  </div>
  %%CAPTIONS%%
  %%FOOT%%
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
