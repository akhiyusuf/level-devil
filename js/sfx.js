// Level Devil clone — sound effects. Real CC0 assets (Kenney.nl), no music.
window.SFX = (() => {
  "use strict";
  const NAMES = ["jump", "land", "death", "coin", "star", "key", "door", "complete", "button",
                 "gate", "slam", "laser", "portal", "checkpoint", "click", "error", "pop", "appear"];
  const POLY = 4;                       // simultaneous copies per sound
  const bank = {};
  let volume = 0.8, muted = false;
  try {
    const s = JSON.parse(localStorage.getItem("ld_sound") || "{}");
    if (typeof s.volume === "number") volume = s.volume;
    muted = !!s.muted;
  } catch (_) {}

  // Sound Lab picks: {event: "pack/file"} -> assets/sfx/lib/pack/file.ogg overrides default
  let picks = {};
  try { picks = JSON.parse(localStorage.getItem("ld_sfx_map") || "{}"); } catch (_) {}

  const persist = () => localStorage.setItem("ld_sound", JSON.stringify({ volume, muted }));
  const srcFor = n => "assets/sfx/" + (typeof picks[n] === "string" && /^[\w-]+\/[\w.-]+$/.test(picks[n])
    ? "lib/" + picks[n] + ".ogg" : n + ".ogg") + "?v=9";

  for (const n of NAMES) {
    bank[n] = { i: 0, pool: Array.from({ length: POLY }, () => {
      const a = new Audio(srcFor(n));
      a.preload = "auto";
      return a;
    }) };
  }

  // per-sound loudness trim so nothing screams
  const TRIM = { land: 0.35, slam: 0.7, laser: 0.4, pop: 0.5, click: 0.6, death: 0.85, jump: 0.45, door: 0.7 };
  const lastAt = {};

  function play(name) {
    if (muted) return;
    const b = bank[name];
    if (!b) return;
    const now = performance.now();
    if (lastAt[name] && now - lastAt[name] < 60) return;   // debounce spam
    lastAt[name] = now;
    const a = b.pool[b.i = (b.i + 1) % POLY];
    a.volume = Math.min(1, volume * (TRIM[name] ?? 0.8));
    a.currentTime = 0;
    a.play().catch(() => {});                              // autoplay policies: fail silent
  }

  return {
    play,
    NAMES, TRIM, srcFor,                                   // Sound Lab hooks
    get volume() { return volume; },
    get muted() { return muted; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); persist(); },
    setMuted(m) { muted = !!m; persist(); },
  };
})();
