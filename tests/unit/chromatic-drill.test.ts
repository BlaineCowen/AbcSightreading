import { expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords } from "../../src/resources/chords";
import { rhythms } from "../../src/resources/rhythms";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";
import { skipLevelFor } from "../../src/lib/uil-skips";
import { ssaLevelFor } from "../../src/lib/three-part-treble";
import { melodyFirstFor } from "../../src/lib/two-part-treble";

/**
 * Drilling a chromatic chord at a UIL level (Blaine: "I still want directors
 * to be able to practice specific chromatic notes"). The melody-first writers
 * once dropped the plan's chromatic chords for diatonic ones of their own,
 * so Focus on a chord did almost nothing at a level; now they keep them, and
 * lead the altered note: reached by step, resolved by step the way it leans,
 * never doubled. Measured, Focus on V/V: 87-100% of exercises carry fi, none
 * leapt to, one in a few hundred unresolved.
 */
const quiet = () => {};
function drill(voicing: string, levelKey: keyof typeof uilPresets, focus: string, n = 20) {
  const level = uilPresets[levelKey];
  const saved = { log: console.log, warn: console.warn };
  Object.assign(console, { log: quiet, warn: quiet });
  let carry = 0, altered = 0, leapt = 0, unresolved = 0;
  try {
    for (let k = 0; k < n; k++) {
      const ex = generateChoralExercise({
        key: "G", timeSig: TIME_SIGS["4/4"], partsObject: presetVoicing(voicing, level)!, measures: 8,
        maxSkip: level.maxSkip, bpm: 72, nctProbability: 0.1, stepwiseEighths: true, accidentalsByStep: true,
        selectedRhythms: rhythms.filter((r) => level.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest),
        chords, allowedChordNames: level.allowedChordNames, focusChord: focus, rhymeProbability: 0.7,
        partWriterLevel: level.level, ssaLevel: ssaLevelFor(levelKey), melodyFirst: melodyFirstFor(levelKey),
        skipLevel: skipLevelFor(levelKey), cadenceTypes: level.allowedCadenceTypes,
      } as any);
      let has = false;
      for (const v of ex.voiceNotes) {
        const s = v.filter((x) => !x.rest);
        for (let i = 0; i < s.length; i++) {
          if (!s[i].accidental) continue;
          has = true;
          altered++;
          const raised = s[i].accidental === "sharp" || !!s[i].wasRaised;
          if (i > 0 && Math.abs(s[i].pitchValue - s[i - 1].pitchValue) > 1) leapt++;
          let j = i + 1;
          while (j < s.length && s[j].pitchValue === s[i].pitchValue && s[j].accidental) j++;
          if (j < s.length && s[j].pitchValue - s[i].pitchValue !== (raised ? 1 : -1)) unresolved++;
        }
      }
      if (has) carry++;
    }
  } finally {
    Object.assign(console, saved);
  }
  return { carry: carry / n, altered, leapt, unresolved };
}

for (const [voicing, levelKey] of [["4 Part Mixed", "UIL 3"], ["3 Part Treble", "UIL 2"], ["2 Part Treble", "UIL 3"], ["3 Part Tenor/Bass", "UIL 4"]] as const) {
  test(`Focus on V/V at ${levelKey}, ${voicing}: fi is there, reached and left by step`, () => {
    const r = drill(voicing, levelKey, "5/5");
    expect(r.carry).toBeGreaterThan(0.7);
    expect(r.leapt).toBe(0);
    expect(r.unresolved / r.altered).toBeLessThan(0.05);
  }, 120_000);
}
