/// <reference lib="webworker" />
import { instantiatePolyPitch, type PolyPitch } from "./polypitch";
import { measureWindow, type WindowJob } from "./measure";

/**
 * A separation worker for the Ensemble tab: the page posts the compiled
 * module once (no second download), then windows to measure. Separation is
 * the slow part (0.2-1 s a six-second window) and windows are independent, so
 * several of these share a take (OmniPitch's engine pool).
 */

let pp: Promise<PolyPitch> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { kind: "init"; module: WebAssembly.Module } | { kind: "window"; id: number; job: WindowJob };
  if (msg.kind === "init") {
    pp = instantiatePolyPitch(msg.module);
    try {
      await pp;
      self.postMessage({ kind: "ready" });
    } catch (err) {
      self.postMessage({ kind: "error", message: String(err) });
    }
    return;
  }
  try {
    if (!pp) throw new Error("not initialised");
    const out = measureWindow(await pp, msg.job);
    self.postMessage({ kind: "done", id: msg.id, out }, out.map((o) => o.signal.buffer) as Transferable[]);
  } catch (err) {
    self.postMessage({ kind: "failed", id: msg.id, message: String(err) });
  }
};
