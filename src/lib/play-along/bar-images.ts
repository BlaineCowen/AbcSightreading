/**
 * The bars of a play-along video as pictures the canvas can draw, and where
 * each note sits in its picture so the cursor can find it.
 *
 * The whole tune is drawn once, off screen, one bar to a line, so ties,
 * beams and rhythm syllables come out exactly as abcjs draws them on the
 * page. Then each line becomes its own SVG image by pointing a copy's viewBox
 * at it: an image a bar, vector to the last, so it is sharp at 1080p whatever
 * the screen. Each copy holds only its own line: every picture is framed as
 * tall as the tallest line (so the staff sits at one height in all of them),
 * and a frame that tall around a plain line reached into the line above -
 * bar 2 showed bar 1's solfège over its staff whenever bar 1 had a dynamic. One tall raster would be past a browser's canvas limit at 70
 * bars.
 */
import abcjs from "abcjs";

export interface BarNote {
  /** When the note starts, as a fraction of the bar (0 to 1). */
  at: number;
  /** Where its notehead is, as a fraction of the picture's width. */
  x: number;
}

export interface BarImage {
  img: HTMLImageElement;
  /** Picture width over height, for fitting it to a pane. */
  aspect: number;
  notes: BarNote[];
  /** Where the staff runs, as fractions of the picture's width: the cursor sweeps between them. */
  musicStart: number;
  musicEnd: number;
  /** Where the staff line is, as a fraction of the picture's height: the notes' glow sits on it. */
  staffAt: number;
  /** The top of the notes - stems and beams, which point up - as a fraction of the height: the ball lands there. */
  notesTopAt: number;
  /** The bottom of the staff, as a fraction of the height. */
  staffBottomAt: number;
  /**
   * The bar's dynamics, drawn by the scene rather than in the picture: `x`
   * where the note they belong to is (a fraction of the width), `first`
   * when that is the bar's first note.
   */
  dynamics: { text: string; x: number; first: boolean }[];
}

/** The dynamics abcjs draws (decorations written !mf! and so on). */
const DYNAMICS = new Set(["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "sfz"]);

/**
 * The exercise without its dynamics, and where they were: the bar (from 0)
 * and the note or rest in it (from 0) each belongs to. abcjs draws a dynamic
 * under the staff, or over it when there are words under it, so a bar with
 * one framed taller and every bar was drawn smaller to fit; drawn by the
 * scene instead, the music keeps its size.
 */
export function extractDynamics(abc: string): { abc: string; marks: { bar: number; note: number; text: string }[] } {
  const marks: { bar: number; note: number; text: string }[] = [];
  const lines = abc.split("\n");
  let inBody = false;
  let bar = 0;
  let note = 0;
  const out = lines.map((line) => {
    if (!inBody) {
      if (/^K:/.test(line)) inBody = true;
      return line;
    }
    // Header-like lines in the body (w:, %%, V:) carry no notes.
    if (/^([A-Za-z]:|%)/.test(line)) return line;
    let kept = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        const end = line.indexOf('"', i + 1);
        const stop = end < 0 ? line.length - 1 : end;
        kept += line.slice(i, stop + 1);
        i = stop;
      } else if (ch === "!") {
        const end = line.indexOf("!", i + 1);
        const stop = end < 0 ? line.length - 1 : end;
        const name = line.slice(i + 1, stop);
        if (DYNAMICS.has(name)) marks.push({ bar, note, text: name });
        else kept += line.slice(i, stop + 1);
        i = stop;
      } else if (ch === "|") {
        kept += ch;
        while (line[i + 1] === "|" || line[i + 1] === ":" || line[i + 1] === "]") kept += line[++i];
        // Only a bar with something in it ends: a barline opening a line,
        // after the last line's closing one, is not a new bar.
        if (note > 0) bar++;
        note = 0;
      } else {
        if (/[A-Ga-gzx]/.test(ch)) note++;
        kept += ch;
      }
    }
    return kept;
  });
  return { abc: out.join("\n"), marks };
}

export interface RenderedBars {
  bars: BarImage[];
}

/** Narrower draws bigger once the bar is fitted to its card: at 420 the notes fill it. */
const STAFF_WIDTH = 420;
/** Room above and below the staff line in each picture, in SVG units. */
const PAD = 6;
/**
 * Room always kept for one row of words below the music (solfège, or rhythm
 * syllables - the labels the video turns on and off), in SVG units, whether
 * or not they are showing: the frame is sized from the music and this room,
 * so turning them on fills it instead of rescaling the bar. Measured, the row
 * reaches 19-25 below the music; solfège used to take a bar from 1540 to
 * 1389 px wide on the 1080p canvas. Dynamics are not drawn in the picture
 * at all (extractDynamics): the scene draws them.
 */
const WORDS_BELOW = 26;

/**
 * Draws `abc` one bar to a line in a hidden element and returns a picture a
 * bar. `bpm` times the notes; `expectedBars` is checked so a bar that abcjs
 * put on a line with another fails loudly instead of desynchronising.
 */
export async function renderBars(abc: string, bpm: number, expectedBars: number): Promise<RenderedBars> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${STAFF_WIDTH + 40}px;visibility:hidden;color:#000`;
  document.body.appendChild(host);
  try {
    const { abc: plain, marks } = extractDynamics(abc);
    const visual = abcjs.renderAbc(host, withStretchedLines(plain), {
      add_classes: true,
      staffwidth: STAFF_WIDTH,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      paddingbottom: 0,
      wrap: { minSpacing: 1.4, maxSpacing: 3, preferredMeasuresPerLine: 1 },
    } as any);
    const tune = visual?.[0];
    const svg = host.querySelector("svg");
    if (!tune || !svg) throw new Error("The exercise could not be drawn.");

    const lines = Array.from(svg.querySelectorAll<SVGGElement>(".abcjs-staff-wrapper"));
    if (lines.length !== expectedBars) {
      throw new Error(`Expected one bar a line (${expectedBars}), drew ${lines.length} lines.`);
    }

    const timings: any[] = tune.setTiming(bpm, 0) ?? [];
    const msPerBar = tune.millisecondsPerMeasure(bpm);
    const svgWidth = svg.viewBox.baseVal?.width || svg.getBBox().width;

    // One frame height for every bar, from the tallest line around its staff,
    // so the staff sits at the same height in every picture.
    const boxes = lines.map((g) => g.getBBox());
    const staffYs = lines.map((g, i) => staffLineY(g) ?? boxes[i].y + boxes[i].height / 2);
    // Below: the music alone (no words) and room for a row of words under it,
    // never less than everything drawn, should the words need more.
    const music = lines.map((g, i) => musicBox(g) ?? boxes[i]);
    const above = Math.max(...boxes.map((b, i) => staffYs[i] - b.y)) + PAD;
    const below = Math.max(
      ...boxes.map((b, i) => b.y + b.height - staffYs[i]),
      ...music.map((b, i) => b.y + b.height - staffYs[i] + WORDS_BELOW),
    ) + PAD;

    const bars = await Promise.all(
      lines.map(async (_, i) => {
        const y = staffYs[i] - above;
        const h = above + below;
        const img = await svgImage(onlyLine(svg, i), 0, y, svgWidth, h);
        const notes = timings
          .filter((e) => e.type === "event" && e.line === i && e.left != null)
          .map((e) => ({
            at: Math.min(1, Math.max(0, (e.milliseconds - i * msPerBar) / msPerBar)),
            x: (e.left + (e.width ?? 0) / 2) / svgWidth,
          }));
        const staff = staffExtent(lines[i]);
        const top = notesTop(lines[i]) ?? staffYs[i] - 20;
        const staffBox = lines[i].querySelector<SVGGraphicsElement>(".abcjs-staff")?.getBBox();
        return {
          img,
          aspect: svgWidth / h,
          notes,
          musicStart: (staff?.start ?? 0) / svgWidth,
          musicEnd: (staff?.end ?? svgWidth) / svgWidth,
          staffAt: above / h,
          notesTopAt: Math.max(0, (top - y) / h),
          staffBottomAt: staffBox ? (staffBox.y + staffBox.height - y) / h : (above + 12) / h,
          dynamics: marks
            .filter((m) => m.bar === i)
            .map((m) => ({ text: m.text, x: notes[m.note]?.x ?? (staff?.start ?? 0) / svgWidth, first: m.note === 0 })),
        };
      }),
    );
    return { bars };
  } finally {
    host.remove();
  }
}

/** The drawn tune as SVG source with every line but line `i` taken out. */
function onlyLine(svg: SVGSVGElement, i: number): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll(".abcjs-staff-wrapper").forEach((g, k) => {
    if (k !== i) g.remove();
  });
  return new XMLSerializer().serializeToString(copy);
}

/** Every line runs the full width, the last one too, so bars line up across panes. */
function withStretchedLines(abc: string): string {
  return abc.replace(/^(X:.*)$/m, "$1\n%%stretchlast 1");
}

function staffLineY(g: SVGGElement): number | null {
  const staff = g.querySelector<SVGGraphicsElement>(".abcjs-staff");
  if (!staff) return null;
  const b = staff.getBBox();
  return b.y + b.height / 2;
}

/** What a line draws besides words (lyrics, annotations, dynamics, chord names): its staff, clef, notes and beams. */
function musicBox(g: SVGGElement): { x: number; y: number; width: number; height: number } | null {
  const words = ".abcjs-lyric, .abcjs-annotation, .abcjs-decoration, .abcjs-chord";
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  for (const el of g.querySelectorAll<SVGGraphicsElement>("path, text, rect, line, ellipse, circle, polygon")) {
    if (el.closest(words)) continue;
    const b = el.getBBox();
    if (!b.width && !b.height) continue;
    top = Math.min(top, b.y);
    bottom = Math.max(bottom, b.y + b.height);
    left = Math.min(left, b.x);
    right = Math.max(right, b.x + b.width);
  }
  return Number.isFinite(top) ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** The highest point of the notes in a line: their stems and beams. */
function notesTop(g: SVGGElement): number | null {
  const parts = g.querySelectorAll<SVGGraphicsElement>(".abcjs-note, .abcjs-beam-elem, .abcjs-rest");
  let top = Infinity;
  for (const el of parts) top = Math.min(top, el.getBBox().y);
  return Number.isFinite(top) ? top : null;
}

function staffExtent(g: SVGGElement): { start: number; end: number } | null {
  const staff = g.querySelector<SVGGraphicsElement>(".abcjs-staff");
  if (!staff) return null;
  const b = staff.getBBox();
  return { start: b.x, end: b.x + b.width };
}

/** The serialized SVG as an image of just the region given. */
function svgImage(source: string, x: number, y: number, w: number, h: number): Promise<HTMLImageElement> {
  const framed = source
    .replace(/<svg([^>]*?)\sviewBox="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")
    .replace(
      /<svg/,
      `<svg viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w * 2)}" height="${Math.round(h * 2)}"`,
    );
  const withNs = framed.includes('xmlns="http://www.w3.org/2000/svg"')
    ? framed
    : framed.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const url = URL.createObjectURL(new Blob([withNs], { type: "image/svg+xml" }));
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => {
      URL.revokeObjectURL(url);
      return img;
    },
    (err) => {
      URL.revokeObjectURL(url);
      throw err;
    },
  );
}
