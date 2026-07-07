# brief — Level Devil "Play & Create" (pre-compact handoff)

## What this is
Level Devil clone grown into a platform: pixel-art troll platformer + game shell + mobile-first WYSIWYG level editor with Geometry-Dash-style verify-then-share. Vanilla JS, no build, GitHub Pages off branch `claude/level-devil-clone-rnpfyi` → https://akhiyusuf.github.io/level-devil/ . Cache tags `?v=8` on all assets (bump on every JS/CSS/ogg change — user hit stale-cache before).

## Architecture
- `js/render.js` — SHARED renderer + `buildRuntime(levelSrc)`. Game, editor canvas and palette thumbnails all draw with it. Camera-aware (`camX/camY`), draws into any-size canvas. KEY: terrain (solids+fakes+untriggered disappear/collapse) is outlined as ONE union silhouette via mask-halo (`terrainPass`) — per-rect outlines betrayed fake blocks (user caught it; pixel-verified fixed). `xray` opt ghosts trolls + hatches fakes (editor only). `drawThumb(ctx,type,theme,size)` renders palette tiles.
- `js/game.js` — physics (120Hz fixed step, gravDir, crush check pOver(r,8)), traps, camera follow + camZones lock, DOM shell (title/levels/settings/pause/complete screens), progress in localStorage `ld_progress`. Custom play: `?custom=1` reads `ld_custom_level`; shared play: `#lvl=LD1....` via LDS.decode. Beating custom test writes `ld_verify={hash}` (editor handshake).
- `js/levels.js` — THEMES (per-class color roles: brick/spike/coin-gold/key-teal/flag-green/portal-purple + `outline`) and 25 levels in 3 WORLDS (tan/yellow/dark). Level schema = behaviour buckets; supports `w/h` (to 9600×3240) + `camZones`. Jump budget: 126px up, 195px far; gaps ≤160, step-ups ≤100. Ground y=500 per 540 height.
- `js/editor.js` — editor v3. Mobile-first: FAB "+ Add" → palette bottom-sheet; props bottom-sheet (max 56vh) w/ `sheetShift` render-slide so selected floor objects stay visible; desktop ≥980px re-parents `#palette-root`/`#props-root` into docked side panels (`placeRoots()`). Explanatory props: FRIENDLY name+helper per field, groups (Position/Behaviour/Connections/Trigger zone/Path), gate-checkbox targets, key dropdown. Spotlight tour (dims + rings target, card side-positions for tall targets), help w/ "show me" flash buttons. Palette tiles: game-rendered thumbs + corner badges for lookalikes. Verify gate: share locked until `ld_verify.hash === LDS.hash(levelJSON)`; edits re-lock. `window.__ed` debug hook.
- `js/share.js` — `LDS.encode/decode` = deflate-raw + base64url, prefix `LD1.`; `LDS.hash` djb2.
- `js/sfx.js` — 18 CC0 Kenney oggs in `assets/sfx/` (LICENSE.txt). User-approved picks after audition: jump=pepSound3, death=lowThreeTone (womp), door=powerUp7 (rising). Web-Audio-profiled selection (scratchpad/audition.mjs). Honors Sound Lab overrides: localStorage `ld_sfx_map` {event:"pack/name"} → `assets/sfx/lib/pack/name.ogg`; exposes NAMES/TRIM/srcFor.
- `soundlab.html` + `js/soundlab.js` + `css/soundlab.css` — SOUND LAB: user auditions & picks each of the 18 game sounds. 437-sound CC0 pool committed at `assets/sfx/lib/<pack>/` (6 Kenney packs: digital-audio, interface-sounds, impact-sounds, sci-fi-sounds, rpg-audio, ui-audio; engine/ambience loops excluded), manifest auto-genned in `js/sfxlib.js`. Per-event cards (curated candidate chips + browse-all sheet w/ search+pack filter), previews at in-game TRIM loudness, picks live instantly on device, "Copy my picks" exports JSON the user pastes to dev → dev hardcodes winners by copying lib file over `assets/sfx/<event>.ogg` (defaults identified by md5 in soundlab.js DEFAULTS). Entry: Settings screen + editor drawer. E2E: scratchpad/lab.mjs.

## Verification harness (scratchpad = /tmp/claude-0/.../scratchpad)
- `solve5.mjs [csv-indices]` — in-page autopilot beats ALL 25 levels (installs `window.__startPilot(idx)` via `__ld` hook; per-level strategies). Run after ANY physics/level change. 25/25 green.
- `ed2.mjs` — editor E2E: tour→place→test-play→beat→verify unlock→share code→play code→edit re-locks. Green.
- `fake.mjs` — pixel-compares fake vs real floor columns (must be identical). `final3.mjs` — mobile selection visibility.
- Playwright: `import pkg from '/opt/node22/lib/node_modules/playwright/index.js'`, executablePath `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## User preferences (learned)
- Mobile-first for everything; desktop = enhanced, not primary.
- Real sound assets only (CC0, kenney.nl), NO music, picky about feel — audition before swapping.
- Trolls must be pixel-perfect invisible in game; creator must see them in editor (X-ray).
- UI must self-explain: descriptions, spotlight tours, show-me highlights.
- Wants future: backend community (accounts, browse levels, ad revenue) — schema carries author/name/verified for it. Full editor-palette wishlist in README roadmap.

## State
All committed+pushed (HEAD cb7b5eb). All 18 tasks completed. No known bugs. QA workflow findings all fixed or consciously skipped (letterboxing, thumbnail-perception nit).
