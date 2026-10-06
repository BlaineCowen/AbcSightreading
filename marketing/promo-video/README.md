# Play-along promo (6 October 2026)

A 53 s promo for the play-along videos, in two cuts: `../promo-landscape` (1920x1080) and `../promo-vertical` (1080x1920), HyperFrames compositions written by `build.py`. Blaine reads `script.md` over the app's own play-along videos.

To rebuild from scratch (the footage, music and renders are gitignored):

1. **Voice:** `assets/vo/take1-3.m4a` are Blaine's takes, transcribed by whisper (`take*.json`). Then `python3 vo.py` cuts, cleans and levels the ten lines.
2. **Music:** put "calm soft" (atlasaudio, Blaine's pick) at `assets/music/calm-soft.mp3`.
3. **Footage:** with the dev server running, `bun run capture/exports.ts` records the five videos through the app's own Export button, in real time (rock, soul, cumbia, trap, pitched). Then `bun run capture/ui.ts` records the interface shots. Clip offsets: `offsets.json` (copy it to `assets/footage/`).
4. **Build:** `python3 build.py` writes both compositions, the short per-scene clips (`cut-*.mp4`, so the Studio preview can start each at once) and the audio mix (`assets/music/promo-mix.m4a`, -14 LUFS).
5. **Render:** in each cut's folder, run `npx --yes hyperframes@0.8.125 render`.
