/**
 * A pop-up over the page, on the browser's own <dialog> (Modern Web Guidance,
 * `dialog`): `use:modal={{ onClose }}` on a <dialog class="sr-modal ..."> that
 * a Svelte {#if} shows. It opens with showModal(), which the browser makes
 * modal for us: the page behind goes inert, focus stays inside, the dialog
 * draws above everything (the top layer, no z-index), Esc and the phone's
 * back gesture close it, and focus goes back to the button that opened it
 * (by hand in destroy, as Svelte removes the dialog first).
 *
 * The dialog is the whole screen and draws the dimmed backdrop itself (the
 * scrim class each component already had), so a tap on the dim part is a
 * tap on the <dialog> itself: `lightDismiss` closes on that, in every browser
 * (`closedby="any"` has no Safari yet). The component closes by setting its
 * own flag false; onClose is how Esc and the scrim tell it to.
 *
 * No role="dialog", aria-modal, focus trap or Esc handler on these: the
 * native modal brings them. Name each with aria-labelledby or aria-label.
 */
export interface ModalOptions {
  onClose: () => void;
  /** A tap on the backdrop closes it (default true). */
  lightDismiss?: boolean;
  /** Any tap at all closes it, as on the projector join board. */
  tapAnywhere?: boolean;
}

export function modal(node: HTMLDialogElement, options: ModalOptions) {
  let opts = options;
  let gone = false;
  // A press that starts inside the card and ends on the backdrop (selecting
  // text) is not a tap on the backdrop.
  let pressedOnBackdrop = false;

  const onCancel = (e: Event) => {
    // Svelte's {#if} decides when it goes; the dialog must not close itself.
    e.preventDefault();
    opts.onClose();
  };
  const onClose = () => {
    // Closed by the browser after all (a repeated Esc it would not let us
    // cancel): tell the component.
    if (!gone) opts.onClose();
  };
  const onPointerDown = (e: PointerEvent) => {
    pressedOnBackdrop = e.target === node;
  };
  const onClick = (e: MouseEvent) => {
    if (opts.tapAnywhere) return opts.onClose();
    if (opts.lightDismiss !== false && pressedOnBackdrop && e.target === node) opts.onClose();
  };

  // Where focus was: Svelte takes the dialog out of the page before destroy
  // runs, too late for the browser's own hand-back, so it is done here.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  node.addEventListener("cancel", onCancel);
  node.addEventListener("close", onClose);
  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("click", onClick);
  if (!node.open) node.showModal();

  return {
    update(next: ModalOptions) {
      opts = next;
    },
    destroy() {
      gone = true;
      node.removeEventListener("cancel", onCancel);
      node.removeEventListener("close", onClose);
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("click", onClick);
      if (node.open) node.close();
      const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    },
  };
}
