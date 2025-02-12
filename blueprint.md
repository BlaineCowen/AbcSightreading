# ABC-Sightreading

## Big Picture

- randomly generate a string that can be read by abcjs and produce readable shet music
- take in parameters that can adjust the bounds of the randomness
- follow all music writing conventions

### Choral Sightreading Steps

1. Get resources ready
 - Object containing all Chords
 - Object containing Rhythms
 - Object containing abc notes (no sharps or flats)
 - Object containing instructions for nonchord tones
2. Get tonic and create aan array of notes with the lowest bass tonic note at 0
3. Generate Random rhythm pattern
- Stick to whole, dotted half, half, and quarter
- add a slight chance for the pattern to be dottedQuarter-eighth
- make the final note longest note chosen
4. Generate a chord progression and bass part
- make same length as rhythm pattern
- Chords must go to to a possibleNextChord
- Must end on V-I. Preferably predominant-dominant-tonic
- Must make the bass part here in case a chord goes out of bass range
5. Build other notes in the chord
- Go chord by chord
- pick a part at random
- add a note from the chord to the part if another part isn't already on scale degree (unless all degrees are taken)
- make sure that the chosen note is with maxSkip of that part's previous note
- make sure you are not going higher than the above voice or lower than the below voice
- check for accidentals and make sure accidentals are approached by step and resolved by a step
- also make sure no 2 parts are moving by parallel 5ths or octaves
- make sure tritones (notes a distance of 6 semitones apart) are resolved correctly
5. Break down notes so you have the 8th note index of each note
- For example, a half note would be 4 8th notes. The object would notate when a new note begins
6. Add non-chord tones
- Randomly go through each part again 
- ignore first and last notes and 8th notes
- 10-15% chance that the note will turn into a non-chord tone
- Non-chord tones can turn qtr notes into 8th notes, half notes into dotted qtr 8th or 2 qtr notes. They can elongate quarter notes and turn them into half notes or dotted qtr 8th
- They can change the pitch up or down by a step or skip as long as it is approched correctly and resolved correctly
- Must make sure that the non-chord tone stays within the range and does not cross another part
7. Assemble
- Assemble each note string, adding spaces where note beams need to be separated and barlines when measures end


