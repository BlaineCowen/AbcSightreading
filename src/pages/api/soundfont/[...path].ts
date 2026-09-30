import type { APIRoute } from "astro";
import { sampleForDrumNote, sampleUrl } from "../../../lib/tuner/click-sounds";

/**
 * Same-origin proxy for the abcjs instrument samples.
 *
 * abcjs fetches its notes straight from paulrosen.github.io, which locked-down
 * corporate networks block. Because abcjs omits any note whose sample failed to
 * load without raising, a blocked fetch produces a correctly sized but silent
 * AudioBuffer -- playback looks fine and only the metronome (a local oscillator)
 * is audible. Serving the samples from our own origin keeps the browser off a
 * filtered domain; the server-side fetch is not subject to the client's filter.
 *
 * abcjs builds URLs as `<soundFontUrl><instrument>-mp3/<Note>.mp3`, so the path
 * arrives here as e.g. "acoustic_grand_piano-mp3/F4.mp3".
 */
const UPSTREAM = "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/";

/** Only ever proxy `<instrument>-mp3/<note>.mp3` - no traversal, no other hosts. */
const SAFE_PATH = /^[a-z0-9_]+-mp3\/[A-Ga-g][b#s]?-?\d\.mp3$/;

/** abcjs's note names, as it asks for them: C4, Db4 ... */
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
function midiOf(note: string): number | null {
  const m = /^([A-G]b?)(-?\d)$/.exec(note);
  if (!m) return null;
  const i = NOTE_NAMES.indexOf(m[1]);
  return i < 0 ? null : (Number(m[2]) + 1) * 12 + i;
}

export const GET: APIRoute = async ({ params, url }) => {
  const path = params.path ?? "";

  // The metronome's own samples, which the Choral click plays as drum notes
  // of their own (click-sounds.ts drumNoteFor): sent to the file in
  // public/clicks rather than to the General MIDI drum of that name.
  const drum = /^percussion-mp3\/([A-Gb\d-]+)\.mp3$/.exec(path);
  const sample = drum ? sampleForDrumNote(midiOf(drum[1]) ?? -1) : null;
  if (sample) {
    return new Response(null, {
      status: 302,
      headers: { Location: new URL(sampleUrl(sample), url).toString(), "Cache-Control": "public, max-age=86400" },
    });
  }

  if (!SAFE_PATH.test(path)) {
    return new Response("Not found", { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM + path);
  } catch (err) {
    console.error("soundfont proxy: upstream fetch failed", path, err);
    return new Response("Upstream unavailable", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response("Not found", { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      // The samples are immutable, so let the CDN and the browser keep them.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
