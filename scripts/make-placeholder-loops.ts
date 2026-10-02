/**
 * Writes the placeholder backing loops in public/backing/: a plain synthesized
 * kick, snare and hi-hat groove, one per meter, so play-along videos can be
 * tried before real loops are added. Replace them with real loops in
 * src/lib/play-along/backing-tracks.ts; delete these then.
 *
 *   bun run scripts/make-placeholder-loops.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { beatsOf, isCompound } from "../src/lib/meter";

const RATE = 22050;
const BARS = 4;

const loops = [
  { id: "placeholder-4-4", meter: "4/4", bpm: 100 },
  { id: "placeholder-3-4", meter: "3/4", bpm: 96 },
  { id: "placeholder-2-4", meter: "2/4", bpm: 100 },
  { id: "placeholder-6-8", meter: "6/8", bpm: 60 },
];

function kick(out: Float32Array, at: number, gain = 0.9) {
  const len = Math.floor(0.25 * RATE);
  let phase = 0;
  for (let i = 0; i < len && at + i < out.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * (50 + 90 * Math.exp(-t * 30))) / RATE;
    out[at + i] += gain * Math.sin(phase) * Math.exp(-t * 12);
  }
}
function noise(out: Float32Array, at: number, seconds: number, decay: number, gain: number) {
  const len = Math.floor(seconds * RATE);
  let prev = 0;
  for (let i = 0; i < len && at + i < out.length; i++) {
    const w = Math.random() * 2 - 1;
    const hp = w - prev; // a crude high-pass, so it hisses rather than rumbles
    prev = w;
    out[at + i] += gain * hp * Math.exp(-(i / RATE) * decay);
  }
}

function groove(meter: string, bpm: number): Float32Array {
  const beats = beatsOf(meter);
  const beat = 60 / bpm;
  const sub = isCompound(meter) ? 3 : 2;
  const out = new Float32Array(Math.round(BARS * beats * beat * RATE));
  for (let bar = 0; bar < BARS; bar++) {
    for (let b = 0; b < beats; b++) {
      const at = Math.round(((bar * beats + b) * beat) * RATE);
      // Kick on the strong beats, snare on the others (on 2 in 2/4, 3/4 and 6/8 too).
      const strong = b === 0 || (beats === 4 && b === 2);
      if (strong) kick(out, at);
      else noise(out, at, 0.18, 22, 0.35);
      for (let s = 0; s < sub; s++) noise(out, at + Math.round((s * beat * RATE) / sub), 0.05, 90, s === 0 ? 0.18 : 0.1);
    }
  }
  return out;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

mkdirSync("public/backing", { recursive: true });
for (const l of loops) {
  writeFileSync(`public/backing/${l.id}.wav`, wav(groove(l.meter, l.bpm)));
  console.log(`public/backing/${l.id}.wav  ${l.meter} at ${l.bpm}, ${BARS} bars`);
}
