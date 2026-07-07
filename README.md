# Level Devil — clone

A browser clone of the "troll platformer" **Level Devil**: the level *looks*
simple — just walk your little pixel guy to the exit door — but every surface
is a liar. Floors vanish, spikes spring from the ground, slabs crash from the
ceiling, doors run away (or were never real), gravity flips, and the controls
betray you. Die instantly, respawn instantly, learn the trick, try again.

Fully pixel-art rendered (320×180 buffer, nearest-neighbor upscale), no build
step, no dependencies. Vanilla HTML5 canvas + JS. Includes a **level editor**.

## Play

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

| Action | Keys |
| ------ | ---- |
| Move   | ← → or A D |
| Jump   | Space, W, or ↑ |
| Restart level | R |

Touch controls appear automatically on touch devices.

## Worlds

**24 levels across 3 themed worlds** (every level machine-verified beatable):

- **World 1 · The Room** (tan) — the classics: fake floors, disappearing and
  collapsing platforms, pop-up spikes, ceiling crushers, the runaway door,
  reversed controls.
- **World 2 · The Sun** (icon yellow) — moving platforms, ice, pressure plates
  + gates (and what pressing buttons wakes up), conveyors + saws, laser
  timing (and one laser that punishes jumpers), a fake exit with teeth,
  gravity-flip ceiling walking, an invisible staircase.
- **World 3 · The Dark** (night, white character) — patrol enemies, troll
  portals, a key quest with a *fake checkpoint*, alternating conveyor lines
  under a jump-nerf field, a crusher/laser gauntlet, and a finale where the
  way out is behind you.

## Level editor

Open `editor.html` (linked from the game footer).

- **Bottom toolbar** = the object palette, grouped by category (Terrain,
  Hazards, Traps, Interactive, Collectibles) — click an item, click the canvas.
- **Side panel** = properties of the selected object (position, size, speed,
  delay, laser cycle, gate ids, button targets, key ids, fake/real, …).
- Drag to move; corner handle resizes; dashed box = trigger zone; ◆ marker =
  path end / portal exit (drag them).
- Grid snap, undo/redo (Ctrl+Z/Y), duplicate (Ctrl+D), delete (Del).
- **Export/Import** level JSON, autosave to localStorage.
- **▶ Test Play** launches the real game with your level
  (`index.html?custom=1`).

## Engine mechanics (all editor-placeable)

Terrain: ground, one-way platforms, fake blocks, invisible platforms, ice,
conveyors, disappearing/collapsing/appearing floors, moving platforms, gates.
Hazards: spikes (up/down), pop-up spikes, cyclic crushers, saw blades (static
or patrolling), cycling lasers, fire, chaser blocks, patrol enemies.
Traps: gravity-flip zones, reverse-control zones, jump-modifier zones, portal
pairs, fake exit doors (`spikes` or `flee`).
Interactive: pressure plates (toggle/hold → gate targets), keys + locked
gates, checkpoints (and fake checkpoints).
Collectibles: coins, stars. Plus per-level theme, hint text, reversed
controls, runaway/hidden doors.

## How it's built

- `index.html` — game canvas + HUD + touch controls
- `editor.html`, `js/editor.js`, `css/editor.css` — the level editor
- `js/levels.js` — pure data: `WORLDS`/`THEMES` and every level as behaviour
  buckets in one schema (shared with the editor)
- `js/game.js` — the engine: fixed-timestep physics (120 Hz), axis-separated
  AABB with crush detection, gravity-direction support, trap state machines,
  bitmap-sprite character animation (run/jump/fall/idle + door-enter
  sequence), pixel buffer renderer

### Design budget for level authors

Play area 960×540, ground top at y=500. Jump: ~126px high, ~195px far at full
run. Keep gaps ≤ 160px and step-ups ≤ 100px unless you mean it.

## Roadmap (editor palette wishlist)

Not yet implemented, candidates for future passes: breakable/rising blocks,
sticky platforms, wall spikes, rotating saw arms, boulders, bombs, lava/acid,
trap doors, teleport traps, wall-shift/moving walls, camera trolls (shake,
flip, lie), timed buttons/levers, secret doors, elevators, circular/swing
platforms, flying/jumping/turret enemies, decorations layer, logic gates
(AND/OR/NOT, timers, counters, randomizers, event chains), camera zones,
audio triggers, death-count-conditioned trolls ("after N deaths"), fake win
screens/credits, player shrink/grow, delayed/chained explosions.
