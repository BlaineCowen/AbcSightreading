// The editing engine in the browser: tools/edit_server.py's API answered from polypitch.wasm (built with the
// `vocoder` feature) in this worker, in the server's formats, so the page needs no server. The page posts
// {id, path, body} (body: the JSON text it would send; for "api/upload", {samples, sr}) and gets back
// {id, status, json | bin | text}. Requests queue here: a press, hover or edit of one note jumps ahead of the
// background preparation of whole groups.
import { loadPolyPitch } from "./polypitch.js";

const pp = await loadPolyPitch("polypitch-v1.wasm");
let session = null, sr = 44100;
const urgent = [], background = [];
let running = false;

// tools/note_edit.py note_windows (TAIL, REGION_PAD, WINDOW): groups of notes one fit separates, so progress
// and priority can be planned per group as with the server's /api/plan.
const TAIL = 0.4, REGION_PAD = 1.0, WINDOW = 6.0;
function plan(notes) {
  const span = (j) => [Math.max(0, notes[j][0] - REGION_PAD), notes[j][1] + TAIL + REGION_PAD];
  let left = notes.map((_, j) => j).sort((p, q) => span(p)[0] - span(q)[0]);
  const out = [];
  while (left.length) {
    const a = span(left[0])[0], b = Math.max(a + WINDOW, span(left[0])[1]);
    out.push(left.filter((j) => span(j)[1] <= b));
    left = left.filter((j) => span(j)[1] > b);
  }
  return out;
}

// The server's clip format: int32 first sample, int32 length, float32 scale, then int16 samples x scale / 32767.
function clipBytes({ start, signal }) {
  let scale = 0;
  for (const v of signal) scale = Math.max(scale, Math.abs(v));
  scale = scale || 1;
  const b = new ArrayBuffer(12 + 2 * signal.length), h = new DataView(b), s = new Int16Array(b, 12);
  h.setInt32(0, start, true); h.setInt32(4, signal.length, true); h.setFloat32(8, scale, true);
  for (let i = 0; i < signal.length; i++) s[i] = Math.round((signal[i] / scale) * 32767);
  return b;
}
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0; for (const p of parts) { out.set(new Uint8Array(p), o); o += p.byteLength; }
  return out.buffer;
};

function handle(path, body) {
  if (path === "api/upload") {
    sr = body.sr; session = pp.session(body.samples, sr);
    if (!session) throw new Error("this polypitch.wasm was built without the vocoder feature");
    return { json: { id: "local" } };
  }
  if (!session) return { status: 410, text: "no recording loaded" };
  const req = JSON.parse(body), notes = req.notes;
  const delta = (j, semis, mod, drift, dt, gain) => clipBytes(session.delta(notes, j, { semis, mod, drift, dt, gain }));
  switch (path) {
    case "api/plan": return { json: plan(notes) };
    case "api/prepare": session.prepare(notes, "js" in req ? req.js : [req.j]); return { status: 204 };
    case "api/note": return { bin: delta(req.j, req.semis, req.mod ?? 1, req.drift ?? 1, req.dt ?? 0, req.gain ?? 1) };
    case "api/notes": {
      const n = new ArrayBuffer(4); new DataView(n).setInt32(0, req.edits.length, true);
      return { bin: concat([n, ...req.edits.map((e) => delta(...e))]) };
    }
    case "api/solo": return { bin: clipBytes(session.solo(notes, req.j)) };
    case "api/curve": { // as the server: centre, drift and modulation in cents, cut to where the note is audible
      const { curve } = session.solo(notes, req.j), n = curve.times.length;
      const { center, drift, mod } = pp.splitPitch(curve);
      let top = 0; for (const v of curve.weight) top = Math.max(top, v);
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) if (curve.weight[i] > top * 0.03) { if (b === 0) a = i; b = i + 1; }
      const r1 = (v) => Math.round(v * 10) / 10;
      return { json: { t0: n ? curve.times[a] : 0, dt: n > 1 ? curve.times[1] - curve.times[0] : 0, center: Math.round(center * 100) / 100,
        drift: Array.from(drift.subarray(a, b), r1), mod: Array.from(mod.subarray(a, b), r1) } };
    }
  }
  return { status: 404, text: "not found" };
}

function pump() {
  if (running) return;
  const m = urgent.shift() || background.shift();
  if (!m) return;
  running = true;
  let r;
  try { r = handle(m.path, m.body); } catch (e) { r = { status: 400, text: `${e.name}: ${e.message}` }; }
  postMessage({ id: m.id, status: r.status || 200, ...r }, r.bin ? [r.bin] : []);
  running = false;
  setTimeout(pump, 0); // let new messages queue first, so an urgent one can go next
}

onmessage = ({ data: m }) => {
  // whole-group preparation waits behind everything else
  (m.path === "api/prepare" && m.body.includes('"js"') ? background : urgent).push(m);
  pump();
};
postMessage({ ready: true });
