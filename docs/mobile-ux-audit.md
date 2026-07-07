# Mobile UX Audit

_Audited 2026-07-07 by driving the app in Chromium at 390×844 (iPhone 12/13/14-class portrait) and 844×390 (landscape) against the local dev server, plus a review of the layout/component code. Line references are to the current `master`._

The app is genuinely close to being a good mobile tool — the mobile sheet sidebars, the bottom-sheet Options drawer, safe-area handling on the bottom buttons, and the long-press-on-map question flow all show mobile was considered. But there is one outright tap-blocking bug, the touch targets across the map chrome are all below platform minimums, and the information architecture (what's on screen, in which container, in what order) is optimised for a desktop power user rather than someone holding a phone on a station platform mid-game.

---

## 1. Confirmed defects (fix regardless of any restructure)

### 1.1 The right sidebar trigger is effectively un-tappable — invisible overlay intercepts taps

The header widget stack in `src/pages/index.astro:42-54` wraps the OfflineIndicator, MapLayersButton and PlacePicker in a centred flex column:

```html
<div
    class="flex flex-col flex-shrink max-w-fit z-[1030] absolute left-4 right-0 m-auto items-center ..."
></div>
```

At 390px width this wrapper measures **x=37→369, y=0→128** — it covers almost the entire header band, including most of the left sidebar trigger (x=8–44) and all but a ~5px sliver of the right "Hiding Zone" trigger (x=346–382). The wrapper is visually transparent but still receives pointer events, so taps on the right trigger land on the wrapper and do nothing. Playwright could not click the right trigger at all ("`<div class="flex flex-col flex-shrink max-w-fit ...">` intercepts pointer events") — a real thumb has the same problem, and whether the left trigger works depends on which half of the icon you hit.

**Fix (one line):** add `pointer-events-none` to the wrapper and `pointer-events-auto` to its three children. Longer term, put the triggers and the header widgets in one flex row so they can't overlap (see §3.1).

### 1.2 First-run tutorial: the Skip/Next controls render off-screen

On first load the 18-step tutorial (`src/components/TutorialDialog.tsx`) opens full-screen. On centred steps the dialog gets `!max-h-[90vh]` (760px here) but step 1's text alone measures ~950px, so the footer with **Skip Tutorial / 1 of 18 / Previous / Next sits at y≈1091 in an 844px viewport** — completely off-screen. Nothing indicates the dialog scrolls; the only hint is body text saying "skip this tutorial by scrolling down". A first-time mobile user is stared down by a wall of text with no visible way forward or out.

**Fixes:**

- Make the footer sticky (`shrink-0` footer outside the scrolling region) so Skip/Next/step-count are always visible; scroll only the body.
- The 18 dots/segments in the progress row and the desktop-length prose are a poor fit for phones. Mobile deserves a 3–5 step "hold the phone" version (add question via long-press → answer it → share), with "Read the full guide" linking to the long-form content.
- Steps 4–5 highlight the sidebar while the dialog covers ~90% of the viewport, so the highlighted element is barely visible behind `rgba(0,0,0,0.6)`; on mobile prefer bottom-anchored, half-height tutorial cards.

### 1.3 Touch targets across the map chrome are below the 44px minimum

Measured at 390×844 (Apple HIG minimum is 44×44pt, Android is 48dp):

| Control                                            | Size   | Where                                       |
| -------------------------------------------------- | ------ | ------------------------------------------- |
| Questions sidebar trigger                          | 36×28  | top-left                                    |
| Hiding Zone sidebar trigger                        | 36×28  | top-right (also blocked, §1.1)              |
| Zoom in / out                                      | 30×30  | `Map.tsx` Leaflet default                   |
| Fullscreen                                         | 30×30  | top-right                                   |
| Print                                              | 30×30  | top-right                                   |
| Draw edit / delete layers                          | 30×30  | bottom-left                                 |
| Card collapse chevron                              | 18×18  | every question card, `cards/base.tsx:77-85` |
| Every checkbox (Options, Zone sidebar, Map Layers) | 16×16  | throughout                                  |
| Station "View" button                              | ~34×24 | Zone sidebar list rows                      |

The sidebar triggers are the two most important buttons in the app and are also the smallest. Leaflet controls can be enlarged with CSS (`.leaflet-touch .leaflet-bar a { width/height: 44px }`); the triggers with padding; checkboxes are better replaced by shadcn `Switch` (thumb-sized, and communicates "setting" rather than "form field").

### 1.4 Accessibility errors visible in the console (all reproduce on load)

- The mobile sidebars are Radix `Sheet`s rendered without a `SheetTitle`/`Description` — Radix logs `DialogContent requires a DialogTitle` errors on every open (`src/components/ui/sidebar-l.tsx:214-237`, same in `sidebar-r`). The headings ("Questions", "Hiding Zone") exist but aren't wired in.
- The Hiding Zone close control is a bare `<SidebarCloseIcon onClick=…>` SVG, not a button (`ZoneSidebar.tsx:542-547`) — no role, no focus, no label, small target.
- The share/delete/lock/hide icon buttons on every question card have no accessible names (`cards/base.tsx:100-262`) — they appear in the tree as anonymous buttons.
- Both sidebar triggers are icon-only with no `aria-label` (`sidebar-l.tsx:294-311`).

### 1.5 Question defaults are tuned for country-scale games, not Zone 1

`schema.ts:115` defaults a new Radius question to **50 miles**; tentacles default to 15 miles (`schema.ts:143`). The whole play area is ~5 miles across, so the first thing every user must do after adding a radius question is replace the value. Sensible Zone-1 defaults (radius 0.5–1 mile, tentacles 1 mile) would make "add question → tap answer" a two-tap flow. Since this fork is permanently pinned to Zone 1, hard-tuning the defaults here is safe.

---

## 2. Major usability friction (worth restructuring)

### 2.1 Full-screen sidebars hide the map — the core mobile workflow is a blind toggle

On mobile both sidebars are **full-width sheets** (`w-full` in `sidebar-l.tsx:224`). Every question edit plays out as: open sidebar (map disappears) → change something → close sidebar → look at map → reopen… Setting a thermometer's two endpoints or checking whether a radius looks right requires four or more full context switches, and dragging a marker requires the sidebar closed, while changing its answer requires it open.

This is the single highest-leverage restructure: **make the Questions panel a snap-point bottom sheet instead of a full-screen side sheet.** The app already ships `vaul` (used for Options), which supports snap points — half-height while editing (map visible above, live-updating), draggable to full height for long lists. The map pipeline already re-renders on every `questionModified()`, so live feedback is free; it's purely a container change.

### 2.2 The bottom action row wastes prime thumb space on the wrong actions

`Share | Tutorial | Options` floats bottom-right (`index.astro:55-59`, `OptionDrawers.tsx:275-358`). Issues:

- **Tutorial** does not deserve permanent placement in the best thumb zone; it's a once-ever action that already lives in Options-adjacent space. Meanwhile the two things a player actually does constantly — open Questions, open Hiding Zones — are tiny icons at the top corners, in the hardest-to-reach part of the screen.
- The row collides with map furniture: it sits on top of the Leaflet attribution, next to the draw-edit controls, and `max-[412px]:!mb-4 / max-[340px]:flex-col` in `OptionDrawers.tsx:278` are band-aids for it not fitting.
- The buttons are anonymous grey rectangles; "Share" (primary multiplayer action) has no visual priority.

**Recommendation:** one bottom app bar owning that edge: `Questions · Zones · Share · ⋯` (⋯ = Options, Tutorial, Print, Fullscreen). Labeled icons, 48px targets, safe-area padded. This simultaneously fixes §1.1 (triggers move out of the header), §1.3 (targets), and thumb reach, and frees the top edge for map controls only.

### 2.3 Questions sidebar: inverted hierarchy and a dead-air empty state

- Empty state is a full black screen with nothing in it (screenshot: literally a void with two rows at the very bottom). First-run users get no hint that questions exist or that long-pressing the map adds one. Add an empty-state card: "No questions yet — tap **Add Question** or long-press anywhere on the map."
- **"Add Question" is an unstyled 32px-high text row, while "Star this on GitHub! It's free :)" is a bright emerald button directly beneath it** (`QuestionSidebar.tsx:100-118`). The primary action of the whole app is the least prominent element in the panel. Make Add Question a full-width primary button pinned at the top or as a FAB; demote the GitHub link to a small footer link.

### 2.4 Question cards: icon-soup that requires memorisation

Each card (`cards/base.tsx`, screenshot of Radius card) shows:

- Row 1 inside "Location": four unlabeled icon buttons (edit coordinates, use GPS, paste, copy). They have aria-labels but **no visible labels and no tooltips on touch** — you tap to find out.
- Row 2 at the card foot: four more unlabeled icons (share JSON, delete, lock, hide). "Share question JSON" is a niche action given equal weight with delete.
- The delete confirm dialog stacks **"Delete All Questions" directly next to "Delete Question"**, styled identically (`cards/base.tsx:216-241`) — a mis-tap nukes the whole game. Delete-all belongs in the sidebar header behind its own confirmation, not in every card's per-question dialog.
- The collapse chevron is 18×18 (the label is also tappable, which saves it — but the chevron invites the tap).

**Recommendation:** keep radius/unit/answer as visible controls; collapse the eight icon actions to at most: visible answer toggle + lock + a `⋯` overflow menu (share / copy coords / paste coords / hide / delete). Add text labels to the coordinate actions ("GPS", "Paste") — there is horizontal room.

### 2.5 Hiding Zone sidebar: setup tools buried on top of in-game tools

The panel's order today (screenshot): display toggle → warning → custom-station toggles → **URL import + file-chooser block** → station-type multiselect → radius → display-style rows → station list. During a live game the user needs exactly: toggle zones, radius, the station search list, and the display style. The import/curation block (URL input, file upload, "Include default stations…", "Clear Imported") is one-time setup that pushes the game controls below the fold on every open.

Also:

- **"No Display / All Stations / All Zones / No Overlap / Disable All"** render as five identical full-width list rows with **no selected-state indication** (`ZoneSidebar.tsx:908-1028`). They look like navigation, act like radio buttons, and you cannot tell which mode is active. Make them a labeled segmented control ("Display style") + a separate destructive-styled "Disable all" button.
- In the station list, **tapping a row toggles "disabled" (strikethrough) via a 100ms `setTimeout` + module-level `buttonJustClicked` flag hack** (`ZoneSidebar.tsx:1065-1114`), while the small "View" button zooms to the zone. Row-tap-to-disable is undiscoverable and easy to trigger while scrolling. Swap the affordances: row tap = view/zoom (the common, safe action); disabling = explicit checkbox/toggle on the row.
- The red "can drastically slow down your device" warning is permanent noise; show it once or tone it down — this fork's curated 82-station list is not slow.

### 2.6 Options drawer: nine identical checkboxes, gameplay modes buried

`OptionDrawers.tsx:488-630` renders Animate map movements / Force Pastebin / Planning mode / Auto save / Auto zoom / Follow Me (GPS) / Default custom questions / Google Plus codes / **Hider mode** as an undifferentiated 16px-checkbox pile, in that order. Hider mode — the switch that changes the entire app's behaviour for one of the two player roles — is last, below "Allow Google Plus codes?".

**Recommendation:** group with headers and switches:

- **Playing** — Hider mode (with the lat/lng editor it reveals), Planning mode, Follow Me (GPS)
- **Map** — Auto zoom, Animate movements
- **Data & sharing** — Auto save, Pastebin key, Force Pastebin, Copy/Paste hiding zone, Permanent overlay
- **Advanced** — custom-question default, Plus codes

"Follow Me (GPS)" additionally deserves a standard locate-me button on the map itself — it's a live-game feature hidden in a settings drawer.

### 2.7 Header consumes ~130px for two rarely-used controls

"Map Layers" (40px) + the "TfL Zone 1" combobox (40px + margins) occupy the top of the screen permanently. In this fork the place picker is **fixed** — it opens a popover containing a single "Clear Questions & Cache" button (`PlacePicker.tsx`). Neither earns permanent placement on a phone: fold both into the overflow/app-bar (§2.2) or a single compact icon row, and give the vertical space back to the map. (This also removes the overlap machinery that caused §1.1.)

---

## 3. Suggested restructure (summary)

**Target layout (portrait phone):**

1. **Bottom app bar** (safe-area padded, 48px targets, labeled): `Questions · Zones · Share · ⋯` — the ⋯ sheet holds Options, Map Layers, Clear round, Tutorial, Print, Fullscreen.
2. **Questions and Zones open as vaul bottom sheets with snap points** (~45% and ~90%) instead of full-screen side sheets, so the map stays visible and live-updates while editing.
3. **Map chrome**: zoom + locate-me (Follow Me) at 44px on one edge; draw controls only shown while a custom-draw question is active; attribution left unobstructed.
4. **Cards**: answer toggle + lock visible; everything else behind `⋯`; labeled coordinate actions; per-card delete only.
5. **Zone panel**: Play section first (toggle, radius, display-style segmented control, searchable station list with row-tap = view); Setup section (custom stations import) collapsed behind an accordion.
6. **Options**: grouped switches per §2.6.
7. **Onboarding**: 3–5 step mobile tutorial with a sticky footer; long-form guide linked.

**Quick wins first (small, independent PRs):**

| #   | Change                                                                           | Effort  |
| --- | -------------------------------------------------------------------------------- | ------- |
| 1   | `pointer-events-none` on header wrapper (§1.1)                                   | trivial |
| 2   | Sticky tutorial footer so Skip/Next are always visible (§1.2)                    | small   |
| 3   | Enlarge sidebar triggers + Leaflet controls to ≥44px (§1.3)                      | small   |
| 4   | Zone-1-appropriate question defaults (§1.5)                                      | trivial |
| 5   | Make "Add Question" a primary button, demote GitHub link, add empty state (§2.3) | small   |
| 6   | Selected-state segmented control for zone display styles (§2.5)                  | small   |
| 7   | Sheet titles / aria-labels / real close buttons (§1.4)                           | small   |
| 8   | Separate "Delete all questions" from the per-card dialog (§2.4)                  | small   |

The bottom-sheet restructure (§2.1/§2.2) is the big-ticket item; everything above stands alone and is worth doing even if the restructure never happens.
