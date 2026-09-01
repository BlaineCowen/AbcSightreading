import type { APIRoute } from "astro";

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

/** Only ever proxy `<instrument>-mp3/<note>.mp3` — no traversal, no other hosts. */
const SAFE_PATH = /^[a-z0-9_]+-mp3\/[A-Ga-g][b#s]?-?\d\.mp3$/;

export const GET: APIRoute = async ({ params }) => {
  const path = params.path ?? "";

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
