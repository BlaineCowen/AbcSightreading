# Choir Sight-Reading Criteria

> **The MIDI range numbers in this file are not reliable.** They do not match
> the range staves UIL publishes, and in September 2026 the app's voice ranges
> were rebuilt from them and came out wrong - sopranos up to a sixth too high -
> until the hand-calibrated values were restored. The ranges the app uses live
> in `src/lib/uil-presets.ts` and are set on `/range-calibration` against the
> official page: https://www.uiltexas.org/music/concert-sight-reading/choir-sight-reading-criteria

## Preface: Choir Sight-Reading Music
The choral sight-reading evaluation encourages the extension of knowledge in basic fundamentals of music and rewards the consistent use of a systematic approach to sight-reading. The level of difficulty for each grade or class will allow for the demonstration of musicality as well as for technical accuracy.

The primary purpose of the commissioned sight-reading music is to test musical literacy at specific levels. The guidelines stated for the sight-reading material provide the composer with a parameter of difficulty in composing music for each specific classification. All of the elements need not be used in each composition. Harmonic, rhythmic, or textual ideas whose primary purposes are to create special effects appropriate for concert performance would best not be used in graded instructional sight-reading materials.

Other general considerations for composers are:

- Avoid using texts with unfamiliar words such as foreign or mythological terms or limericks.
- Ensure that a tonal center is evident throughout the piece.
- Return to the original key following a modulation.
- Music for treble and men’s choirs should be of equal difficulty to that of mixed choirs in the same classification.
- Avoid introducing more than one rhythmic or harmonic problem at a time.
- Remember that it is unnecessary to employ all of the allowed elements in a single piece.

## Level 1 - Conference 1C Varsity; all MS non-varsity; 3A/2A/1A non-varsity

(UIL's current criteria, read from uiltexas.org on 7 October 2026 and checked
with Blaine. The app: `src/lib/uil-presets.ts`, skips `src/lib/uil-skips.ts`.)

- **Meter:** 3/4, 4/4; no meter changes. (2/4 was dropped at this level.)
- **Key:** F and G major. (C was dropped.)
- **Texture:** homophonic, with unison passages allowed.
- **Harmony:** I, IV, and V or V7.
- **Skips, by chord:** I - 3rds do-mi-do, mi-sol-mi; 4th do-sol1-do (the sol
  below). IV - 3rds fa-la-fa, do-la1-do (the la below). V - 3rds ti-re-ti,
  sol-ti-sol. Nothing else skips.
- **Begin** on the tonic triad, voices on do-mi-sol, do-mi, or unison do.
- **Cadences:** authentic, half and plagal only.
- **Rhythm:** whole, dotted half, half, quarter and a few eighth pairs; avoid
  rests.
- **Length:** about 24 measures in 4/4, 32 in 3/4.
- **Voicings:** SATB and SAB; SSA/SA; TTB (middle school), TBB (high school),
  TB. *The app offers SA and TB so far, written melody first; the others join
  as each gets its own writer (Blaine, 7 October 2026).*
- **Text:** printed text or the choir's own reading method, both readings.

## Level 2 - Conference 2C/3C Varsity; 4A non-varsity

- **Meter:** 3/4, 4/4; no meter changes.
- **Key:** F and G major; no modulation. (C and D were dropped.)
- **Texture:** homophonic, with unison passages allowed.
- **Harmony:** I, IV, and V or V7; an occasional ii or vi "for harmonic
  interest". No altered tones.
- **Skips, by chord:** Level 1's, and 4ths do-fa-do in IV ("expected") and
  sol-re-sol in V (the re below sol). None listed for ii or vi.
- **Cadences:** authentic, half and plagal only; "no use of the deceptive
  cadence".
- **Rhythm:** whole, dotted half, half, quarter and some eighth pairs; a
  dotted quarter followed by an eighth "on strong beats only"; avoid rests.
- **Length:** about 24 measures in 4/4, 32 in 3/4.
- **Voicings:** SATB, SAB; SSA/SA; TTB/TBB/TB. *The app offers SATB, SAB,
  SSA, SA and TB; SA and SSA written melody first.*

## Level 3 - Conference 1A/2A/3A Varsity; 5A/6A non-varsity

- **Meter:** 3/4, 4/4; no meter changes.
- **Key:** B flat, F, C, G, D major.
- **Texture:** homophonic, with polyphonic sections; no more than 20%
  polyphony.
- **Harmony:** I, IV, V or V7; ii and vi "desirable where harmonically
  appropriate".
- **Skips, by chord:** Level 2's, and 5ths do-sol-do (I), do-fa1-do (IV, "in
  bass lines"), sol-re-sol (V, the re above); re-fa-re in V7 ("expected").
  *Applied to SSA, written melody first; the general writer, which writes
  the mixed and men's voicings, still uses a largest skip.*
- **Begin** on the tonic triad (do-mi-sol, do-mi, or unison do).
- **Cadences:** authentic, half and plagal only.
- **Rhythm:** whole, dotted half, half, quarter and eighth pairs, "a greater
  use of eighth notes"; a dotted quarter on strong beats is desired; whole,
  half and quarter rests may be used.
- **Length:** 32-36 measures in 4/4, 42-48 in 3/4.
- **Voicings:** SATB, SAB; SSA/SA; TBB/TB.

## Level 4 - Conference 4A Varsity

- **Meter:** 2/4, 3/4, 4/4; no meter changes.
- **Key:** B flat, E flat, F, C, G, D, A major; no modulation.
- **Texture:** homophonic with polyphonic sections; no more than 20%
  polyphony.
- **Harmony:** I, IV, V, V7, ii, iii, vi. No altered tones are named at this
  level (they are Level 5's). Dissonance with proper resolution, for no more
  than two chords in succession. Skips within I, IV, V, V7 and vi, including
  6ths and octaves; "leaps of a tritone or 7th are forbidden".
- **Cadences:** authentic, half and plagal only.
- **Rhythm:** eighth, quarter, half and whole notes and their rests; dotted
  values using eighths or longer. No sixteenths, no triplets.
- **Length:** about 32 measures in 4/4, 42 in 3/4.
- **Voicings:** SATB, SAB; SSA/SA; TBB/TB.

## Level 5 - Conference 5A/6A Varsity

- **Meter:** 2/4, 3/4, 4/4; no meter changes.
- **Key:** major keys up through four sharps and four flats; "possible
  modulation to relative minor keys". No minor keys of its own - Blaine: the
  B section turns to the relative minor for 8 bars or so (`form-plan.ts`).
  Minor-key practice is the app's own, outside the levels.
- **Texture:** homophonic with polyphonic sections; no more than 25%
  polyphony.
- **Harmony:** altered tones fi (V/V), si (V/vi), di (V/ii) and te (V7/IV);
  other altered tones discouraged. Dissonance with proper resolution.
  Tritone and 7th leaps forbidden.
- **Rhythm:** simple syncopation and ties across barlines; dotted patterns,
  including an occasional dotted eighth and sixteenth; other sixteenth
  patterns and triplets forbidden.
- **Length:** 32-36 measures for 5A; 6A adds 12-16 more. One piece serves
  both: 5A stops at its full cadence (bar 32 in both of Blaine's Level 5
  pieces), 6A goes on.
- **Voicings:** SATB, SAB; SSA/SA; TBB/TB.

## Not yet applied (known gaps)

- Leap rules at Levels 3-5 for the general writer (SATB, SAB, TBB): it uses
  a largest skip, and does not yet forbid the tritone.
- Level 4-5 two-part voicings (SA, TB) and Level 1's SATB, SAB, SSA and TTB:
  each joins when it has a writer.
- Level 5's ties across barlines and syncopation are allowed but not sought;
  the relative-minor B section is planned (`form-plan.ts`) but the
  generator does not yet modulate.
- Level 4 dissonance "for no more than two chords in succession" is not
  checked.
