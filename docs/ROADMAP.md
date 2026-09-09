# ABC Sight Reading — Product Roadmap

## Business Model
Freemium — 10 generations/day free, unlimited for $10/year (premium).

---

## Priority 1: Generation Quality (Free Tier)

These make the free product worth using and are relatively low-to-medium effort.

- [ ] **Minor keys** — `key-signatures.ts` already has definitions; just needs UI exposure. UIL level 3+ requires minor keys.
- [ ] **Compound time (6/8, 12/8)** — Tested at UIL, completely absent right now.
- [ ] **Better NCTs** — Current generation is purely probabilistic. Add:
  - *Suspensions* (4-3, 7-6, 9-8): hold a chord tone over the barline while harmony changes, resolve down by step
  - *Escape tones*: step up, then leap away
  - *Retardations*: suspension that resolves upward
  - Placement logic: require proper rhythmic preparation and resolution, not just random insertion
- [ ] **Melodic contour for top voice** — Soprano currently wanders. Improvements:
  - Track phrase arc (rising first half, falling toward cadence)
  - Penalize repeated consecutive pitches
  - Ensure the phrase climax note is approached and left by step
- [ ] **Roman numeral analysis overlay** — Toggle to show chord symbols above the staff (teaching aid).

---

## Priority 2: Premium Hook (The Reason to Pay)

The generation limit is only meaningful if saved exercises have lasting value.

- [ ] **User accounts** — Auth system (email/password or OAuth). Required for everything below.
- [ ] **Saved exercise library** — Generate, name, and save exercises. Retrieve, organize, delete. Core premium feature.
- [ ] **Student sharing links** — Director saves an exercise and gets a shareable URL. Student opens it for a read-only playback view — no student account needed.

---

## Priority 3: Medium-Effort Additions

- [ ] **Multi-state presets** — UIL is Texas only. Add NYSSMA (NY), GMEA (GA), and other state choral association standards. Premium content and a key differentiator.
- [ ] **PNG/PDF export** — abcjs renders to SVG natively; export for projection or paper handout.
- [ ] **Transposition tool** — Shift current exercise to a different key without regenerating.
- [ ] **Custom chord progression input** — Director specifies changes (I–IV–V–I) instead of generated. Good for targeted drills.

---

## Priority 4: Polish & Authenticity

- [ ] Fermatas at phrase endings
- [ ] Dynamic markings (mf, f, etc.) displayed on score
- [ ] Pickup/anacrusis measure support
