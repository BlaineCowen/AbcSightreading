#!/usr/bin/env node
/**
 * Engrave the rhythm picker's icons with LilyPond.
 *
 *   bun run icons:rhythm
 *
 * Writes one SVG per rhythm into src/assets/svgs/, which is where both pickers
 * import them from (`../assets/svgs/<name>.svg?raw`, inlined with {@html}).
 *
 * The icons this replaces were bitmaps traced by potrace: fixed ink, no shared
 * geometry, and a different weight from the engraving they sit beside. These
 * are engraved from the same figure the generator writes, cropped tight, every
 * glyph a path (no font to ship) and every colour `currentColor`, so a disabled
 * tile can dim one and dark mode gets it for nothing.
 *
 * Borrowed wholesale from learn-music-fun's rhythm game, which solved this
 * first - including the half-rest line below, which took a while to get right.
 *
 * Requires LilyPond 2.26 (brew install lilypond); override with
 * LILYPOND=/path/to/lilypond. Vercel has no LilyPond, so the output is
 * committed - re-run this whenever MUSIC or the prelude changes.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src/assets/svgs");
const LILYPOND = process.env.LILYPOND ?? "lilypond";
const EXPECTED_VERSION = "2.26";

/**
 * Staffless, clefless, meterless: the figure and nothing else. The picker
 * shows a rhythm, not a bar of music.
 */
const PRELUDE = String.raw`\version "2.26.0"
\paper { indent = 0 }
\layout {
  \omit Staff.StaffSymbol
  \omit Staff.Clef
  \omit Staff.TimeSignature
  \omit Staff.BarLine
}
`;

/**
 * Rhythm name → LilyPond music. Keyed by the names in resources/rhythms.ts,
 * which is what the picker asks for; main() fails if the two ever disagree.
 *
 * Beams are explicit. Automatic beaming works from the time signature, and
 * there is none here.
 */
const MUSIC = {
  quarter: "c4",
  half: "c2",
  whole: "c1",
  dotHalf: "c2.",
  dotQuarter: "c4.",
  eighthEighth: "c8[ c8]",
  fourSixteenths: "c16[ c16 c16 c16]",
  eighthSixteenthSixteenth: "c8[ c16 c16]",
  sixteenthSixteenthEighth: "c16[ c16 c8]",
  sixteenthEighthSixteenth: "c16[ c8 c16]",
  dotEighthSixteenth: "c8.[ c16]",
  dotQuarterEighth: "c4. c8",
  eighthDotQuarter: "c8 c4.",
  eighthQuarterEighth: "c8 c4 c8",
  dotHalfQuarter: "c2. c4",
  quarterRest: "r4",
  halfRest: "r2",
  wholeRest: "r1",
  eighthRest: "r8",
  eighthRestEighth: "r8 c8",
};

const lyFor = (music) =>
  `${PRELUDE}\\new RhythmicStaff { \\stemUp ${music} }\n`;

function checkLilypond() {
  let out;
  try {
    out = execFileSync(LILYPOND, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new Error(
      `Could not run "${LILYPOND}" (${err.message}). Install LilyPond (brew install lilypond) or set LILYPOND=/path/to/lilypond.`
    );
  }
  const version = /LilyPond (\d+\.\d+(?:\.\d+)?)/.exec(out)?.[1] ?? "unknown";
  if (!version.startsWith(EXPECTED_VERSION)) {
    console.warn(
      `warning: LilyPond ${version} found; these were drawn against ${EXPECTED_VERSION}.x - check the diff.`
    );
  }
  return version;
}

/**
 * Reduce a cropped LilyPond SVG to a viewBox and inner markup, with colour
 * normalised to currentColor. Anything needing a font, a link or an external
 * resource is rejected rather than written out: these are inlined with {@html}.
 */
function toFragment(svg, id) {
  const root = /<svg\b([^>]*)>/.exec(svg);
  if (!root) throw new Error(`${id}: no <svg> root`);
  const viewBoxRaw = /viewBox="([^"]+)"/.exec(root[1])?.[1];
  if (!viewBoxRaw) throw new Error(`${id}: no viewBox`);
  const nums = viewBoxRaw.trim().split(/\s+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
    throw new Error(`${id}: bad viewBox "${viewBoxRaw}"`);
  }

  let body = svg.slice(root.index + root[0].length, svg.lastIndexOf("</svg>"));
  body = body
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<a\b[^>]*>|<\/a>/g, "")
    .replace(/\s+xlink:[\w-]+="[^"]*"/g, "")
    // Any explicit colour becomes currentColor...
    .replace(/\b(fill|stroke)="(?!none")[^"]*"/g, '$1="currentColor"')
    // ...and fill is then redundant: the root <svg fill="currentColor"> has it.
    .replace(/\s+fill="currentColor"/g, "")
    .replace(/>\s+</g, "><")
    .trim();

  const banned = [/<text\b/, /<image\b/, /url\(/, /xlink/, /rgb\(/];
  for (const re of banned) {
    if (re.test(body)) throw new Error(`${id}: unexpected content matching ${re}`);
  }
  if (!body) throw new Error(`${id}: empty body`);
  return { viewBox: nums, body };
}

/** Line thickness and overhang (staff-spaces) for the rests that need one. */
const LINE_THICKNESS = 0.24;
const LINE_OVERHANG = 1.1;

/**
 * A half or whole rest without its line is a smudge.
 *
 * On a staffless RhythmicStaff LilyPond draws both as a bare block - the half
 * rest sitting on a line, the whole rest hanging from one, neither of which is
 * there. This puts the line back, taking the geometry from LilyPond's own
 * placement of the block, so the rest reads as the rest it is.
 *
 * @param below - true for the half rest, which sits ON the line; false for the
 *   whole rest, which hangs UNDER it.
 */
function withRestLine(frag, id, below) {
  const m = /<g transform="translate\(([-\d.]+), ([-\d.]+)\)">/.exec(frag.body);
  if (!m) throw new Error(`${id}: could not find the rest glyph`);
  const [x0, y0, vbW, vbH] = frag.viewBox;
  const tx = Number(m[1]);
  const baseline = Number(m[2]);
  const left = tx - LINE_OVERHANG;
  const right = x0 + vbW + LINE_OVERHANG;
  const width = right - left;
  const y = below
    ? baseline - LINE_THICKNESS * 0.25
    : y0 - LINE_THICKNESS * 0.75;
  const line = `<rect x="${left.toFixed(4)}" y="${y.toFixed(4)}" width="${width.toFixed(4)}" height="${LINE_THICKNESS.toFixed(4)}"/>`;
  const top = below ? y0 : y;
  const height = below
    ? baseline - y0 + LINE_THICKNESS * 0.75
    : y0 + vbH - y;
  return { viewBox: [left, top, width, height], body: frag.body + line };
}

const DECORATE = {
  halfRest: (f) => withRestLine(f, "halfRest", true),
  wholeRest: (f) => withRestLine(f, "wholeRest", false),
};

/**
 * CSS px per LilyPond staff-space, shared by every icon.
 *
 * This is what makes the set look like one font: each icon carries its own size
 * at the same scale, so noteheads are identical across them and a run of four
 * sixteenths is legitimately wider than a quarter. Sizing each icon to fill its
 * tile instead - which is what the traced ones did - made a whole note as tall
 * as a quarter and every notehead a different size.
 *
 * 9 puts a quarter at about 35px tall, inside the 48px tile.
 */
const PX_PER_UNIT = 9;

function emitSvg(frag, id, version) {
  const viewBox = frag.viewBox
    .map((n) => (Object.is(n, -0) ? 0 : n).toFixed(4))
    .join(" ");
  const [, , w, h] = frag.viewBox;
  const width = (w * PX_PER_UNIT).toFixed(1);
  const height = (h * PX_PER_UNIT).toFixed(1);
  return (
    `<!-- GENERATED - do not edit; run \`bun run icons:rhythm\`.\n` +
    `     ${id}, engraved by LilyPond ${version} (svg backend, -dcrop).\n` +
    `     Units are LilyPond staff-spaces; colour follows currentColor. -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"` +
    ` width="${width}" height="${height}"` +
    ` fill="currentColor" role="img" aria-hidden="true"` +
    ` preserveAspectRatio="xMidYMid meet">${frag.body}</svg>\n`
  );
}

/** The names the app actually has icons for, so this table cannot drift. */
function iconNames() {
  return fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, ""));
}

function main() {
  const version = checkLilypond();

  const ids = Object.keys(MUSIC);
  const existing = iconNames();
  const missing = existing.filter((n) => !(n in MUSIC));
  if (missing.length) {
    throw new Error(
      `These icons exist but have no music here, so they would be left as they are: [${missing}]`
    );
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rhythm-icons-"));
  try {
    const files = ids.map((id) => {
      const file = path.join(tmp, `${id}.ly`);
      fs.writeFileSync(file, lyFor(MUSIC[id]));
      return file;
    });
    try {
      execFileSync(
        LILYPOND,
        ["-dbackend=svg", "-dcrop", "-dno-point-and-click", "-o", tmp, ...files],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
    } catch (err) {
      throw new Error(`lilypond failed:\n${err.stderr?.toString() ?? err.message}`);
    }

    for (const id of ids) {
      const svg = fs.readFileSync(path.join(tmp, `${id}.cropped.svg`), "utf8");
      const frag = DECORATE[id]
        ? DECORATE[id](toFragment(svg, id))
        : toFragment(svg, id);
      fs.writeFileSync(path.join(OUT_DIR, `${id}.svg`), emitSvg(frag, id, version));
    }
    console.log(`wrote ${ids.length} icons to src/assets/svgs (LilyPond ${version})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
