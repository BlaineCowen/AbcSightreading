// THIS FILE IS WORKING DONT TOUCH
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";
import {
  type Note,
  type Chord,
  type ChordPossibility,
  ChordType,
  type VoicePart,
  type VoiceNote,
  type Rhythm,
} from "./types";
import { getDiatonicDegree } from "./prep-params";

// Remove duplicate interface declarations since they're imported
export {
  type Note,
  type Chord,
  type ChordPossibility,
  ChordType,
  type VoicePart,
  type VoiceNote,
  type Rhythm,
} from "./types";

/**
 * Generates a chord progression and corresponding bass line.
 */
export function generateChordProgression(
  chords: Chord[],
  length: number,
  bassRange: [number, number],
  maxSkip: number,
  key: string
): { progression: Chord[]; bassLine: Note[] } {
  console.log("\n=== Starting Chord Progression Generation ===");
  console.log("Chords:", chords.length);
  console.log("Length:", length);
  console.log("Bass Range:", JSON.stringify(bassRange));
  console.log("Max Skip:", maxSkip);
  console.log("Key:", key);

  // Validate inputs
  if (!chords || chords.length === 0) {
    throw new Error("No chords provided for progression generation.");
  }

  // Find tonic chords
  const tonicChords = chords.filter((c) => c.type === "tonic");
  if (tonicChords.length === 0) {
    throw new Error("No tonic chords found in available chords.");
  }

  const progression: Chord[] = [];
  const bassLine: Note[] = [];
  const maxAttempts = 100; // Prevent infinite loops

  // Step 1: Generate initial chord and bass note
  console.log("\n--- Step 1: Generating Initial Chord ---");
  let firstChordAttempts = 0;
  let firstBassNote: Note | null = null;
  let firstChord: Chord | null = null;

  while (!firstBassNote && firstChordAttempts < maxAttempts) {
    firstChordAttempts++;
    console.log(`\nAttempt ${firstChordAttempts} for first chord`);

    // Pick a random tonic chord
    firstChord = tonicChords[Math.floor(Math.random() * tonicChords.length)];
    console.log("Selected tonic chord:", firstChord);

    firstBassNote = findValidBassNote(
      firstChord,
      bassRange,
      undefined,
      maxSkip,
      key
    );
    if (!firstBassNote) {
      console.log("No valid bass note found for this chord, retrying...");
    }
  }

  if (!firstChord || !firstBassNote) {
    throw new Error(
      `Failed to find valid first chord and bass note after ${maxAttempts} attempts`
    );
  }

  progression.push(firstChord);
  bassLine.push(firstBassNote);
  console.log("Successfully added first chord:", firstChord.name);
  console.log("With bass note:", firstBassNote);

  // Step 2: Generate remaining chords and bass notes
  console.log("\n--- Step 2: Generating Remaining Chords ---");
  for (let i = 1; i < length; i++) {
    console.log(`\nGenerating chord ${i + 1} of ${length}`);
    const prevChord = progression[i - 1];
    const prevBassNote = bassLine[i - 1];
    const isLast = i === length - 1;
    const isPenultimate = i === length - 2;

    let attempts = 0;
    let validChordFound = false;
    let currentChord: Chord | null = null;
    let currentBassNote: Note | null = null;

    while (!validChordFound && attempts < maxAttempts) {
      attempts++;
      console.log(`\nAttempt ${attempts} for position ${i + 1}`);

      // Handle special positions
      if (isLast) {
        // Last chord must be tonic
        currentChord =
          tonicChords[Math.floor(Math.random() * tonicChords.length)];
      } else if (isPenultimate) {
        // For penultimate position, try simple dominant first
        const possibleNextChords = chords.filter((c) =>
          prevChord.nextChordPossibilities.some((p) => p.name === c.name)
        );

        console.log("Previous chord:", prevChord.name);
        console.log(
          "Possible next chords for penultimate:",
          possibleNextChords.map((c) => ({ name: c.name, type: c.type }))
        );

        // First try to find a simple dominant chord (name "5")
        const dominantChords = possibleNextChords.filter(
          (c) => c.type === "dominant"
        );
        const simpleV = dominantChords.find((c) => c.name === "5");

        if (simpleV) {
          console.log(
            "Found simple dominant (V) chord for penultimate position"
          );
          currentChord = simpleV;
        } else {
          // If no simple dominant, look for dominant inversions
          const dominantInversions = dominantChords.filter((c) =>
            c.name.startsWith("5-")
          );
          if (dominantInversions.length > 0) {
            console.log("Using dominant inversion for penultimate position");
            currentChord =
              dominantInversions[
                Math.floor(Math.random() * dominantInversions.length)
              ];
          } else {
            // If no dominants available at all, try any chord that can go to tonic
            console.log(
              "No dominant chords available, checking for chords that can lead to tonic"
            );
            const chordsToTonic = possibleNextChords.filter((c) =>
              c.nextChordPossibilities.some((p) =>
                tonicChords.some((tc) => tc.name === p.name)
              )
            );

            if (chordsToTonic.length > 0) {
              const totalWeight = chordsToTonic.reduce(
                (sum, c) => sum + c.baseMultiplier,
                0
              );
              let random = Math.random() * totalWeight;
              for (const nextChord of chordsToTonic) {
                random -= nextChord.baseMultiplier;
                if (random <= 0) {
                  currentChord = nextChord;
                  break;
                }
              }
              if (!currentChord) currentChord = chordsToTonic[0];
            } else {
              console.log("No valid next chords found, retrying...");
              continue;
            }
          }
        }
      } else {
        // Standard progression for other positions
        const possibleNextChords = chords.filter((c) =>
          prevChord.nextChordPossibilities.some((p) => p.name === c.name)
        );

        console.log("Previous chord:", prevChord.name);
        console.log(
          "Possible next chords:",
          possibleNextChords.map((c) => c.name)
        );

        if (possibleNextChords.length === 0) {
          console.log("No valid next chords found, retrying...");
          continue;
        }

        // Pick a random chord from possibilities, weighted by baseMultiplier
        const totalWeight = possibleNextChords.reduce(
          (sum, c) => sum + c.baseMultiplier,
          0
        );
        let random = Math.random() * totalWeight;

        for (const nextChord of possibleNextChords) {
          random -= nextChord.baseMultiplier;
          if (random <= 0) {
            currentChord = nextChord;
            break;
          }
        }
        if (!currentChord) currentChord = possibleNextChords[0];
      }

      console.log("Selected chord:", currentChord.name);

      // Try to find valid bass note
      currentBassNote = findValidBassNote(
        currentChord,
        bassRange,
        prevBassNote,
        maxSkip,
        key
      );

      if (currentBassNote) {
        console.log("Found valid bass note:", currentBassNote);
        progression.push(currentChord);
        bassLine.push(currentBassNote);
        validChordFound = true;
      } else {
        console.log("No valid bass note found for this chord, retrying...");
      }
    }

    if (!validChordFound) {
      throw new Error(
        `Could not find valid chord and bass note at position ${
          i + 1
        } after ${maxAttempts} attempts`
      );
    }

    console.log(`Successfully added chord ${i + 1}:`, currentChord!.name);
    console.log("With bass note:", currentBassNote);
  }

  console.log("\n=== Final Progression ===");
  console.log("Chords:", progression.map((c) => c.name).join(" "));
  console.log("Bass line:", bassLine.map((n) => n.name).join(" "));

  return { progression, bassLine };
}

// Helper function to convert diatonic scale degree (0-6) to chromatic pitch class (0-11)
function diatonicToChromatic(diatonic: number): number {
  // Map of how many semitones each scale degree is from the root
  const semitones = [0, 2, 4, 5, 7, 9, 11];
  return semitones[diatonic];
}

// Helper function to find a valid bass note for a chord
function findValidBassNote(
  chord: Chord,
  bassRange: [number, number],
  prevNote: Note | undefined,
  maxSkip: number,
  key: string
): Note | null {
  console.log("\n=== Finding Valid Bass Note ===");
  console.log("Chord:", chord);
  console.log("Bass Range:", bassRange);
  console.log("Previous Note:", prevNote);
  console.log("Max Skip:", maxSkip);
  console.log("Key:", key);

  // Get target degree based on chord root
  const targetDegree = chord.root;
  console.log("Target Degree:", targetDegree);

  const keyInfo = keySignatures[key];
  if (!keyInfo) {
    throw new Error(`Key signature not found for key: ${key}`);
  }

  const possibleNotes: Note[] = [];

  // For each pitch in the bass range
  for (let pitch = bassRange[0]; pitch <= bassRange[1]; pitch++) {
    const noteName = noteArray[pitch];
    if (!noteName) continue;

    // Use getDiatonicDegree to get the correct scale degree for this pitch in the current key
    const degree = getDiatonicDegree(pitch, keyInfo);

    if (degree === targetDegree) {
      // Check if this degree needs an accidental based on the chord
      let finalNoteName = noteName;
      const chromaticDegree = diatonicToChromatic(targetDegree);

      if (chord.sharpScaleDegree === targetDegree) {
        // If this degree should be sharp in this chord
        if (chord.type === "secondary-dominant") {
          // For secondary dominants, check if the degree is already sharp/flat in key
          if (keySignatures[key].sharps?.includes(chromaticDegree)) {
            finalNoteName = "^^" + noteName; // Double sharp if already sharp
          } else if (keySignatures[key].flats?.includes(chromaticDegree)) {
            finalNoteName = "=" + noteName; // Natural if flat
          } else {
            finalNoteName = "^" + noteName; // Sharp if natural
          }
        }
      } else if (chord.flatScaleDegree === targetDegree) {
        // If this degree should be flat in this chord
        if (keySignatures[key].sharps?.includes(chromaticDegree)) {
          finalNoteName = "=" + noteName; // Natural if sharp
        } else if (keySignatures[key].flats?.includes(chromaticDegree)) {
          finalNoteName = "__" + noteName; // Double flat if already flat
        } else {
          finalNoteName = "_" + noteName; // Flat if natural
        }
      }

      possibleNotes.push({
        name: finalNoteName,
        degree: targetDegree,
        pitchValue: pitch,
      });
    }
  }

  console.log(
    "Found possible notes:",
    possibleNotes.map((n) => `${n.name} (pitch: ${n.pitchValue})`)
  );

  // If no previous note, just take the middle note
  if (!prevNote) {
    const middleIndex = Math.floor(possibleNotes.length / 2);
    return possibleNotes[middleIndex] || null;
  }

  // Sort by distance from previous note
  possibleNotes.sort((a, b) => {
    const distA = Math.abs(a.pitchValue - prevNote.pitchValue);
    const distB = Math.abs(b.pitchValue - prevNote.pitchValue);
    return distA - distB;
  });

  // Return first note within maxSkip distance
  for (const note of possibleNotes) {
    if (Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip) {
      return note;
    }
  }

  return null;
}

/**
 * Helper to get octave markers for a pitch value
 */
function getOctaveMarkers(pitch: number): string {
  const octave = Math.floor(pitch / 7);
  return octave <= 0 ? ",".repeat(-octave) : "'".repeat(octave);
}

/**
 * Helper to map string chord types to ChordType enum
 */
export function mapChordType(type: string): ChordType {
  switch (type.toLowerCase()) {
    case "tonic":
      return ChordType.Tonic;
    case "predominant":
      return ChordType.Predominant;
    case "dominant":
      return ChordType.Dominant;
    case "mediant":
      return ChordType.Mediant;
    case "leading-tone":
      return ChordType.LeadingTone;
    case "secondary-dominant":
      return ChordType.SecondaryDominant;
    default:
      return ChordType.Tonic; // Default to tonic for unknown types
  }
}

/**
 * Helper to find valid note for a voice part
 */
function findValidVoiceNote(
  chord: Chord,
  range: [number, number],
  prevNote?: Note,
  maxSkip: number = 4,
  otherVoiceNotes: Note[] = []
): Note {
  const noteNames = ["C", "D", "E", "F", "G", "A", "B"];
  const octaves = Math.floor((range[1] - range[0]) / 7) + 1;

  // Get all possible chord tones within range
  let possibleNotes = chord.triadNotes
    .flatMap((degree) =>
      Array.from({ length: octaves }, (_, i) => {
        const pitch = range[0] + degree + i * 7;
        const octaveMarkers = getOctaveMarkers(pitch);
        return {
          name: noteNames[degree % 7] + octaveMarkers,
          degree,
          pitchValue: pitch,
        };
      })
    )
    .filter(
      (note) =>
        // Strictly enforce range
        note.pitchValue >= range[0] &&
        note.pitchValue <= range[1] &&
        // Within max skip if previous note exists
        (!prevNote ||
          Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip) &&
        // No voice crossing with other parts
        !otherVoiceNotes.some(
          (other) =>
            other &&
            !other.rest &&
            Math.abs(note.pitchValue - other.pitchValue) < 2
        )
    );

  if (possibleNotes.length === 0) {
    throw new Error(
      `No valid notes found in range [${range[0]}, ${range[1]}] for chord ${chord.name}`
    );
  }

  // If we have a previous note, prefer:
  // 1. The same note if it's in the chord (repeated notes are good!)
  // 2. The closest note within maxSkip
  if (prevNote) {
    // Try to find the same note first if it's in range
    const sameNote = possibleNotes.find(
      (n) => n.pitchValue === prevNote.pitchValue
    );
    if (sameNote) {
      return sameNote;
    }

    // Sort by distance from previous note
    possibleNotes.sort((a, b) => {
      const distA = Math.abs(a.pitchValue - prevNote.pitchValue);
      const distB = Math.abs(b.pitchValue - prevNote.pitchValue);
      return distA - distB;
    });
  }

  return possibleNotes[0];
}

// Function to select next chord based on weights
function selectNextChord(
  possibilities: ChordPossibility[],
  availableChords: Chord[]
): Chord | null {
  if (!possibilities || possibilities.length === 0) return null;

  const totalWeight = possibilities.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const possibility of possibilities) {
    random -= possibility.weight;
    if (random <= 0) {
      const nextChord = availableChords.find(
        (c) => c.name === possibility.name
      );
      return nextChord || null;
    }
  }
  // Fallback if something went wrong
  const fallbackChord = availableChords.find(
    (c) => c.name === possibilities[possibilities.length - 1].name
  );
  return fallbackChord || null;
}

// Helper function to generate a tonic chord
function generateTonicChord(): Chord {
  return {
    root: 0, // F in F major
    type: "tonic",
    name: "F",
    triadNotes: [0, 2, 4], // Root position triad (F, A, C)
    symbol: "F",
    nextChordPossibilities: [{ name: "dominant", weight: 1 }],
    baseMultiplier: 1,
  };
}

// Helper function to generate the next chord
function generateNextChord(prevChord: Chord, isLast: boolean): Chord {
  if (isLast) {
    return generateTonicChord(); // End on tonic
  }

  // For now, just alternate between tonic and dominant
  if (prevChord.type === "tonic") {
    return {
      root: 4, // C in F major
      type: "dominant",
      name: "C",
      triadNotes: [4, 6, 1], // Root position triad (C, E, G)
      symbol: "C",
      nextChordPossibilities: [{ name: "tonic", weight: 1 }],
      baseMultiplier: 1,
    };
  } else {
    return generateTonicChord();
  }
}
