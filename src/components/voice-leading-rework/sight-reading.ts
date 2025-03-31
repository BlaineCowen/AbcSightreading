/**
 * @file sight-reading.ts
 * @description Main sight-reading exercise generation functionality
 */

import { checkForIllegalVoiceLeading } from "./voice-leading";
import {
  formatAbcScore,
  measureToAbc,
  toAbcNotation,
  getOctaveMarkers,
  baseNoteArray,
} from "./abc-notation";
import { noteArray } from "../../resources/noteArray";
import type { Rhythm } from "../../resources/rhythms";
import { chords } from "../../resources/chords";
import type { Chord as ChordSet } from "../../types/ChordSet";
import type { Note } from "./types";
import { ChordType, ClefType } from "./types";

interface Part {
  order: number;
  smallName: string;
  clef: ClefType;
  range: [number, number];
  selectedRange: {
    [level: number]: [number, number];
  };
}

interface PartsObject {
  numofParts: number;
  parts: {
    [key: string]: Part;
  };
}

interface Chord {
  name: string;
  symbol: string;
  triadNotes: number[];
  root: number;
  type: ChordType;
  nextChordPossibilities: { name: string; weight: number }[];
  sharpScaleDegree?: number;
  flatScaleDegree?: number;
  baseMultiplier: number;
}

export function createNewSr(
  bpm: number,
  key: string,
  timeSig: { name: string; tsPerMeasure: number },
  level: number,
  measures: number,
  maxSkip: number,
  partsObject: PartsObject,
  rhythms: Rhythm[]
): [string, ChordSet[]] | null {
  // Generate random rhythm pattern
  const randNoteLengths = generateRandomRhythm(timeSig, measures, rhythms);

  // Count positions that need chords (non-rest positions)
  const chordPositions = randNoteLengths.reduce((count, length) => {
    return length > 0 ? count + 1 : count;
  }, 0);

  // If all rhythms are rests, just use tonic chord
  const minChordPositions = Math.max(1, chordPositions);
  const tonicChord = chords.find((c) => c.type === "tonic")!;
  const chordsToUse = minChordPositions === 1 ? [tonicChord] : chords;

  // Convert ChordSet[] to Chord[] for generateChordProgression
  const localChords = chordsToUse.map((c) => ({
    name: c.name,
    symbol: c.symbol,
    triadNotes: c.triadNotes,
    root: c.root,
    type: c.type as ChordType,
    nextChordPossibilities: c.nextChordPossibilities,
    sharpScaleDegree: c.sharpScaleDegree ?? undefined,
    flatScaleDegree: c.flatScaleDegree ?? undefined,
    baseMultiplier: c.baseMultiplier,
  }));

  // Create note list from noteArray
  const notes = noteArray.map((name, index) => ({
    name,
    degree:
      (baseNoteArray.indexOf(name[0].toUpperCase()) -
        baseNoteArray.indexOf(key[0].toUpperCase()) +
        7) %
      7,
    pitchValue: index,
  }));

  // Generate chord progression and bass line
  const { progression, bassLine } = generateChordProgression(
    localChords,
    minChordPositions,
    partsObject.parts.Bass.range,
    maxSkip,
    key
  );

  // Initialize arrays to store notes for each part
  const allPartNotes: { [key: string]: Note[] } = {};
  let chordIndex = 0;

  // Generate notes for each part
  for (const partName in partsObject.parts) {
    const part = partsObject.parts[partName];
    const partNotes: Note[] = [];
    chordIndex = 0; // Reset chord index for each part
    let lastChord = progression[0]; // Keep track of last used chord for after rests

    // For each rhythm value
    for (let i = 0; i < randNoteLengths.length; i++) {
      const length = randNoteLengths[i];
      // Find the rhythm that generated this length
      const rhythm = rhythms.find((r) => {
        if (r.pattern) {
          return r.abcValue.some((v: string) => parseInt(v) === length);
        } else {
          return parseInt(r.abcValue[0]) === length;
        }
      });

      if (rhythm?.rest) {
        // Add rest note
        partNotes.push({
          name: "z",
          degree: -1,
          pitchValue: -1,
        });
        continue;
      }

      const isFirstNote = i === 0;
      const prevWasRest = i > 0 && randNoteLengths[i - 1] < 0;
      const isFirstOfPattern =
        rhythm?.pattern && rhythm.abcValue[0] === Math.abs(length).toString();

      // Use new chord if:
      // 1. It's the first note
      // 2. It's a single rhythm
      // 3. It's the first note of a pattern
      // 4. Previous note was a rest
      const useNewChord =
        isFirstNote || !rhythm?.pattern || isFirstOfPattern || prevWasRest;

      // Ensure we don't run out of chords
      const nextChordIndex = useNewChord ? chordIndex + 1 : chordIndex;
      const chord =
        progression[Math.min(nextChordIndex - 1, progression.length - 1)];
      if (useNewChord) {
        chordIndex = nextChordIndex;
        lastChord = chord;
      }

      // Find the last non-rest note
      let previousNote: Note | undefined;
      for (let j = partNotes.length - 1; j >= 0; j--) {
        if (partNotes[j].name !== "z") {
          previousNote = partNotes[j];
          break;
        }
      }

      // Get other part notes, excluding rests
      const otherPartNotes = Object.values(allPartNotes)
        .flat()
        .filter((n) => n.name !== "z");

      const generatedNotes = generatePartNotes(
        lastChord,
        notes,
        part.range,
        previousNote,
        otherPartNotes,
        maxSkip
      );

      if (!generatedNotes) {
        console.warn(`Could not generate notes for ${partName}`);
        return null;
      }

      partNotes.push(...generatedNotes);
    }

    allPartNotes[partName] = partNotes;
  }

  // Generate ABC header
  const abcHeader = formatAbcScore(
    key,
    { name: timeSig.name },
    bpm,
    partsObject
  );

  // Format the tune body
  let tuneBody = "";
  for (const [partName, partNotes] of Object.entries(allPartNotes)) {
    tuneBody += `[V:${partsObject.parts[partName].smallName}] `;
    let currentMeasureSum = 0;
    let measureNotes: Note[] = [];
    let measureCount = 0;

    // Add notes with rhythms
    for (let i = 0; i < partNotes.length; i++) {
      const note = partNotes[i];
      const length = Math.abs(randNoteLengths[i]);
      const noteWithLength = { ...note, length };

      // If adding this note would exceed the measure length
      if (currentMeasureSum + length > timeSig.tsPerMeasure) {
        // Fill the current measure with rests if needed
        const remainingLength = timeSig.tsPerMeasure - currentMeasureSum;
        if (remainingLength > 0) {
          measureNotes.push({
            name: "z",
            degree: -1,
            pitchValue: -1,
            length: remainingLength,
          });
        }
        // Add the current measure and bar line
        measureCount++;
        const isLastMeasure = measureCount === measures;
        tuneBody +=
          measureToAbc(measureNotes) + (isLastMeasure ? " |] \n" : " | ");
        // Start new measure with the current note
        measureNotes = [noteWithLength];
        currentMeasureSum = length;
      } else {
        // Add note to current measure
        measureNotes.push(noteWithLength);
        currentMeasureSum += length;

        // If measure is full, add bar line
        if (currentMeasureSum === timeSig.tsPerMeasure) {
          measureCount++;
          // Add double bar line for the last measure
          const isLastMeasure = measureCount === measures;
          tuneBody +=
            measureToAbc(measureNotes) + (isLastMeasure ? " |] \n" : " | ");
          measureNotes = [];
          currentMeasureSum = 0;
        }
      }
    }

    // Add any remaining notes and fill with rests if needed
    if (measureNotes.length > 0) {
      if (currentMeasureSum < timeSig.tsPerMeasure) {
        // Fill with rests to complete the measure
        measureNotes.push({
          name: "z",
          degree: -1,
          pitchValue: -1,
          length: timeSig.tsPerMeasure - currentMeasureSum,
        });
      }
      measureCount++;
      const isLastMeasure = measureCount === measures;
      tuneBody +=
        measureToAbc(measureNotes) + (isLastMeasure ? " |] \n" : " | ");
    }
  }

  // Convert Chord[] back to ChordSet[] for return
  const chordSets = progression.map((c) => ({
    name: c.name,
    symbol: c.symbol,
    triadNotes: c.triadNotes,
    root: c.root,
    type: c.type.toString(),
    nextChordPossibilities: c.nextChordPossibilities,
    sharpScaleDegree: c.sharpScaleDegree,
    flatScaleDegree: c.flatScaleDegree,
    baseMultiplier: c.baseMultiplier,
  }));

  return [abcHeader + tuneBody, chordSets];
}

/**
 * Helper function to generate random rhythm pattern
 */
function generateRandomRhythm(
  timeSig: { name: string; tsPerMeasure: number },
  measures: number,
  rhythms: Rhythm[]
): number[] {
  const noteLengths: number[] = [];
  const totalBeats = measures * timeSig.tsPerMeasure;
  let currentBeat = 0;

  // Create a map of all possible rhythm values
  const allRhythmValues = new Set(
    rhythms.flatMap((r) => r.abcValue.map((v: string) => parseInt(v)))
  );

  // Track used rhythms to ensure variety
  const usedRhythms = new Set<string>();
  const rhythmCounts = new Map<string, number>();
  rhythms.forEach((r) => rhythmCounts.set(r.name, 0));

  // If we have rests, ensure we use at least one
  const hasRests = rhythms.some((r) => r.rest);
  let usedRest = false;

  while (currentBeat < totalBeats) {
    const remainingBeats = totalBeats - currentBeat;

    // Filter rhythms that can fit in remaining beats
    let possibleRhythms = rhythms.filter((r) => {
      if (r.pattern) {
        const totalValue = r.abcValue.reduce(
          (sum, v: string) => sum + parseInt(v),
          0
        );
        return totalValue <= remainingBeats;
      }
      return parseInt(r.abcValue[0]) <= remainingBeats;
    });

    // If we have rests and haven't used one yet, prioritize them
    if (hasRests && !usedRest && Math.random() < 0.5) {
      const restRhythms = possibleRhythms.filter((r) => r.rest);
      if (restRhythms.length > 0) {
        possibleRhythms = restRhythms;
      }
    }
    // If we're near the end and haven't used all rhythms, prioritize unused ones
    else if (currentBeat < totalBeats * 0.75) {
      const unusedRhythms = possibleRhythms.filter(
        (r) => !usedRhythms.has(r.name)
      );
      if (unusedRhythms.length > 0) {
        possibleRhythms = unusedRhythms;
      }
    }

    // If we still have possible rhythms, select one randomly
    // Weight the selection based on how many times each rhythm has been used
    if (possibleRhythms.length > 0) {
      const weights = possibleRhythms.map((r) => {
        const count = rhythmCounts.get(r.name) || 0;
        return Math.max(1, 5 - count); // Higher weight for less used rhythms
      });

      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;

      let selectedRhythm = possibleRhythms[0];
      for (let i = 0; i < weights.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          selectedRhythm = possibleRhythms[i];
          break;
        }
      }

      // Add the selected rhythm
      if (selectedRhythm.pattern) {
        selectedRhythm.abcValue.forEach((v: string) => {
          const value = parseInt(v);
          noteLengths.push(selectedRhythm.rest ? -value : value);
          currentBeat += value;
        });
      } else {
        const value = parseInt(selectedRhythm.abcValue[0]);
        noteLengths.push(selectedRhythm.rest ? -value : value);
        currentBeat += value;
      }

      usedRhythms.add(selectedRhythm.name);
      rhythmCounts.set(
        selectedRhythm.name,
        (rhythmCounts.get(selectedRhythm.name) || 0) + 1
      );
      if (selectedRhythm.rest) {
        usedRest = true;
      }
      continue;
    }

    // If no rhythms fit, use the shortest available rhythm
    const shortestRhythm = rhythms.reduce((a, b) => {
      const aValue = a.pattern
        ? a.abcValue.reduce((sum, v: string) => sum + parseInt(v), 0)
        : parseInt(a.abcValue[0]);
      const bValue = b.pattern
        ? b.abcValue.reduce((sum, v: string) => sum + parseInt(v), 0)
        : parseInt(b.abcValue[0]);
      return aValue < bValue ? a : b;
    });

    const value = parseInt(shortestRhythm.abcValue[0]);
    noteLengths.push(shortestRhythm.rest ? -value : value);
    currentBeat += value;
    usedRhythms.add(shortestRhythm.name);
    rhythmCounts.set(
      shortestRhythm.name,
      (rhythmCounts.get(shortestRhythm.name) || 0) + 1
    );
    if (shortestRhythm.rest) {
      usedRest = true;
    }
  }

  // If we have rests but didn't use any, force a rest at a random position
  if (hasRests && !usedRest) {
    const restRhythm = rhythms.find((r) => r.rest);
    if (restRhythm) {
      const measureSize = timeSig.tsPerMeasure;
      let validPositions: number[] = [];
      let currentSum = 0;

      for (let i = 0; i < noteLengths.length; i++) {
        currentSum += Math.abs(noteLengths[i]);
        if (
          (currentSum % measureSize) + parseInt(restRhythm.abcValue[0]) <=
          measureSize
        ) {
          validPositions.push(i);
        }
        if (currentSum >= measureSize) {
          currentSum = currentSum % measureSize;
        }
      }

      if (validPositions.length > 0) {
        const insertPos =
          validPositions[Math.floor(Math.random() * validPositions.length)];
        noteLengths[insertPos] = -parseInt(restRhythm.abcValue[0]);
      }
    }
  }

  // Ensure we have at least one pattern if patterns are required
  const hasPattern = rhythms.some((r) => r.pattern);
  if (
    hasPattern &&
    !noteLengths.some((length, i) => {
      if (i === noteLengths.length - 1) return false;
      const rhythm = rhythms.find(
        (r) => r.pattern && r.abcValue[0] === Math.abs(length).toString()
      );
      return (
        rhythm && rhythm.abcValue[1] === Math.abs(noteLengths[i + 1]).toString()
      );
    })
  ) {
    // Find a pattern rhythm
    const patternRhythm = rhythms.find((r) => r.pattern);
    if (patternRhythm) {
      // Try to insert pattern at a random position that doesn't break measure boundaries
      const measureSize = timeSig.tsPerMeasure;
      const patternSize = patternRhythm.abcValue.reduce(
        (sum, v) => sum + parseInt(v),
        0
      );

      let validPositions: number[] = [];
      let currentSum = 0;

      for (let i = 0; i < noteLengths.length - 1; i++) {
        currentSum += Math.abs(noteLengths[i]);
        if ((currentSum % measureSize) + patternSize <= measureSize) {
          validPositions.push(i);
        }
        if (currentSum >= measureSize) {
          currentSum = currentSum % measureSize;
        }
      }

      if (validPositions.length > 0) {
        const insertPos =
          validPositions[Math.floor(Math.random() * validPositions.length)];
        noteLengths[insertPos] = parseInt(patternRhythm.abcValue[0]);
        noteLengths[insertPos + 1] = parseInt(patternRhythm.abcValue[1]);
      }
    }
  }

  return noteLengths;
}

function calculatePitch(note: string): number {
  const baseNote = note.charAt(0).toUpperCase();
  const baseIndex = "CDEFGAB".indexOf(baseNote);
  if (baseIndex === -1) return -1;

  let octaveOffset = 0;
  // Count commas (lower octaves)
  const commas = (note.match(/,/g) || []).length;
  octaveOffset -= commas;

  // Count apostrophes (higher octaves)
  const apostrophes = (note.match(/'/g) || []).length;
  octaveOffset += apostrophes;

  // If note is lowercase and no octave markers, it's one octave up
  if (
    note.charAt(0) === note.charAt(0).toLowerCase() &&
    !commas &&
    !apostrophes
  ) {
    octaveOffset += 1;
  }

  return baseIndex + octaveOffset * 7;
}

/**
 * Helper function to generate notes for a part
 */
function generatePartNotes(
  chord: Chord,
  noteList: Note[],
  range: [number, number],
  previousNote?: Note,
  otherPartNotes?: Note[],
  maxSkip: number = 3
): Note[] | null {
  // Filter notes based on their pitch values and ensure they fall within the specified range
  const possibleNotes = noteList
    .map((note) => ({ note, pitch: note.pitchValue }))
    .filter(({ pitch }) => {
      // Check if the note is within the valid range
      if (pitch < range[0] || pitch > range[1]) {
        return false;
      }

      // If there's a previous note, check the step difference
      if (previousNote) {
        const prevPitch = previousNote.pitchValue;
        const prevOctave = Math.floor(prevPitch / 7);
        const currentOctave = Math.floor(pitch / 7);
        const prevStep = prevPitch % 7;
        const currentStep = pitch % 7;
        const stepDiff = Math.abs(
          (prevOctave - currentOctave) * 7 + (prevStep - currentStep)
        );
        return stepDiff <= maxSkip;
      }

      return true;
    });

  // Sort possible notes by their distance from the previous note
  if (previousNote) {
    const prevPitch = previousNote.pitchValue;
    possibleNotes.sort((a, b) => {
      const prevOctave = Math.floor(prevPitch / 7);
      const aOctave = Math.floor(a.pitch / 7);
      const bOctave = Math.floor(b.pitch / 7);
      const prevStep = prevPitch % 7;
      const aStep = a.pitch % 7;
      const bStep = b.pitch % 7;
      const diffA = Math.abs((prevOctave - aOctave) * 7 + (prevStep - aStep));
      const diffB = Math.abs((prevOctave - bOctave) * 7 + (prevStep - bStep));
      return diffA - diffB;
    });
  }

  if (possibleNotes.length === 0) {
    return null;
  }

  // 2. Filter to chord tones
  let filteredNotes = possibleNotes.map(({ note }) => note);
  filteredNotes = filteredNotes.filter((note) => {
    const scaleDegree = ((note.degree % 7) + 7) % 7;
    return chord.triadNotes.includes(scaleDegree);
  });

  if (filteredNotes.length === 0) {
    return null;
  }

  // 3. Filter out degrees already taken by other parts (unless all are taken)
  if (otherPartNotes && otherPartNotes.length > 0) {
    const usedDegrees = new Set(
      otherPartNotes.map((note) => ((note.degree % 7) + 7) % 7)
    );
    const unusedNotes = filteredNotes.filter(
      (note) => !usedDegrees.has(((note.degree % 7) + 7) % 7)
    );

    // Only use unused notes if there are any available
    if (unusedNotes.length > 0) {
      filteredNotes = unusedNotes;
    }
  }

  // Take the closest note (or random if no previous note)
  const selectedNote =
    filteredNotes[0] ||
    filteredNotes[Math.floor(Math.random() * filteredNotes.length)];
  return [selectedNote];
}

/**
 * Helper function to generate chord progression and bass line
 */
export function generateChordProgression(
  chords: Chord[],
  numChords: number,
  bassRange: [number, number],
  maxSkip: number,
  key: string
): { progression: Chord[]; bassLine: Note[] } {
  const progression: Chord[] = [];
  const bassLine: Note[] = [];
  let attempts = 0;
  const maxAttempts = 50;

  // Helper to find valid next chords
  function getValidNextChords(
    currentChord: Chord,
    remainingChords: number
  ): Chord[] {
    if (remainingChords <= 3) {
      // For last 3 chords, enforce predominant-dominant-tonic
      if (remainingChords === 3)
        return chords.filter((c) => c.type === ChordType.Predominant);
      if (remainingChords === 2)
        return chords.filter((c) => c.type === ChordType.Dominant);
      return chords.filter((c) => c.type === ChordType.Tonic);
    }

    // Get weighted next possibilities
    return currentChord.nextChordPossibilities
      .filter((next) => {
        const nextChord = chords.find((c) => c.name === next.name);
        return nextChord && Math.random() < next.weight;
      })
      .map((next) => chords.find((c) => c.name === next.name)!)
      .filter(Boolean);
  }

  // Helper to find valid bass notes
  function findValidBassNote(chord: Chord, prevNote?: Note): Note | null {
    const noteNames = ["C", "D", "E", "F", "G", "A", "B"];
    const prevPitch = prevNote?.pitchValue ?? bassRange[0];

    // First try to use the root of the chord
    const rootDegree = chord.root;
    const octaves = Math.floor((bassRange[1] - bassRange[0]) / 7) + 1;

    // Get all possible root notes within range
    let possibleNotes = Array.from({ length: octaves }, (_, i) => {
      const pitch = bassRange[0] + rootDegree + i * 7;
      const octaveMarkers = getOctaveMarkers(pitch);
      const name = noteNames[rootDegree % 7] + octaveMarkers;
      return {
        name,
        degree: rootDegree,
        pitchValue: pitch,
      };
    }).filter(
      (note) =>
        note.pitchValue >= bassRange[0] &&
        note.pitchValue <= bassRange[1] &&
        (!prevNote || Math.abs(note.pitchValue - prevPitch) <= maxSkip)
    );

    // If no valid root notes found, try other chord tones as fallback
    if (possibleNotes.length === 0) {
      const otherDegrees = chord.triadNotes.filter((d) => d !== rootDegree);
      possibleNotes = otherDegrees
        .flatMap((degree) =>
          Array.from({ length: octaves }, (_, i) => {
            const pitch = bassRange[0] + degree + i * 7;
            const octaveMarkers = getOctaveMarkers(pitch);
            const name = noteNames[degree % 7] + octaveMarkers;
            return {
              name,
              degree,
              pitchValue: pitch,
            };
          })
        )
        .filter(
          (note) =>
            note.pitchValue >= bassRange[0] &&
            note.pitchValue <= bassRange[1] &&
            (!prevNote || Math.abs(note.pitchValue - prevPitch) <= maxSkip)
        );
    }

    if (possibleNotes.length === 0) {
      return null;
    }

    // Sort by distance from previous note
    if (prevNote) {
      possibleNotes.sort((a, b) => {
        const distA = Math.abs(a.pitchValue - prevPitch);
        const distB = Math.abs(b.pitchValue - prevPitch);
        return distA - distB;
      });
    }

    // Take the closest note (or random if no previous note)
    return (
      possibleNotes[0] ||
      possibleNotes[Math.floor(Math.random() * possibleNotes.length)]
    );
  }

  // Start with a tonic chord
  const firstChord = chords.find((c) => c.type === ChordType.Tonic);
  if (!firstChord) {
    console.warn("No tonic chord found");
    return { progression: [], bassLine: [] };
  }

  progression.push(firstChord);
  const firstBassNote = findValidBassNote(firstChord);
  if (!firstBassNote) {
    console.warn("No valid bass note found for first chord");
    return { progression: [], bassLine: [] };
  }
  bassLine.push(firstBassNote);

  // Generate remaining chords and bass notes
  while (progression.length < numChords && attempts < maxAttempts) {
    const currentChord = progression[progression.length - 1];
    const validNextChords = getValidNextChords(
      currentChord,
      numChords - progression.length
    );

    if (validNextChords.length === 0) {
      attempts++;
      continue;
    }

    const nextChord =
      validNextChords[Math.floor(Math.random() * validNextChords.length)];
    const bassNote = findValidBassNote(
      nextChord,
      bassLine[bassLine.length - 1]
    );

    if (!bassNote) {
      attempts++;
      continue;
    }

    progression.push(nextChord);
    bassLine.push(bassNote);
  }

  if (attempts >= maxAttempts) {
    console.warn("Max attempts reached while generating chord progression");
    return { progression: [], bassLine: [] };
  }

  return { progression, bassLine };
}
