# UI Redesign — Design Spec

**Date:** 2026-04-23  
**Goal:** Make abcSightreading competitive with SightReadingFactory.com while leaning into its differentiators: SATB choir focus, UIL presets, and music-theory depth (chord/interval control).

---

## Context

The current app has a strong generation pipeline but a single collapsible options panel that dumps all controls at once. This overwhelms new users and hides the depth from advanced users. Compared to SRF, the app lacks: progressive disclosure, a polished playback bar, print/PDF export, and user-saveable presets. The goal is to fix all of these without simplifying the generation options — the music theory controls are a feature, not a bug.

---

## 1. Preset Dropdown

**Location:** Thin bar directly below the page header.

**Structure:**
```
Quick Start: [ UIL 1 – Beginner choir ▼ ]  [ + Save Current ]  Active: UIL 2
```

**Dropdown groups (in order):**
- `── UIL Levels ──` → UIL 1, UIL 2, UIL 3, UIL 4, UIL 5 (existing `uil-presets.ts` logic)
- `── Difficulty ──` → Beginner, Intermediate, Advanced (existing preset logic in `AbcjsChoral.svelte`)
- `── My Presets ──` → user-saved presets from localStorage

**Saving a preset:**
- "Save Current" reveals a small inline text input next to the button (no modal) for naming the preset, confirmed with Enter
- Serializes all current generation params (key, timeSig, voicing, measures, maxSkip, selectedRhythms, allowedChordNames, nctProbability, voice ranges) as JSON to localStorage under key `abcsr_presets`
- Structure is an array of `{ id, name, createdAt, params }` — designed to migrate to a user account API later
- Presets can be renamed or deleted from the dropdown (kebab menu per item)

**"Active" label** shows which preset is currently loaded. Cleared to "Custom" when any control is changed after loading a preset.

---

## 2. Tabbed Control Panel

Replaces the current single collapsible options panel.

**Tab order:** Setup · Rhythm · Harmony · Voice Ranges

**Tab bar layout:** Tabs left-aligned, Generate button right-aligned in the same row — always visible, no scrolling required.

**Non-default badge:** Amber dot (●) appears on a tab label when any setting in that tab differs from the app's default values.

### Setup Tab
| Control | Type | Notes |
|---------|------|-------|
| Voicing | Dropdown | SATB, SAB, S1S2A, TB1B2, SA, Unison |
| Key | Dropdown | All keys currently supported |
| Time Signature | Button group | 4/4, 3/4, 2/4 |
| Measures | Button group | 2, 4, 8, 16 |

### Rhythm Tab
Visual rhythm toggle chips (keep existing SVG icon approach). Each chip shows the rhythm name and icon; clicking toggles it on/off. Filtered set per the current UIL preset when one is active.

### Harmony Tab
Three grouped sections of chord toggle chips:
- **Diatonic** — I, ii, iii, IV, V, V⁷, vi, vii°
- **Inversions** — I⁶, I⁶₄, ii⁶, IV⁶, V⁶, V⁶₄, vi⁶, I⁷, iv
- **Secondary Dominants** — V/V, V/vi, V/ii

Below the chord chips:
- **Non-Chord Tone Amount** — range slider 0–100%, labelled "None" → "Heavy", with subtitle listing NCT types (Passing · Neighbor · Anticipation · Appoggiatura)
- **Max Melodic Skip** — decrement/increment buttons with label showing diatonic interval name (e.g., "4 — a 5th")

### Voice Ranges Tab
Keeps the existing `RangeSelector` component unchanged — shows each voice's range with the note displayed on a staff. No change to component logic, only relocated from the old options panel into this tab.

---

## 3. Playback Bar

Sticky bar fixed to the bottom of the viewport. Always visible.

**Left section — Transport:**
- ⏮ Restart (jump to beginning)
- ▶/⏸ Play/Pause
- ⏹ Stop
- 🔁 Loop toggle (amber glow when active; auto-restarts playback at end)

**Center section — BPM:**
- Label: "BPM"
- − button, range slider (40–200), + button, numeric readout
- Changing BPM updates playback speed **instantly without regenerating** — calls Tone.js transport BPM directly
- BPM lives only in the playback bar; the existing BPM field in the old options panel is removed

**Right of center — Voice Mutes:**
- S / A / T / B toggle buttons (adapt to active voicing — e.g., only show S/A for 2-part)
- Active = blue fill; muted = dim with strikethrough label
- Muting a voice removes it from the Tone.js synth mix without stopping playback

**Far right:**
- 🔗 Share — copies current exercise URL to clipboard (already URL-persisted; make button prominent)
- 🖨 Print — see section 4

**Auto-scroll fix:**
- Current implementation uses a polling timer; replace with abcjs `onEvent` cursor callback
- On each cursor event, check if the active measure is within the visible scroll area; if not, `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`
- Debounce scroll calls at 100ms to prevent jitter at fast tempos

---

## 4. Print / PDF Export

Triggered by the Print button in the playback bar.

**Implementation:** CSS `@media print` stylesheet on the existing page — no separate route needed.

**Print styles hide:** header, preset bar, tab panel, playback bar, all controls.

**Print styles show:** sheet music div at full page width, exercise title (key + time sig + voicing + date generated), chord symbol row if visible.

**Usage:** user clicks Print → browser print dialog opens → "Save as PDF" works natively. No server-side PDF generation needed.

---

## 5. Files to Modify

| File | Change |
|------|--------|
| `src/components/AbcjsChoral.svelte` | Full UI restructure — preset dropdown, tab panel, new playback bar |
| `src/styles/globals.css` | Tab styles, playback bar styles, print media query |
| `src/lib/uil-presets.ts` | No logic changes — wire existing exports into new dropdown |

**New files:**
| File | Purpose |
|------|---------|
| `src/lib/preset-storage.ts` | localStorage read/write for custom presets, typed `SavedPreset` interface |
| `src/components/PresetDropdown.svelte` | Dropdown component with save/rename/delete |
| `src/components/PlaybackBar.svelte` | Extracted playback bar (currently inline in AbcjsChoral) |
| `src/components/TabPanel.svelte` | Tab container with badge logic |

---

## 6. Out of Scope

- User accounts / cloud preset sync (future)
- Exercise history
- Individual voice isolation (mute is in scope; solo is not)
- Minor key generation improvements
- Mobile layout (keep existing behavior)

---

## 7. Verification

1. `npm run dev` — load the page, confirm preset dropdown shows UIL 1–5 + difficulty groups
2. Select UIL 3 preset → confirm tabs update to match (allowed chords, rhythms restricted)
3. Save a custom preset → reload page → confirm preset persists in dropdown
4. Generate an exercise → adjust BPM slider → confirm tempo changes without regenerating
5. Generate → play → confirm auto-scroll follows cursor accurately at 60, 100, and 160 BPM
6. Mute a voice → confirm it is silent in playback
7. Click Print → confirm sheet music fills page, controls are hidden
8. `npx astro check` — no TypeScript errors
