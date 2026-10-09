/**
 * Small MusicXML scores for the piece reader's tests, written the way
 * MuseScore and Sibelius export them (divisions, backup, voices, staves),
 * each kept to what one test needs.
 */

type PartSpec = { id: string; name: string; program?: number; measures: string[] };

export function scoreXml(parts: PartSpec[], extra = ""): string {
  const list = parts
    .map(
      (p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name>${
        p.program !== undefined
          ? `<score-instrument id="${p.id}-I1"><instrument-name>${p.name}</instrument-name></score-instrument><midi-instrument id="${p.id}-I1"><midi-channel>1</midi-channel><midi-program>${p.program + 1}</midi-program></midi-instrument>`
          : ""
      }</score-part>`,
    )
    .join("");
  const body = parts
    .map((p) => `<part id="${p.id}">${p.measures.map((m, i) => `<measure number="${i + 1}">${m}</measure>`).join("")}</part>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>Test Piece</work-title></work>
<identification><creator type="composer">A. Composer</creator></identification>
${extra}<part-list>${list}</part-list>${body}</score-partwise>`;
}

export const attrs = (o: { divisions?: number; fifths?: number; mode?: string; beats?: number; beatType?: number; clef?: string; staves?: number; transpose?: number } = {}) =>
  `<attributes><divisions>${o.divisions ?? 2}</divisions><key><fifths>${o.fifths ?? 0}</fifths>${o.mode ? `<mode>${o.mode}</mode>` : ""}</key><time><beats>${o.beats ?? 4}</beats><beat-type>${o.beatType ?? 4}</beat-type></time>${
    o.staves ? `<staves>${o.staves}</staves>` : ""
  }${o.clef ?? `<clef><sign>G</sign><line>2</line></clef>`}${
    o.transpose !== undefined ? `<transpose><diatonic>-1</diatonic><chromatic>${o.transpose}</chromatic></transpose>` : ""
  }</attributes>`;

export const note = (
  pitch: string,
  duration: number,
  o: { voice?: number; staff?: number; chord?: boolean; tie?: "start" | "stop" | "both"; lyric?: [string, string]; tuplet?: "start" | "stop" | "mid"; type?: string; grace?: boolean } = {},
) => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(pitch);
  const p = m
    ? `<pitch><step>${m[1]}</step>${m[2] ? `<alter>${m[2] === "#" ? 1 : -1}</alter>` : ""}<octave>${m[3]}</octave></pitch>`
    : "<rest/>";
  const ties = o.tie === "both" ? ["stop", "start"] : o.tie ? [o.tie] : [];
  const notations = [
    ...ties.map((t) => `<tied type="${t}"/>`),
    o.tuplet === "start" || o.tuplet === "stop" ? `<tuplet type="${o.tuplet}"/>` : "",
  ].join("");
  return `<note>${o.grace ? "<grace/>" : ""}${o.chord ? "<chord/>" : ""}${p}${o.grace ? "" : `<duration>${duration}</duration>`}${ties
    .map((t) => `<tie type="${t}"/>`)
    .join("")}<voice>${o.voice ?? 1}</voice><type>${o.type ?? "quarter"}</type>${
    o.tuplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : ""
  }${o.staff ? `<staff>${o.staff}</staff>` : ""}${notations ? `<notations>${notations}</notations>` : ""}${
    o.lyric ? `<lyric number="1"><syllabic>${o.lyric[1]}</syllabic><text>${o.lyric[0]}</text></lyric>` : ""
  }</note>`;
};

export const backup = (d: number) => `<backup><duration>${d}</duration></backup>`;
