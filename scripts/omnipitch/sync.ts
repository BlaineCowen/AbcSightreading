/**
 * abcOmniPitch: OmniPitch's own editor (Blaine's polyphonic-pitch-detector,
 * polypitch/web) inside abcTuner's OmniPitch tab, under the site's look.
 * This copies the editor into public/omnipitch/editor/ and makes the few
 * changes that put it on the site, each one a literal replacement that must
 * find its text (so an upstream change that moves one stops the sync rather
 * than shipping a half-themed editor):
 *
 * - the Recess colours and fonts, light and dark, following the site's theme
 *   (the tab passes ?theme= and posts {abcTheme} when it changes);
 * - the abc wordmark in place of OmniPitch's logo;
 * - the in-browser engine only (it tried a local edit server first);
 * - the wasm under a versioned name (vercel.json caches /omnipitch/*.wasm a
 *   year): bump WASM_NAME whenever the wasm changes;
 * - one upstream fix: tuningRef's sort sat inside a comment, so the median it
 *   takes was of unsorted offsets.
 *
 *   bun run scripts/omnipitch/sync.ts     (OMNIPITCH=<repo> if it is elsewhere)
 *
 * The wasm is the vocoder build (note editing), web/polypitch.wasm as
 * OmniPitch's own build leaves it; see notes/omnipitch.md.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const REPO = process.env.OMNIPITCH ?? join(homedir(), "Projects/polyphonic-pitch-detector");
const WEB = join(REPO, "polypitch/web");
const OUT = "public/omnipitch/editor";
const WASM_NAME = "polypitch-v2.wasm";

function patch(file: string, text: string, edits: [string, string][]): string {
  for (const [from, to] of edits) {
    if (!text.includes(from)) throw new Error(`${file}: "${from.slice(0, 70)}" not found; the editor changed upstream`);
    text = text.split(from).join(to);
  }
  return text;
}

const THEME = `
  /* ---- abcSightReading (scripts/omnipitch/sync.ts): Recess colours and fonts, light and dark ---- */
  @font-face { font-family: "Fredoka"; font-weight: 300 700; font-display: swap; src: url("/fonts/fredoka-v17-latin.woff2") format("woff2"); }
  @font-face { font-family: "Nunito"; font-weight: 200 1000; font-display: swap; src: url("/fonts/nunito-v32-latin.woff2") format("woff2"); }
  :root {
    color-scheme: light;
    --bg: #eaf0f9; --panel: #ffffff; --raised: #f0f5fc; --raised-hover: #dce8ff; --fg: #15213a; --muted: #56637f;
    --line: #d8e2f1; --line-strong: #c3d0e6; --accent: #2f6fe0; --accent-hover: #1e56c0; --focus: #2f6fe0;
    --row-white: #f7f9fd; --row-black: #edf2fa; --row-out: #e1e7f1; --row-tonic: #e3edff; --grid: #e3e9f3; --grid-strong: #c9d4e6;
    --key-white: #ffffff; --key-black: #34405e; --note: #2f6fe0; --note-edge: #1e56c0; --playhead: #f0803c;
    --off: #e89a0c; --way-off: #e0443a; --curve: #15213a; --wave: #aab8d0; --ghost: #8793ad; --sel: #15213a;
    --rec: #c2352b; --radius: 10px; --hint-bg: #15213a; --hint-fg: #ffffff;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark;
    --bg: #111113; --panel: #1b1b1f; --raised: #232328; --raised-hover: #2a2a30; --fg: #f4f4f6; --muted: #a4a4ae;
    --line: #34343b; --line-strong: #45454e; --accent: #5c9dff; --accent-hover: #78adff; --focus: #8dbaff;
    --row-white: #1d1d22; --row-black: #18181c; --row-out: #121215; --row-tonic: #1f2a3d; --grid: #26262c; --grid-strong: #3a3a43;
    --key-white: #d8d8de; --key-black: #111113; --note: #5c9dff; --note-edge: #c9e4ff; --playhead: #ffb38a;
    --off: #fbbf24; --way-off: #ff8a7a; --curve: #f4f4f6; --wave: #55555f; --ghost: #a4a4ae; --sel: #ffffff;
    --rec: #ff6b5b; --hint-bg: #020617; --hint-fg: #f4f4f6; } }
  :root[data-theme="dark"] { color-scheme: dark;
    --bg: #111113; --panel: #1b1b1f; --raised: #232328; --raised-hover: #2a2a30; --fg: #f4f4f6; --muted: #a4a4ae;
    --line: #34343b; --line-strong: #45454e; --accent: #5c9dff; --accent-hover: #78adff; --focus: #8dbaff;
    --row-white: #1d1d22; --row-black: #18181c; --row-out: #121215; --row-tonic: #1f2a3d; --grid: #26262c; --grid-strong: #3a3a43;
    --key-white: #d8d8de; --key-black: #111113; --note: #5c9dff; --note-edge: #c9e4ff; --playhead: #ffb38a;
    --off: #fbbf24; --way-off: #ff8a7a; --curve: #f4f4f6; --wave: #55555f; --ghost: #a4a4ae; --sel: #ffffff;
    --rec: #ff6b5b; --hint-bg: #020617; --hint-fg: #f4f4f6; }
  body { font-family: "Nunito", system-ui, sans-serif; font-size: 13.5px; font-weight: 600; }
  button, select, input { font-weight: 700; }
  .brand { font-family: "Fredoka", "Nunito", sans-serif; font-size: 17px; font-weight: 600; letter-spacing: 0; }
  .brand .abc { font-style: italic; color: var(--accent); margin-right: 1px; }
  #hint { background: var(--hint-bg); color: var(--hint-fg); }
  #play:hover:not(:disabled) { background: var(--fg); border-color: var(--fg); opacity: 0.88; }
  #help h2 { font-family: "Fredoka", "Nunito", sans-serif; font-weight: 600; }
`;

// The site's theme: from the address at first, then whenever the tab says it changed.
const THEME_SYNC = `<script>
(function () {
  var q = new URLSearchParams(location.search).get("theme");
  if (q === "dark" || q === "light") document.documentElement.dataset.theme = q;
  addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.abcTheme) return;
    document.documentElement.dataset.theme = e.data.abcTheme;
    dispatchEvent(new Event("resize")); // the roll reads its colours as it draws
  });
})();
</script>
<script type="module">`;

const BRAND_FROM = `<div class="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#2563eb"/><path d="M5 15c2 0 2-6 4-6s2 8 4 8 2-10 4-10 1.5 5 2 5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg><h1 style="font:inherit;margin:0">OmniPitch</h1></div>`;
const BRAND_TO = `<div class="brand"><h1 style="font:inherit;margin:0"><span class="abc">abc</span>OmniPitch</h1></div>`;

mkdirSync(join(OUT, "demo"), { recursive: true });
const html = patch("index.html", readFileSync(join(WEB, "index.html"), "utf8"), [
  ["<title>OmniPitch</title>", "<title>abcOmniPitch</title>"],
  ["</style>", `${THEME}</style>`],
  [BRAND_FROM, BRAND_TO],
  ['<script type="module">', THEME_SYNC],
  ['loadPolyPitch("polypitch.wasm")', `loadPolyPitch("${WASM_NAME}")`],
  [
    'if (HOST || new URLSearchParams(location.search).get("engine") === "local") throw new Error("local engine asked for");',
    'if (HOST || new URLSearchParams(location.search).get("engine") !== "server") throw new Error("the in-browser engine");',
  ],
  ['status.textContent += " — editing unavailable (start tools/edit_server.py)";', 'status.textContent += ". Editing is not available in this browser.";'],
  [
    "const offs = pool.map((m) => [m.curve ? m.curve.steady : m.centsOff, m.end - m.start]) // as sung, whatever the edits.sort((a, b) => a[0] - b[0]);",
    "const offs = pool.map((m) => [m.curve ? m.curve.steady : m.centsOff, m.end - m.start]).sort((a, b) => a[0] - b[0]); // as sung, whatever the edits",
  ],
]);
writeFileSync(join(OUT, "index.html"), html);
writeFileSync(
  join(OUT, "engine-worker.js"),
  patch("engine-worker.js", readFileSync(join(WEB, "engine-worker.js"), "utf8"), [['loadPolyPitch("polypitch.wasm")', `loadPolyPitch("${WASM_NAME}")`]])
);
copyFileSync(join(WEB, "polypitch.js"), join(OUT, "polypitch.js"));
copyFileSync(join(WEB, "polypitch.wasm"), join(OUT, WASM_NAME));
copyFileSync(join(WEB, "demo/miserere.m4a"), join(OUT, "demo/miserere.m4a"));
copyFileSync(join(WEB, "demo/CREDITS.txt"), join(OUT, "demo/CREDITS.txt"));
copyFileSync(join(REPO, "polypitch/models/LICENSE-basic-pitch"), join(OUT, "LICENSE-basic-pitch"));

const commit = execSync("git rev-parse --short HEAD", { cwd: REPO }).toString().trim();
const dirty = execSync("git status --short polypitch/web polypitch/src", { cwd: REPO }).toString().trim();
writeFileSync(
  join(OUT, "VERSION.txt"),
  `OmniPitch editor from polyphonic-pitch-detector ${commit}${dirty ? " (with uncommitted changes)" : ""}, synced ${new Date().toISOString().slice(0, 10)}.\n` +
    `Basic Pitch by Spotify, Apache-2.0 (LICENSE-basic-pitch); the voices model trained on the Choral Singing Dataset (CC BY 4.0).\n`
);
console.log(`synced OmniPitch ${commit}${dirty ? " (dirty)" : ""} into ${OUT}`);
