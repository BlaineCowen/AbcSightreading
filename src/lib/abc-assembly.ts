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
    "  Voice notes:",
    voiceParts.map((v) => v.chordNotes.length)
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
    let middleString = "";
    if (part.clef === "treble-8") {
      middleString = "octave=1";
    }
    abcString += `V:${part.smallName} clef=${part.clef} name="${part.name}" snm="${part.smallName}" ${middleString}\n`;
  });

  // K: Key signature
  abcString += `K:${key}\n`;
  abcString += `% End of header, start of tune body:\n`;

  // --- Body Generation ---
  const numVoices = voiceParts.length;
  const beatsPerMeasure = timeSig.tsPerMeasure;

  for (let voiceIndex = 0; voiceIndex < numVoices; voiceIndex++) {
    const part = voiceParts[voiceIndex];
    const partSmallName = part.smallName;
    let partString = `[V:${partSmallName}] `;
    let measureCount = 0;

    for (let stepIndex = 0; stepIndex < part.chordNotes.length; stepIndex++) {
      const note = part.chordNotes[stepIndex];

      if (note.rest) {
        partString += `z${note.length}`;
      } else {
        // Add accidental if present
        if (note.accidental === "sharp") {
          partString += "^";
        } else if (note.accidental === "flat") {
          partString += "_";
        } else if (note.accidental === "natural") {
          partString += "=";
        } else if (note.accidental === "double-sharp") {
          partString += "^^";
        } else if (note.accidental === "double-flat") {
          partString += "__";
        }
        partString += `${note.name}${note.length}`;
      }
      partString += " "; // Add space after note/rest

      measureCount += note.length;

      // Add bar line if measure is complete
      if (measureCount >= beatsPerMeasure) {
        partString += "| ";
        measureCount = measureCount % beatsPerMeasure; // Handle any overflow
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
