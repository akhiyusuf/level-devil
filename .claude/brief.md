# brief

- Level Devil "Play & Create": pixel platformer + WYSIWYG mobile editor. 25 levels / 3 worlds, all machine-verified (scratchpad solve5.mjs, in-page autopilot via __ld hook; editor hook __ed).
- Shared renderer `js/render.js` (game+editor+thumbnails, camera-aware, per-class colors+outlines). `js/game.js` = physics/camera/camZones/shell/progress. `js/share.js` = LD1. deflate codes + hash; verify-then-share gate via localStorage ld_verify handshake. `js/sfx.js` + assets/sfx (Kenney CC0, no music).
- Levels up to 9600×3240 (w/h + camZones in schema). Jump budget 126 up / 195 far. Cache tags ?v=6. Deploy: push branch claude/level-devil-clone-rnpfyi → GitHub Pages.
