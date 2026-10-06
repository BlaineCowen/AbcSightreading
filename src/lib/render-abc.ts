import abcjs from "abcjs";

/**
 * An exercise rendered to sound, once, as the page plays it: abcjs's synth
 * at `bpm`, with the page's soundfont and playback transpose. The buffer
 * starts on the first downbeat (no count-in). Drawn off screen because
 * abcjs's synth reads a drawn tune. Used by the play-along video's guide
 * (play-along/audio.ts) and by Hear your take (grade-playback.ts).
 */
export async function renderAbcBuffer(
  ctx: BaseAudioContext,
  abc: string,
  o: { bpm: number; volumeMultiplier?: number; transpose?: number },
): Promise<AudioBuffer | null> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:800px;visibility:hidden";
  document.body.appendChild(host);
  try {
    const tune = abcjs.renderAbc(host, abc)[0];
    const synth = new abcjs.synth.CreateSynth();
    await synth.init({
      audioContext: ctx,
      visualObj: tune,
      options: { qpm: o.bpm, soundFontUrl: "/api/soundfont/", soundFontVolumeMultiplier: o.volumeMultiplier ?? 1, midiTranspose: o.transpose ?? 0 },
    } as any);
    await synth.prime();
    return synth.getAudioBuffer() ?? null;
  } finally {
    host.remove();
  }
}
