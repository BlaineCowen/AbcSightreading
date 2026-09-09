// This will take a voicePart Array and rhythmArray and turn it into valid abc string
//  we will also need the time signature to create the correct abc string
import {
  type VoiceNote,
  type VoicePart,
  type Rhythm,
  type TimeSignature,
} from "./types";

// Interface for additional metadata needed for the ABC header
interface AbcMetadata {
  title: string;
  composer: string;
  tempo: number;
}

/**
 * Assembles the final ABC notation string from generated voice notes and parameters.
 *
 * @param allVoiceNotes - A 2D array where each sub-array holds the VoiceNote objects for a single voice part, in order (e.g., Bass, Tenor, Alto, Soprano).
 * @param voiceParts - An array of VoicePart objects containing metadata like name, clef, etc.
 * @param rhythms - The array of Rhythm objects used for generation (needed for lengths).
 * @param key - The key signature string (e.g., "C", "Gm").
 * @param timeSig - The time signature object.
 * @param metadata - Additional metadata like title, composer, tempo.
 * @returns The fully formatted ABC notation string.
 */
export function assembleAbcString(
  allVoiceNotes: VoiceNote[][],
  voiceParts: VoicePart[],
  rhythms: Rhythm[],
  key: string,
  timeSig: TimeSignature,
  metadata: AbcMetadata
): string {
  console.log("Assembling ABC string with:");
  console.log(
    "  Notes per voice:",
    allVoiceNotes.map((notes) => notes.length)
  );
  console.log(
    "  Voice parts:",
    voiceParts.map((v) => v.name)
  );
  console.log(
    "  Rhythms:",
    rhythms.map((r) => ({ name: r.name, abcValue: r.abcValue }))
  );

  let abcString = "";

  // --- Header Generation ---
  abcString += `X:1\n`;
  abcString += `T:${metadata.title}\n`;
  abcString += `C:${metadata.composer}\n`;
  abcString += `M:${timeSig.name}\n`;
  abcString += `L:1/32\n`; // Base unit is 32nd notes
  abcString += `Q:1/4=${metadata.tempo}\n`;

  // %%score directive
  let scoreDirective = "%%score";
  voiceParts.forEach((part) => {
    scoreDirective += ` ${part.smallName}`;
  });
  abcString += scoreDirective + "\n";

  // V: Voice part headers
  voiceParts.forEach((part) => {
    abcString += `V:${part.smallName} clef=${part.clef} name="${part.name}" snm="${part.smallName}"\n`;
  });

  // K: Key signature
  abcString += `K:${key}\n`;
  abcString += `% End of header, start of tune body:\n`;

  // --- Body Generation ---
  const numVoices = voiceParts.length;
  const beatsPerMeasure = timeSig.tsPerMeasure;

  // Strip leading accidental characters (^, _, =) to get the bare pitch+octave key.
  const basePitch = (noteName: string) => noteName.replace(/^[\^_=]+/, "");

  for (let voiceIndex = 0; voiceIndex < numVoices; voiceIndex++) {
    const part = voiceParts[voiceIndex];
    const partSmallName = part.smallName;
    let partString = `[V:${partSmallName}] `;
    let measureCount = 0;

    // Tracks which pitch+octave strings have been altered within the current measure.
    // Key = bare pitch string (e.g. "A,", "F"); value = the accidental type applied.
    // Cleared at every barline so accidentals don't bleed across measures.
    const measureAccidentals = new Map<string, string>();

    const notesForPart = allVoiceNotes[voiceIndex];

    for (let stepIndex = 0; stepIndex < notesForPart.length; stepIndex++) {
      const note = notesForPart[stepIndex];

      // Log the note being processed
      console.log(`ABC_ASM [V:${partSmallName}, Step:${stepIndex}]:`, {
        name: note.name,
        length: note.length,
        rest: note.rest,
        accidental: note.accidental,
      });

      if (note.rest) {
        partString += `z${note.length}`;
      } else {
        const base = basePitch(note.name);

        // Chord-symbol annotation (e.g. "I", "V7", "V/V"). The leading "^"
        // makes it a TEXT annotation positioned above the note rather than a
        // chord-symbol token — abcjs's chord-symbol parser would otherwise
        // interpret slashes as slash-chord notation (e.g. "V/V" → V over V)
        // and render only the part before the slash.
        if (note.chordSymbol) {
          partString += `"^${note.chordSymbol}"`;
        }

        if (note.accidental) {
          // Explicit accidental — record it so we can cancel it for diatonic notes later.
          measureAccidentals.set(base, note.accidental);
          partString += `${note.name}${note.length}`;
        } else {
          // Diatonic note. If the same pitch was altered earlier in this measure, abcjs
          // will carry the prior accidental. Add an explicit natural to cancel it.
          if (measureAccidentals.has(base)) {
            measureAccidentals.delete(base);
            partString += `=${base}${note.length}`;
          } else {
            partString += `${note.name}${note.length}`;
          }
        }
      }
      partString += " "; // Add space after note/rest

      measureCount += note.length;

      // Add bar line if measure is complete
      if (measureCount >= beatsPerMeasure) {
        partString += "| ";
        measureCount = measureCount % beatsPerMeasure; // Handle any overflow
        measureAccidentals.clear(); // Accidentals don't carry across barlines
      }
    }

    // Add final double bar line
    if (!partString.endsWith("| ")) {
      partString += "|]";
    } else {
      partString = partString.slice(0, -2) + "|]";
    }
    abcString += partString + "\n";
  }

  return abcString;
}
