import { writable, type Readable } from "svelte/store";

/**
 * Full screen on the practice pages: the score alone, as wide as the screen,
 * still scrolling with the music, and the playback bar (larger, with the
 * annotations in it) - for a TV or a projector across the room. The browser's
 * full screen when it has one (Esc leaves it, and so does this), otherwise the
 * same view inside the window (iPhone Safari has none): `html.sr-focus`
 * hides the rest (globals.css). F toggles it, Esc leaves it.
 */
export function createFullscreen(): { active: Readable<boolean>; toggle: () => void; exit: () => void; destroy: () => void } {
  const active = writable(false);
  let on = false;
  const root = document.documentElement;
  // The score is drawn to its width: widened, it redraws bigger.
  const relayout = () => requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));

  const enter = () => {
    if (on) return;
    on = true;
    active.set(true);
    root.classList.add("sr-focus");
    window.scrollTo({ top: 0 });
    root.requestFullscreen?.().catch(() => {});
    relayout();
  };
  const exit = () => {
    if (!on) return;
    on = false;
    active.set(false);
    root.classList.remove("sr-focus");
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    relayout();
  };
  const toggle = () => (on ? exit() : enter());

  // Esc in the browser's full screen ends it without a keydown: follow it out.
  const onChange = () => {
    if (on && !document.fullscreenElement) exit();
  };
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Esc with a drop-up open closes the menu (DropUp), not full screen.
    if (e.key === "Escape" && on) {
      if (!document.querySelector(".sr-dropup-menu")) exit();
    }
    else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggle();
    }
  };
  document.addEventListener("fullscreenchange", onChange);
  window.addEventListener("keydown", onKey);
  return {
    active,
    toggle,
    exit,
    destroy: () => {
      exit();
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    },
  };
}
