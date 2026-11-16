// The files the editor writes, as bytes: WAV, MIDI and ZIP. A pure module, so Node checks can read them back.

/** 24-bit PCM WAV of one or more channels (Float32Arrays of one length). */
export function wavBytes(chans, sr) {
  const n = chans[0].length, k = chans.length, b = new DataView(new ArrayBuffer(44 + 3 * n * k));
  const s = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); b.setUint32(4, 36 + 3 * n * k, true); s(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true);
  b.setUint16(22, k, true); b.setUint32(24, sr, true); b.setUint32(28, 3 * sr * k, true); b.setUint16(32, 3 * k, true); b.setUint16(34, 24, true);
  s(36, "data"); b.setUint32(40, 3 * n * k, true);
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < k; c++, o += 3) {
    const v = Math.round(Math.max(-1, Math.min(1, chans[c][i])) * 8388607);
    b.setUint8(o, v & 255); b.setUint8(o + 1, (v >> 8) & 255); b.setUint8(o + 2, (v >> 16) & 255);
  }
  return new Uint8Array(b.buffer);
}

/**
 * A type-1 MIDI file: a tempo track, then one track per entry of `tracks` ({name, channel, program?, notes:
 * [{t0, t1, midi, vel}]}, times in s), named, on its channel. At `bpm` (a quarter note a beat, 4/4), so a
 * notation program or DAW set to that tempo lines the bars up; the notes keep their times in seconds either way.
 */
export function midiFile(tracks, { bpm = 120, ppq = 480 } = {}) {
  const vlq = (v) => { const o = [v & 127]; while ((v >>= 7)) o.unshift((v & 127) | 128); return o; };
  const u32 = (v) => [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const text = (type, t) => { const b = [...new TextEncoder().encode(t)]; return [0xff, type, ...vlq(b.length), ...b]; };
  const chunk = (body) => [..."MTrk"].map((c) => c.charCodeAt(0)).concat(u32(body.length), body);
  const tick = (t) => Math.max(0, Math.round((t * ppq * bpm) / 60));
  const us = Math.round(60e6 / bpm);
  const tempo = [0, ...text(0x03, "Tempo"), 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0];
  const out = [..."MThd"].map((c) => c.charCodeAt(0)).concat(u32(6), [0, 1, (tracks.length + 1) >> 8, (tracks.length + 1) & 255, ppq >> 8, ppq & 255], chunk(tempo));
  for (const tr of tracks) {
    const ch = tr.channel & 15, ev = [];
    for (const n of tr.notes) {
      const a = tick(n.t0), b = Math.max(a + 1, tick(n.t1));
      ev.push([a, 1, n.midi, n.vel], [b, 0, n.midi, 0]);
    }
    ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]); // note-offs before note-ons at the same tick
    const body = [0, ...text(0x03, tr.name)];
    if (tr.program !== undefined) body.push(0, 0xc0 | ch, tr.program & 127);
    let last = 0;
    for (const [t, on, m, v] of ev) { body.push(...vlq(t - last), (on ? 0x90 : 0x80) | ch, m, v); last = t; }
    body.push(0, 0xff, 0x2f, 0);
    out.push(...chunk(body));
  }
  return new Uint8Array(out);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** A ZIP of files ({name, data: Uint8Array}), stored without compression (audio hardly compresses). */
export function zipFile(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); // UTF-8 names
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), name, f.data); central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

/** Equal-power pan of a mono signal at p (-1 left .. 1 right): [left gain, right gain]. */
export const pan = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
