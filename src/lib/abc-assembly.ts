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
  // Implementation will go here
  let abcString = "";

  // --- Header Generation ---
  abcString += `X:1\n`;
  abcString += `T:${metadata.title}\n`;
  abcString += `C:${metadata.composer}\n`;
  abcString += `M:${timeSig.name}\n`;
  abcString += `L:1/8\n`; // Assuming 1/8 notes are the base unit for length numbers
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
    // Handle octave shifting clefs if necessary based on your ClefType enum
    // Example: if (part.clef === ClefType.TrebleOctaveDown) { middleString = "octave=-1"; }
    // Adjust based on your actual clef handling
    abcString += `V:${part.smallName} clef=${part.clef} name="${part.name}" snm="${part.smallName}" ${middleString}\n`;
  });

  // K: Key signature
  abcString += `K:${key}\n`;
  abcString += `% End of header, start of tune body:\n`;

  // --- Body Generation ---
  const numSteps = rhythms.length;
  const numVoices = voiceParts.length;
  let measureBeatCount = 0;
  const beatsPerMeasure = timeSig.tsPerMeasure / 4; // Assuming L:1/8, so tsPerMeasure is 32nds -> divide by 4 for eighths

  for (let voiceIndex = 0; voiceIndex < numVoices; voiceIndex++) {
    const partSmallName = voiceParts[voiceIndex].smallName;
    let partString = `[V:${partSmallName}] `;
    measureBeatCount = 0;

    for (let stepIndex = 0; stepIndex < numSteps; stepIndex++) {
      const note = allVoiceNotes[voiceIndex][stepIndex];
      const rhythm = rhythms[stepIndex]; // Get corresponding rhythm
      const noteLength = rhythm.totalValue; // Use totalValue from rhythm (in eighths if L:1/8)

      if (note.rest) {
        partString += `z${noteLength}`;
      } else {
        partString += `${note.name}${noteLength}`;
      }
      partString += " "; // Add space after note/rest

      measureBeatCount += noteLength;

      // Add bar line if measure is complete
      if (measureBeatCount >= beatsPerMeasure) {
        partString += "| ";
        measureBeatCount = 0; // Reset measure count
      }
    }
    // Add final bar line if needed (might need adjustment based on exact beat counts)
    if (!partString.endsWith("| ")) {
      partString += "|]"; // End of tune marker
    }
    abcString += partString + "\n";
  }

  return abcString;
}
