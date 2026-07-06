# Level Devil — clone

A browser clone of the "troll platformer" **Level Devil**: the level *looks*
simple — just walk your little guy to the exit door — but every surface is a
liar. Floors vanish, spikes spring from the ground, slabs crash from the
ceiling, the door runs away, and the controls flip. Die instantly, respawn
instantly, learn the trick, try again.

No build step, no dependencies. Vanilla HTML5 canvas + JS.

## Play

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

| Action | Keys |
| ------ | ---- |
| Move   | ← → or A D |
| Jump   | Space, W, or ↑ |
| Restart level | R |

On touch devices, on-screen buttons appear automatically.

## The 10 levels (and their lies)

1. **Warm Up** — honest. Learn to run and jump. (Builds false trust.)
2. **Trust Issues** — the floor looks whole; the middle is fake. Jump it.
3. **Disappearing Act** — stepping stones erase themselves after you land.
4. **Rise Up** — spikes ambush upward out of a flat floor.
5. **Falling Sky** — spiked slabs cycle down from the ceiling. Time your dash.
6. **Cave In** — platforms crumble a beat after you touch them; spike pit below.
7. **Cold Feet** — the door flees until it hits the wall. Corner it.
8. **Wrong Way** — controls reversed. Left is right.
9. **Press** — ceiling crushers slam the corridor. Slip through the gaps.
10. **Finale** — a false first step and every trick at once.

## How it's built

- `index.html` — canvas + HUD + touch controls
- `css/style.css` — dark minimalist theme, responsive stage
- `js/levels.js` — pure data. Each level groups rects by *behaviour*
  (`solids`, `fakes`, `disappear`, `collapse`, `spikes`, `popspikes`,
  `fallers`, plus a `door` and a `reverse` flag).
- `js/game.js` — the engine: fixed-timestep physics (120 Hz), axis-separated
  AABB collision, trap state machines, particle death bursts, single-screen
  levels.

### Adding a level

Append an object to `LEVELS` in `js/levels.js`. Play area is `960×540`, ground
surface at `y=500`. Give it a `spawn`, a `door`, and any mix of the behaviour
buckets above. Traps reference trigger `zone` rects where noted. Keep gaps
under ~180px so they stay jumpable.
