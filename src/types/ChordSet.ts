export interface Chord {
  name: string;
  symbol: string;
  triadNotes: number[];
  root: number;
  chordFamily?: string;
  nextChordPossibilities: { name: string; weight: number }[];
  type: string;
  sharpScaleDegree: number | undefined;
  flatScaleDegree: number | undefined;
  baseMultiplier: number;
}

export type ChordArray = ChordSet[];

export interface ChordMap {
  [key: string]: ChordSet;
}
