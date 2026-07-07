# Level Devil — Play & Create

A browser clone of the "troll platformer" **Level Devil** — walk your little
pixel guy to the exit door, except every surface is a liar — now grown into a
small platform: a full game shell, big scrolling levels, real sound, and a
mobile-friendly **level editor** with Geometry-Dash-style *verify-then-share*.

Pixel-art rendered (buffer + nearest-neighbor upscale), vanilla JS, no build
step, no dependencies, static hosting.

## Play

Open `index.html` (or serve the folder: `python3 -m http.server 8000`).

- **Title screen** → Play (world/level select with saved progress), Create
  (editor), Settings (SFX volume/mute), and a **paste-a-code box** to play
  levels friends share with you.
- Keys: ←→/AD move · Space jump · R restart · Esc pause.
- Touch controls appear on mobile.

**25 levels across 3 themed worlds** — tan, icon-yellow, dark — every one
machine-verified beatable. World 3 ends with a three-screen-wide level that
shows off the scrolling camera and a camera-locked arena.

## Camera & big levels

Levels can be up to ~10 screens (9600×3240). The camera follows the player,
clamped to level bounds. **Camera zones** lock the view to a region while the
player is inside — players can't see past them, so what's ahead stays a
surprise. You always spawn seeing only the spawn area.

## The editor (`editor.html`)

True **WYSIWYG**: the canvas renders with the game's actual renderer,
animations paused — what you see is exactly what players get.

- **Palette with sprite thumbnails** (drawn by the game renderer), grouped:
  Terrain / Hazards / Traps / Interactive / Collect / Level. Every object has
  a plain-English description with troll tips.
- **X-ray toggle** 👁 ghosts the invisible trolls (fake blocks, invisible
  platforms, pop-up spikes, hidden doors) so *you* can see them while editing;
  toggle off to preview the player's view.
- Pan (drag empty space), pinch/scroll zoom, **minimap**, level size settings.
- Trigger zones (dashed), path/portal ends (◆ diamonds), resize handles —
  all draggable. Overlapping objects? Tap again to cycle selection.
- Bottom-sheet properties panel, first-run **guided tour**, ? help reference.
- Works on phones: touch drag, pinch zoom, thumb-sized UI.

### Verify → Share

**You must beat your own level** (▶ Test, from spawn) before Share unlocks —
so every shared level is provably beatable. Sharing produces a **link and a
code** (`LD1.…`, the whole level deflate-compressed into a URL-safe string —
no server involved). Any edit re-locks sharing until you verify again.

## Community roadmap (backend phase)

Share codes are the serverless phase 1. The level format already carries
`author`, `name` and the verified flag, so a phase-2 backend (accounts, browse
/rate/play counts, creator ad revenue) can bolt on without changing the format.
Ads/monetization need real hosting + an ad network — documented intent, not
shipped from GitHub Pages.

## Sound

Real **CC0 sound assets** from [Kenney](https://kenney.nl) (Interface, Impact,
Digital Audio, Sci-Fi packs — see `assets/sfx/LICENSE.txt`). Jump, land,
death, coin, star, key, doors, plates, gates, crusher slams, portals, UI —
**no music**. Volume + mute in Settings, persisted.

## Code layout

- `js/render.js` — shared renderer + runtime builder (game & editor draw with
  the same code; also renders the palette thumbnails)
- `js/game.js` — physics (120 Hz fixed step, gravity direction, crush
  detection), traps, camera, shell screens, progress save
- `js/levels.js` — themes (per-class colour roles + outlines) and all level
  data as plain-schema behaviour buckets
- `js/editor.js` — the editor; `js/share.js` — level⇄code codec + hash;
  `js/sfx.js` — sound manager
- `assets/sfx/` — CC0 audio

### Level design budget

Jump: ~126px high, ~195px far at full speed. Gaps ≤160px, step-ups ≤100px.
Ground line at y=500 per 540 of height.

## Still on the wishlist

Breakable/rising/sticky blocks, wall spikes, boulders, bombs, lava, timed
buttons, levers, elevators, swing platforms, more enemies, decorations, logic
gates (AND/OR/timers/randomizers), camera shake/flip trolls, "after N deaths"
triggers, fake win screens, player shrink/grow, accounts + public level
browser + creator revenue (needs backend).
