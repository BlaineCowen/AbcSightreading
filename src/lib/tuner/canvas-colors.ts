/**
 * The site's theme colours for canvas drawing. A canvas cannot use CSS
 * variables, and reading them with getComputedStyle every animation frame is
 * slow, so they are read once and again whenever the theme changes (the
 * navbar's toggle sets data-theme on <html>; the OS setting can change too).
 *
 * The pitch colours - in tune, close, off - stay fixed: green, amber and red
 * mean the same thing on either ground.
 */

export interface CanvasColors {
  ground: string;
  panel: string;
  raise: string;
  track: string;
  hairline: string;
  ink: string;
  ink2: string;
  muted: string;
  faint: string;
  action: string;
  actionFg: string;
  tint: string;
  dark: boolean;
}

export const IN_TUNE = "#22c55e";
export const CLOSE = "#f59e0b";
export const OFF = "#ef4444";
/** The colour for a cents deviation: within 10, within 25, further. */
export const centsColor = (c: number) =>
  Math.abs(c) <= 10 ? IN_TUNE : Math.abs(c) <= 25 ? CLOSE : OFF;

function read(): CanvasColors {
  // The tokens are defined on .sr-themable (the body of themable pages).
  const el = document.querySelector(".sr-themable") ?? document.body;
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const ground = v("--sr-ground", "#e6e9ee");
  return {
    ground,
    panel: v("--sr-panel", "#f4f6f8"),
    raise: v("--sr-raise", "#ffffff"),
    track: v("--sr-track", "#e2e6eb"),
    hairline: v("--sr-hairline", "#d4dae1"),
    ink: v("--sr-ink", "#161b22"),
    ink2: v("--sr-ink-2", "#39424d"),
    muted: v("--sr-muted", "#5f6874"),
    faint: v("--sr-faint", "#8a929c"),
    action: v("--sr-action", "#17566b"),
    actionFg: v("--sr-action-fg", "#17566b"),
    tint: v("--sr-tint", "#d2d9e1"),
    dark: css.colorScheme.includes("dark"),
  };
}

let current: CanvasColors | null = null;
const listeners = new Set<() => void>();
let watching = false;

function watch() {
  if (watching) return;
  watching = true;
  const refresh = () => {
    current = read();
    listeners.forEach((fn) => fn());
  };
  new MutationObserver(refresh).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refresh);
}

/** The colours now. Cheap: cached until the theme changes. */
export function canvasColors(): CanvasColors {
  watch();
  return (current ??= read());
}

/** Call `fn` when the theme changes. Returns the unsubscribe. */
export function onThemeChange(fn: () => void): () => void {
  watch();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
