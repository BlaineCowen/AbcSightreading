# Ensemble page

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching /ensemble-sightreading.

## Ensemble page

`/ensemble-sightreading` (`AbcjsEnsemble.svelte`, `src/lib/ensemble/`, tests
`ensemble.test.ts`, gate `bun run scripts/check-ensemble.ts`): a teacher picks
instruments and voices with counts (the Reading as list: band, the four voice
parts, strings; ready-made groups in `settings.ts`) and gets a chorale for
them (Blaine, 13 October 2026: chorale style, two to four parts with
doubling, its own page, voices beside instruments). `arrange.ts` lines the
players up by register and cuts them into parts where registers differ most
(a section can split, Trumpet 1 and 2), staggers parts that share a register,
writes a part far below the one above an octave up for its players to read
8vb (a string bass under violins), and names the parts so the Choral writer
uses the texture that fits (SATB, SAB, SA/TB; two parts more than an octave
apart go to the general writer, since the duet writers dragged a tuba to the
top of its range). Choral pitch is concert + 7. `generate.ts` writes the
parts with a UIL level's rhythms, chords and skips in any major concert key,
then `transpose.ts` gives each instrument its staff: its octave, written key
(`writtenKey`), every note spelled from its sound, chromatic notes kept
chromatic so solfège reads fi as fi. Each staff carries its own `[K:]`,
`%%MIDI program` (after its first V: line in the body) and `transpose=`.
`voiceBodyAbc` (abc-assembly.ts) is the note writer Choral and Ensemble share;
Choral's output is unchanged (meter snapshots). A staff can be hidden ("one
part") and is still heard: playback reads the full score. Two styles (the
Level pill, `style` in links): Simple, the UIL level's choir textures; and
Bach chorale (`CHORALE` in generate.ts, the default for the band and string
groups): a quarter pulse, halves and wholes at cadences, every part decorated
on its own by the corpus-tuned decoration pass, all diatonic chords in every
inversion and the V7's (secondary dominants from Level 3), leaps to a sixth,
the general writer, and a fermata over every part at each phrase's end
(`VoiceNote.fermata`, printed by voiceBodyAbc). Measured against 120 of
Bach's chorales (13 October 2026): he writes 36% eighths, parts' rhythms
differ on 55% of beats, 21% of moves leap; chorale style at Level 5 gives
20%, 30%, 28%, the decoration pass's own ceiling (a passing tone needs a
third to fill; two parts never decorate the same instant). Closing that
needs new figures (chord-tone eighths, decorations in thirds) in the shared
pass. Saved ensembles ("My ensembles" in the Ensemble popover) are presets
in their own list, `abcsr_ensemble_presets` (preset-validate PRESET_STORES),
opened through `settingsFromSaved`, checked as a link is. Sections split by chair
(`splitSections`, Blaine 13 October: more than four lines, doubling octaves
and parts, so each player has a part of their own): a section of two or more
takes up to `MAX_CHAIRS` (3) parts, moving only down (a second trumpet
under the first) and only to a part it plays as written within its players'
shared range, shared out evenly (seven clarinets 3, 2, 2); the harmony stays
four parts and a moved chair doubles one (whole sections still double at the
octave). Allowing octave moves, or moves up, put a bass choir on the alto line
8vb and violas over the violins, and moved chairs had to be checked against
the part's shared range, not its main instrument's, or 8,430 notes in a gate
run fell outside their players' ranges. Known: string orchestra still gives
violas the alto line and cellos the tenor (the register grouping, `cut`). Live (`LiveTeacher page="ensemble"`) publishes the full score; each
device picks its staff ("Trumpet 2") and live.ts `extractVoice` gives it that
staff in its own key, clef and sound (`ensemble.test.ts` checks every staff;
`PAGE=ensemble scripts/check-live.ts` 23/23, 13 October 2026). Check, 13 October
2026, with sections split: 10,442 exercises over 48 ensembles in both styles,
9 failed (simple style on unusual random mixes, worst 6 of 216 for clarinets
with string and voice basses at Level 1), no note out of range, no abcjs
warning.
