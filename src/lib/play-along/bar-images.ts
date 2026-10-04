/**
 * The bars of a play-along video as pictures the canvas can draw, and where
 * each note sits in its picture so the cursor can find it.
 *
 * The whole tune is drawn once, off screen, one bar to a line, so ties,
 * beams and rhythm syllables come out exactly as abcjs draws them on the
 * page. Then each line becomes its own SVG image by pointing a copy's viewBox
 * at it: an image a bar, vector to the last, so it is sharp at 1080p whatever
 * the screen. One tall raster would be past a browser's canvas limit at 70
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
}

export interface RenderedBars {
  bars: BarImage[];
}

/** Narrower draws bigger once the bar is fitted to its card: at 420 the notes fill it. */
const STAFF_WIDTH = 420;
/** Room above and below the staff line in each picture, in SVG units. */
const PAD = 6;

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
    const visual = abcjs.renderAbc(host, withStretchedLines(abc), {
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
    const above = Math.max(...boxes.map((b, i) => staffYs[i] - b.y)) + PAD;
    const below = Math.max(...boxes.map((b, i) => b.y + b.height - staffYs[i])) + PAD;

    const source = new XMLSerializer().serializeToString(svg);
    const bars = await Promise.all(
      lines.map(async (_, i) => {
        const y = staffYs[i] - above;
        const h = above + below;
        const img = await svgImage(source, 0, y, svgWidth, h);
        const notes = timings
          .filter((e) => e.type === "event" && e.line === i && e.left != null)
          .map((e) => ({
            at: Math.min(1, Math.max(0, (e.milliseconds - i * msPerBar) / msPerBar)),
            x: (e.left + (e.width ?? 0) / 2) / svgWidth,
          }));
        const staff = staffExtent(lines[i]);
        const top = notesTop(lines[i]) ?? staffYs[i] - 20;
        return {
          img,
          aspect: svgWidth / h,
          notes,
          musicStart: (staff?.start ?? 0) / svgWidth,
          musicEnd: (staff?.end ?? svgWidth) / svgWidth,
          staffAt: above / h,
          notesTopAt: Math.max(0, (top - y) / h),
        };
      }),
    );
    return { bars };
  } finally {
    host.remove();
  }
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
