# abcOmniPitch (abcTuner's OmniPitch tab)

The tab frames OmniPitch's own editor (Blaine's
`~/Projects/polyphonic-pitch-detector`, `polypitch/web`), served as a static
page from `public/omnipitch/editor/` (`OmniPitchTab.svelte`). It is the
editor as OmniPitch ships it: Basic Pitch transcription (General, Voices,
DSP), the Melodyne-style roll, tuning colours against the voices around each
note, recording, key detection, Correct pitch and the note tools, export,
all running in the browser (no edit server).

## Syncing it

```sh
bun run scripts/omnipitch/sync.ts
```

copies index.html, polypitch.js, engine-worker.js, the wasm, the demo and
the Basic Pitch licence, and applies the site's changes (the Recess colours
and fonts in light and dark, the abc wordmark, the in-browser engine only, a
versioned wasm name, and the fix to tuningRef's unsorted median). Each change
is a literal replacement that must find its text, so if OmniPitch's page
moves one, the sync stops and says which.

The wasm is OmniPitch's own `web/polypitch.wasm`, the **vocoder** build (note
editing), which includes Harmelody's proprietary phase vocoder; Blaine chose
that knowingly (22 October 2026). Rebuild it in OmniPitch first
(`cargo build --release --target wasm32-unknown-unknown --features vocoder`,
with ../harmelody-poly on its vocoder-poly-mode branch, then copy into web/).
**When the wasm changes, bump `WASM_NAME` in the sync script**: vercel.json
caches `/omnipitch/*.wasm` for a year. `VERSION.txt` records the commit.

The site's theme reaches the frame by `?theme=` and by a message
(`{abcTheme}`) whenever it changes; the editor redraws on it.

## Stashed: parts and a director's view

A tab of our own built on the same detector (record, then each part's lean,
"Alto: 17¢ sharp", a part alone, notes against A440, a second pitch reading
from uncovered harmonics, and measurement against the Choral Singing Dataset
quartets: each part's lean within a median 2 cents of its singer's) is on the
branch `ensemble-parts-idea` (commit 09c51fd), with its notes in
notes/omnipitch.md there. Blaine stashed it on 22 October 2026: not yet.
