# brief

- Level Devil clone: vanilla JS, pixel-art (320×180 buffer → 3x nearest-neighbor). 24 levels / 3 themed worlds (tan/yellow/dark), all machine-verified beatable (scratchpad solve4.mjs pattern: in-page autopilot via window.__ld hook).
- Engine `js/game.js`: 120Hz physics, gravDir, ice/conveyor/movers/oneways, crush detection, bitmap sprite char + door-enter anim. Data `js/levels.js` (WORLDS/THEMES + behaviour buckets). Editor `editor.html`+`js/editor.js` → test-play via `index.html?custom=1` + localStorage `ld_custom_level`.
- Jump budget: 126px high / 195px far. Deploys via GitHub Pages off branch `claude/level-devil-clone-rnpfyi`; bump `?v=` cache tags in index.html when JS/CSS change.
