/**
 * Show me (FailureBanner): the settings pill brought into view and opened,
 * then the control inside it that is in the way (`data-fix="<target>"`)
 * scrolled to and flashed once.
 */
export function showSetting(setbar: HTMLElement | undefined, pill: string, target: string | undefined, isOpen: boolean) {
  const el = setbar?.querySelector<HTMLElement>(`[data-pill="${pill}"]`);
  if (!el) return;
  if (!isOpen) el.click();
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  if (!target) return;
  // The popover draws on the next frame or two.
  setTimeout(() => {
    const spot = document.querySelector<HTMLElement>(`[data-fix="${CSS.escape(target)}"]`);
    if (!spot) return;
    spot.scrollIntoView({ block: "center", behavior: "smooth" });
    spot.classList.remove("sr-fix-flash");
    void spot.offsetWidth;
    spot.classList.add("sr-fix-flash");
    setTimeout(() => spot.classList.remove("sr-fix-flash"), 2600);
  }, 120);
}
