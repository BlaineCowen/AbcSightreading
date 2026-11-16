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
 * - no demo: OmniPitch opens Allegri's Miserere until a file is chosen; here
 *   it starts empty (Blaine, 10 November 2026);
 * - the wasm under a versioned name (vercel.json caches /omnipitch/*.wasm a
 *   year): bump WASM_NAME whenever the wasm changes;
 * - the dark "Graphite" colours written straight into OmniPitch's rules (the
 *   header, tips, the view box, the record buttons, its violet tints) made to
 *   follow the theme (10 November 2026, when OmniPitch moved to Graphite).
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
const WASM_NAME = "polypitch-v3.wasm";

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
    --well: #eef3fa; --overlay: #dce8ff; --hilite: rgba(255, 255, 255, 0.6); --track: #d8e2f1;
    --text-lo: #7a86a0; --text-off: #a9b3c6; --accent-hi: #1e56c0; --accent-lo: #9dbbf0; --accent-tint: rgba(47, 111, 224, 0.12);
    --on-accent: #ffffff; --ok: #1f9d6b; --key-label: #8793ad; --raise: linear-gradient(#ffffff, #f3f7fd);
    --pop-shadow: 0 8px 24px rgba(21, 33, 58, 0.18); --font: "Nunito", system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark;
    --bg: #111113; --panel: #1b1b1f; --raised: #232328; --raised-hover: #2a2a30; --fg: #f4f4f6; --muted: #a4a4ae;
    --line: #34343b; --line-strong: #45454e; --accent: #5c9dff; --accent-hover: #78adff; --focus: #8dbaff;
    --row-white: #1d1d22; --row-black: #18181c; --row-out: #121215; --row-tonic: #1f2a3d; --grid: #26262c; --grid-strong: #3a3a43;
    --key-white: #d8d8de; --key-black: #111113; --note: #5c9dff; --note-edge: #c9e4ff; --playhead: #ffb38a;
    --off: #fbbf24; --way-off: #ff8a7a; --curve: #f4f4f6; --wave: #55555f; --ghost: #a4a4ae; --sel: #ffffff;
    --rec: #ff6b5b; --hint-bg: #020617; --hint-fg: #f4f4f6;
    --well: #0d0d10; --overlay: #2a2a30; --hilite: rgba(255, 255, 255, 0.05); --track: #34343b;
    --text-lo: #7c7c88; --text-off: #55555f; --accent-hi: #8dbaff; --accent-lo: #2c4f86; --accent-tint: rgba(92, 157, 255, 0.16);
    --on-accent: #0b1220; --ok: #34d399; --key-label: #6b6b76; --raise: linear-gradient(#26262c, #202025);
    --pop-shadow: 0 8px 24px rgba(0, 0, 0, 0.55); --font: "Nunito", system-ui, sans-serif; } }
  :root[data-theme="dark"] { color-scheme: dark;
    --bg: #111113; --panel: #1b1b1f; --raised: #232328; --raised-hover: #2a2a30; --fg: #f4f4f6; --muted: #a4a4ae;
    --line: #34343b; --line-strong: #45454e; --accent: #5c9dff; --accent-hover: #78adff; --focus: #8dbaff;
    --row-white: #1d1d22; --row-black: #18181c; --row-out: #121215; --row-tonic: #1f2a3d; --grid: #26262c; --grid-strong: #3a3a43;
    --key-white: #d8d8de; --key-black: #111113; --note: #5c9dff; --note-edge: #c9e4ff; --playhead: #ffb38a;
    --off: #fbbf24; --way-off: #ff8a7a; --curve: #f4f4f6; --wave: #55555f; --ghost: #a4a4ae; --sel: #ffffff;
    --rec: #ff6b5b; --hint-bg: #020617; --hint-fg: #f4f4f6;
    --well: #0d0d10; --overlay: #2a2a30; --hilite: rgba(255, 255, 255, 0.05); --track: #34343b;
    --text-lo: #7c7c88; --text-off: #55555f; --accent-hi: #8dbaff; --accent-lo: #2c4f86; --accent-tint: rgba(92, 157, 255, 0.16);
    --on-accent: #0b1220; --ok: #34d399; --key-label: #6b6b76; --raise: linear-gradient(#26262c, #202025);
    --pop-shadow: 0 8px 24px rgba(0, 0, 0, 0.55); --font: "Nunito", system-ui, sans-serif; }
  body { font-family: var(--font); font-size: 13px; font-weight: 600; }
  button, select, input { font-weight: 700; }
  .wm { font-family: "Fredoka", "Nunito", sans-serif; font-size: 17px; font-weight: 600; letter-spacing: 0; }
  .wm .abc { font-style: italic; color: var(--accent); margin-right: 1px; }
  header { background: var(--panel); box-shadow: 0 1px 0 var(--line); }
  #hint, #tip { background: var(--hint-bg); color: var(--hint-fg); }
  #hint kbd { color: var(--hint-fg); background: transparent; }
  select option { background: var(--panel); }
  #view { background: var(--panel); }
  #rec.on, #transfer.on { color: var(--rec); }
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

const BRAND_FROM = `<div class="brand"><svg viewBox="0 0 22 22" aria-hidden="true"><rect width="22" height="22" rx="6" fill="#A78BFA"/><g fill="#120D22"><rect x="4" y="12" width="6" height="3.4" rx="1.7"/><rect x="9" y="6.5" width="9" height="3.4" rx="1.7"/></g></svg><h1 class="wm">OmniPitch</h1></div>`;
const BRAND_TO = `<div class="brand"><h1 class="wm"><span class="abc">abc</span>OmniPitch</h1></div>`;

/** OmniPitch's violet tints, written as rgba in its rules: the theme's accent instead, at the same strength. */
const tints = (text: string) =>
  text
    .replace(/rgba\(167, 139, 250, ([0-9.]+)\)/g, (_, a) => `color-mix(in srgb, var(--accent) ${Math.round(Number(a) * 100)}%, transparent)`)
    // the logo's square and bars (the About box), in the theme's accent
    .replaceAll('fill="#A78BFA"', 'style="fill: var(--accent)"')
    .replaceAll('<g fill="#120D22">', '<g style="fill: var(--on-accent)">');

mkdirSync(OUT, { recursive: true });
const html = tints(patch("index.html", readFileSync(join(WEB, "index.html"), "utf8"), [
  ["<title>OmniPitch</title>", "<title>abcOmniPitch</title>"],
  ["</style>", `${THEME}</style>`],
  [BRAND_FROM, BRAND_TO],
  ['<script type="module">', THEME_SYNC],
  ['loadPolyPitch("polypitch.wasm" + ENGINE_V)', `loadPolyPitch("${WASM_NAME}" + ENGINE_V)`],
  ["background: linear-gradient(#1D2027, #171A20);", "background: var(--panel);"],
  [
    'if (HOST || new URLSearchParams(location.search).get("engine") === "local") throw new Error("local engine asked for");',
    'if (HOST || new URLSearchParams(location.search).get("engine") !== "server") throw new Error("the in-browser engine");',
  ],
  ["if (!HOST) loadDemo();", "// no demo on abcSightReading (scripts/omnipitch/sync.ts)"],
  ['status.textContent += " — editing unavailable (start tools/edit_server.py)";', 'status.textContent += ". Editing is not available in this browser.";'],
]));
writeFileSync(join(OUT, "index.html"), html);
writeFileSync(
  join(OUT, "engine-worker.js"),
  patch("engine-worker.js", readFileSync(join(WEB, "engine-worker.js"), "utf8"), [['loadPolyPitch("polypitch.wasm" + V)', `loadPolyPitch("${WASM_NAME}" + V)`]])
);
for (const f of ["polypitch.js", "parts.js", "files.js", "JetBrainsMono-500.woff2", "fonts-OFL.txt"]) copyFileSync(join(WEB, f), join(OUT, f));
copyFileSync(join(WEB, "polypitch.wasm"), join(OUT, WASM_NAME));
copyFileSync(join(REPO, "polypitch/models/LICENSE-basic-pitch"), join(OUT, "LICENSE-basic-pitch"));

const commit = execSync("git rev-parse --short HEAD", { cwd: REPO }).toString().trim();
const dirty = execSync("git status --short polypitch/web polypitch/src", { cwd: REPO }).toString().trim();
writeFileSync(
  join(OUT, "VERSION.txt"),
  `OmniPitch editor from polyphonic-pitch-detector ${commit}${dirty ? " (with uncommitted changes)" : ""}, synced ${new Date().toISOString().slice(0, 10)}.\n` +
    `Basic Pitch by Spotify, Apache-2.0 (LICENSE-basic-pitch); the voices model trained on the Choral Singing Dataset (CC BY 4.0).\n`
);
console.log(`synced OmniPitch ${commit}${dirty ? " (dirty)" : ""} into ${OUT}`);
