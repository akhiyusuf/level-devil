// Sound Lab — audition & pick each game sound from the CC0 library. Picks live in
// localStorage ld_sfx_map ({event:"pack/name"}); sfx.js reads them. Export -> dev hardcodes.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const PACKS = window.SFXLIB.packs;
  const PACK_LABEL = { "digital-audio": "Digital", "interface-sounds": "Interface", "impact-sounds": "Impact",
                       "sci-fi-sounds": "Sci-fi", "rpg-audio": "RPG", "ui-audio": "UI" };

  // identity of the shipped default file for each event (verified by hash)
  const DEFAULTS = {
    jump: "digital-audio/phaseJump1", land: "impact-sounds/footstep_concrete_002",
    death: "interface-sounds/error_005", coin: "interface-sounds/glass_004",
    star: "interface-sounds/confirmation_003", key: "rpg-audio/metalLatch",
    door: "rpg-audio/doorOpen_2", complete: "interface-sounds/confirmation_001",
    button: "ui-audio/switch6", gate: "rpg-audio/metalLatch",
    slam: "impact-sounds/impactBell_heavy_000", laser: "sci-fi-sounds/laserRetro_002",
    portal: "interface-sounds/maximize_004", checkpoint: "interface-sounds/confirmation_001",
    click: "interface-sounds/click_003", error: "rpg-audio/cloth2",
    pop: "rpg-audio/drawKnife3", appear: "sci-fi-sounds/forceField_001",
  };
  // same in-game loudness trim as sfx.js -> previews sound like gameplay
  const TRIM = { land: 0.35, slam: 0.7, laser: 0.4, pop: 0.5, click: 0.6, death: 0.85, jump: 0.45, door: 0.7 };

  const D = "digital-audio/", I = "interface-sounds/", M = "impact-sounds/", S = "sci-fi-sounds/", R = "rpg-audio/", U = "ui-audio/";
  const EVENTS = [
    { id: "jump", ico: "🐇", title: "Jump", when: "Every time the player leaves the ground. Fires constantly — short and soft usually feels best.",
      cands: [D+"pepSound3", D+"pepSound1", D+"pepSound2", D+"pepSound4", D+"pepSound5", D+"phaseJump1", D+"phaseJump2", D+"phaseJump3", D+"phaseJump4", D+"phaseJump5", D+"phaserUp3", D+"phaserUp5", D+"highUp"] },
    { id: "land", ico: "🦶", title: "Land", when: "Player's feet hit the floor after a jump or fall.",
      cands: [M+"footstep_concrete_002", M+"footstep_concrete_000", M+"footstep_concrete_004", M+"footstep_wood_000", M+"footstep_wood_002", M+"footstep_carpet_001", M+"footstep_grass_002", M+"footstep_snow_001", M+"impactSoft_medium_000", M+"impactSoft_medium_002", M+"impactGeneric_light_001", R+"footstep00", R+"footstep04"] },
    { id: "death", ico: "💀", title: "Death", when: "Any death — spikes, crushers, lasers, falling into the void. You'll hear this one a lot. Choose wisely.",
      cands: [D+"lowThreeTone", D+"lowDown", D+"lowRandom", D+"phaserDown1", D+"phaserDown2", D+"phaserDown3", D+"zapThreeToneDown", D+"spaceTrash1", S+"explosionCrunch_000", S+"explosionCrunch_002", S+"lowFrequency_explosion_000", S+"lowFrequency_explosion_001", I+"error_006", I+"error_008", M+"impactPunch_heavy_001"] },
    { id: "coin", ico: "🪙", title: "Coin", when: "Collecting a coin.",
      cands: [D+"pepSound1", I+"glass_002", I+"glass_004", I+"glass_005", I+"pluck_001", I+"pluck_002", I+"tick_001", I+"tick_002", R+"handleCoins", R+"handleCoins2", D+"tone1", D+"twoTone1", I+"select_004"] },
    { id: "star", ico: "⭐", title: "Star", when: "Grabbing a star — the fancy bonus collectible. Deserves a little sparkle.",
      cands: [D+"powerUp5", D+"powerUp1", D+"powerUp3", D+"powerUp8", D+"powerUp11", D+"threeTone1", D+"threeTone2", D+"highUp", D+"zapThreeToneUp", I+"confirmation_003", I+"confirmation_004", I+"maximize_008"] },
    { id: "key", ico: "🗝", title: "Key pickup", when: "Picking up a key (used to unlock key-doors).",
      cands: [D+"threeTone1", R+"metalClick", R+"metalLatch", I+"tick_002", I+"toggle_002", I+"select_003", I+"select_005", D+"twoTone2", M+"impactMetal_light_001", M+"impactMetal_light_003", M+"impactTin_medium_001", R+"handleSmallLeather"] },
    { id: "door", ico: "🚪", title: "Enter door", when: "Walking into the exit door — the little victory moment before the win screen.",
      cands: [D+"powerUp7", D+"powerUp2", D+"powerUp5", D+"powerUp9", D+"powerUp12", D+"phaserUp7", D+"zapThreeToneUp", D+"highUp", S+"doorOpen_000", S+"doorOpen_001", S+"doorOpen_002", R+"doorOpen_1", R+"doorOpen_2", I+"maximize_006", I+"open_002"] },
    { id: "complete", ico: "🏁", title: "Level clear", when: "Level cleared — plays over the win screen.",
      cands: [I+"confirmation_001", I+"confirmation_002", I+"confirmation_003", I+"confirmation_004", D+"powerUp3", D+"powerUp6", D+"powerUp8", D+"powerUp10", D+"powerUp11", D+"threeTone1", D+"threeTone2", I+"question_003"] },
    { id: "button", ico: "🔘", title: "Floor button", when: "Stepping on a floor button (the ones that open gates or spring traps).",
      cands: [I+"switch_002", I+"click_001", I+"click_003", I+"click_005", I+"switch_004", I+"switch_005", I+"switch_006", I+"switch_007", I+"tick_001", U+"click1", U+"click3", U+"switch6", U+"switch13", R+"metalClick", M+"impactPlate_light_001"] },
    { id: "gate", ico: "🚧", title: "Gate open/close", when: "A gate or key-door opens or shuts — usually right after a button press or key use.",
      cands: [S+"doorClose_001", S+"doorOpen_000", S+"doorOpen_001", S+"doorClose_000", S+"doorClose_002", R+"doorOpen_1", R+"doorOpen_2", R+"doorClose_1", R+"doorClose_2", R+"metalLatch", R+"creak1", R+"creak3", M+"impactMetal_medium_000", M+"impactPlank_medium_000", I+"open_001", I+"close_001"] },
    { id: "slam", ico: "🧱", title: "Crusher slam", when: "A crusher slams shut. Should feel heavy — it just tried to flatten you.",
      cands: [S+"impactMetal_002", M+"impactMetal_heavy_000", M+"impactMetal_heavy_002", M+"impactMetal_heavy_004", M+"impactPlate_heavy_000", M+"impactPlate_heavy_001", M+"impactPlate_heavy_002", M+"impactWood_heavy_001", M+"impactPunch_heavy_000", M+"impactPunch_heavy_002", M+"impactBell_heavy_000", S+"impactMetal_000", S+"impactMetal_004", S+"lowFrequency_explosion_001"] },
    { id: "laser", ico: "🔴", title: "Laser on", when: "A laser beam switches on.",
      cands: [D+"zap1", D+"zap2", D+"laser1", D+"laser4", D+"laser5", D+"laser7", D+"laser9", S+"laserSmall_000", S+"laserSmall_002", S+"laserSmall_004", S+"laserRetro_000", S+"laserRetro_002", S+"laserLarge_001", S+"forceField_000", S+"forceField_002"] },
    { id: "portal", ico: "🌀", title: "Portal", when: "Teleporting through a portal.",
      cands: [D+"phaserUp3", D+"phaseJump1", D+"phaseJump2", D+"phaseJump3", D+"phaseJump4", D+"phaseJump5", D+"phaserUp1", D+"phaserUp5", D+"phaserUp7", D+"zapTwoTone", D+"zapThreeToneUp", I+"glitch_001", I+"glitch_003", S+"forceField_002", S+"forceField_003", I+"maximize_004"] },
    { id: "checkpoint", ico: "🚩", title: "Checkpoint", when: "Touching a checkpoint flag — your new respawn spot.",
      cands: [I+"confirmation_002", I+"confirmation_001", I+"confirmation_003", I+"confirmation_004", I+"question_001", I+"question_002", I+"select_006", I+"select_007", I+"tick_001", D+"twoTone1", D+"twoTone2", D+"tone1", D+"powerUp4"] },
    { id: "click", ico: "👆", title: "UI click", when: "Menu and editor button taps.",
      cands: [I+"click_002", I+"click_001", I+"click_003", I+"click_004", I+"click_005", U+"click1", U+"click2", U+"click3", U+"click4", U+"click5", U+"rollover1", U+"rollover2", U+"switch6", I+"tick_001", I+"select_001"] },
    { id: "error", ico: "⛔", title: "Nope / locked", when: "Something refuses — a locked door without the key, an invalid action.",
      cands: [I+"error_004", I+"error_001", I+"error_002", I+"error_003", I+"error_005", I+"error_006", I+"error_007", I+"error_008", I+"question_004", I+"back_002", D+"lowDown", I+"minimize_003"] },
    { id: "pop", ico: "⚠️", title: "Trap springs", when: "A hidden trap fires — pop-up spikes and their troll friends. The sound of betrayal.",
      cands: [M+"impactTin_medium_000", I+"pluck_001", I+"pluck_002", I+"drop_001", I+"drop_002", I+"drop_003", I+"drop_004", D+"zap1", D+"zap2", D+"spaceTrash2", D+"spaceTrash5", M+"impactGeneric_light_002", M+"impactGeneric_light_004", R+"chop", R+"knifeSlice", S+"slime_000", S+"slime_001", R+"drawKnife1"] },
    { id: "appear", ico: "✨", title: "Platform appears", when: "An invisible or timed platform materializes.",
      cands: [I+"drop_002", I+"maximize_001", I+"maximize_003", I+"maximize_005", I+"maximize_007", I+"minimize_001", I+"minimize_005", I+"open_003", I+"open_004", I+"glitch_002", D+"phaserUp1", D+"highUp", S+"forceField_001", R+"cloth2"] },
  ];

  // ---- state ----
  let picks = {};
  try { picks = JSON.parse(localStorage.getItem("ld_sfx_map") || "{}"); } catch (_) {}
  // prune picks that became the shipped default -> badge shows DEFAULT again
  for (const k of Object.keys(picks)) if (picks[k] === DEFAULTS[k]) delete picks[k];
  localStorage.setItem("ld_sfx_map", JSON.stringify(picks));
  let volume = 0.8;
  try { const s = JSON.parse(localStorage.getItem("ld_sound") || "{}"); if (typeof s.volume === "number") volume = s.volume; } catch (_) {}
  const savePicks = () => localStorage.setItem("ld_sfx_map", JSON.stringify(picks));
  const saveVol = () => { // share the game's volume setting, keep its mute flag
    let s = {}; try { s = JSON.parse(localStorage.getItem("ld_sound") || "{}"); } catch (_) {}
    localStorage.setItem("ld_sound", JSON.stringify({ ...s, volume }));
  };

  const current = ev => picks[ev] || DEFAULTS[ev];
  const pretty = ref => ref.split("/")[1].replace(/[_-]/g, " ").replace(/(\d+)$/, " $1").replace(/\s+/g, " ").trim();
  const packOf = ref => PACK_LABEL[ref.split("/")[0]] || ref.split("/")[0];

  // ---- audio: one player, stop previous, event-trimmed loudness ----
  let cur = null;
  function playRef(ref, ev) {
    if (cur) { cur.pause(); cur = null; }
    const a = new Audio("assets/sfx/lib/" + ref + ".ogg?v=9");
    a.volume = Math.min(1, volume * (TRIM[ev] ?? 0.8));
    a.play().catch(() => {});
    cur = a;
  }

  // ---- header pick count ----
  function refreshCount() {
    const n = Object.keys(picks).length;
    $("pick-count").textContent = n ? `${n} custom pick${n > 1 ? "s" : ""}` : "all defaults";
  }

  // ---- event cards ----
  const auditioning = {};      // ev -> ref currently auditioned in the card
  function card(E) {
    const el = document.createElement("div");
    el.className = "card"; el.id = "ev-" + E.id;
    el.innerHTML = `
      <div class="ev-head"><span class="ico">${E.ico}</span><h2>${E.title}</h2></div>
      <p class="ev-when">${E.when}</p>
      <div class="now-row">
        <span class="lab">IN GAME NOW</span>
        <button class="chip now-play"><span class="pl">▶</span><span class="now-name"></span></button>
        <span class="badge"></span>
        <button class="mini-reset" style="display:none">reset</button>
      </div>
      <div class="chips"></div>
      <div class="use-row">
        <span class="aud-name"></span>
        <button class="primary use-btn">✓ Use this</button>
      </div>`;
    const chips = el.querySelector(".chips");
    const cands = [...new Set(E.cands)];
    for (const ref of cands) {
      const c = document.createElement("button");
      c.className = "chip"; c.dataset.ref = ref;
      c.innerHTML = `<span class="pl">▶</span>${pretty(ref)}`;
      c.onclick = () => { playRef(ref, E.id); auditioning[E.id] = ref; paint(E); };
      chips.appendChild(c);
    }
    const more = document.createElement("button");
    more.className = "chip more"; more.textContent = "🔎 Browse all 437…";
    more.onclick = () => openBrowse(E);
    chips.appendChild(more);

    el.querySelector(".now-play").onclick = () => playRef(current(E.id), E.id);
    el.querySelector(".mini-reset").onclick = () => { delete picks[E.id]; savePicks(); delete auditioning[E.id]; paint(E); refreshCount(); };
    el.querySelector(".use-btn").onclick = () => {
      const ref = auditioning[E.id];
      if (!ref) return;
      if (ref === DEFAULTS[E.id]) delete picks[E.id]; else picks[E.id] = ref;
      savePicks(); delete auditioning[E.id]; paint(E); refreshCount();
    };
    return el;
  }

  function paint(E) {
    const el = $("ev-" + E.id), cu = current(E.id), isDef = !picks[E.id];
    el.querySelector(".now-name").textContent = pretty(cu) + " · " + packOf(cu);
    const b = el.querySelector(".badge");
    b.textContent = isDef ? "DEFAULT" : "YOUR PICK";
    b.className = "badge " + (isDef ? "def" : "custom");
    el.querySelector(".mini-reset").style.display = isDef ? "none" : "";
    const aud = auditioning[E.id];
    for (const c of el.querySelectorAll(".chips .chip:not(.more)")) {
      c.classList.toggle("picked", c.dataset.ref === cu);
      c.classList.toggle("audition", !!aud && c.dataset.ref === aud && aud !== cu);
    }
    const row = el.querySelector(".use-row");
    row.classList.toggle("show", !!aud && aud !== cu);
    if (aud) el.querySelector(".aud-name").textContent = "Auditioning: " + pretty(aud) + " · " + packOf(aud);
  }

  const evBox = $("events");
  for (const E of EVENTS) { evBox.appendChild(card(E)); paint(E); }
  refreshCount();

  // ---- browse-all sheet ----
  const ALL = [];
  for (const [p, files] of Object.entries(PACKS)) for (const f of files) ALL.push(p + "/" + f);
  let brEvent = null, brPack = "all", brAud = null;

  function openBrowse(E) {
    brEvent = E; brPack = "all"; brAud = null;
    $("browse-title").textContent = "Pick a sound for: " + E.title;
    $("browse-search").value = "";
    $("browse").style.display = "flex"; $("browse-dim").style.display = "";
    paintPacks(); paintList(); paintFoot();
  }
  function closeBrowse() { $("browse").style.display = "none"; $("browse-dim").style.display = "none"; brEvent = null; }
  $("browse-close").onclick = closeBrowse;
  $("browse-dim").onclick = closeBrowse;

  function paintPacks() {
    const box = $("browse-packs"); box.innerHTML = "";
    for (const p of ["all", ...Object.keys(PACKS)]) {
      const c = document.createElement("button");
      c.className = "pack-chip" + (brPack === p ? " on" : "");
      c.textContent = p === "all" ? "All" : PACK_LABEL[p] || p;
      c.onclick = () => { brPack = p; paintPacks(); paintList(); };
      box.appendChild(c);
    }
  }
  function paintList() {
    const q = $("browse-search").value.trim().toLowerCase();
    const box = $("browse-list"); box.innerHTML = "";
    const cu = current(brEvent.id);
    let shown = 0;
    for (const ref of ALL) {
      if (brPack !== "all" && !ref.startsWith(brPack + "/")) continue;
      if (q && !ref.toLowerCase().includes(q)) continue;
      if (++shown > 250) break;                       // safety: search narrows the rest
      const r = document.createElement("button");
      r.className = "snd-row" + (ref === brAud ? " audition" : "") + (ref === cu ? " current" : "");
      r.innerHTML = `<span class="pl">${ref === cu ? "✓" : "▶"}</span>${pretty(ref)}<span class="pk">${packOf(ref)}</span>`;
      r.onclick = () => { playRef(ref, brEvent.id); brAud = ref; paintList(); paintFoot(); };
      box.appendChild(r);
    }
    if (!shown) box.innerHTML = `<p style="padding:14px 6px;color:var(--muted);font-size:13px">No sounds match “${q}”.</p>`;
  }
  $("browse-search").oninput = paintList;
  function paintFoot() {
    $("browse-now").textContent = brAud ? "Auditioning: " + pretty(brAud) + " · " + packOf(brAud) : "nothing auditioned yet";
    $("browse-use").disabled = !brAud;
  }
  $("browse-use").onclick = () => {
    if (!brAud || !brEvent) return;
    if (brAud === DEFAULTS[brEvent.id]) delete picks[brEvent.id]; else picks[brEvent.id] = brAud;
    savePicks(); delete auditioning[brEvent.id];
    const E = brEvent; closeBrowse(); paint(E); refreshCount();
  };

  // ---- top controls ----
  $("vol").value = Math.round(volume * 100);
  $("vol").oninput = e => { volume = e.target.value / 100; saveVol(); };
  $("btn-reset-all").onclick = () => {
    if (!Object.keys(picks).length) return;
    if (!confirm("Reset every sound back to the game defaults?")) return;
    picks = {}; savePicks();
    for (const E of EVENTS) { delete auditioning[E.id]; paint(E); }
    refreshCount();
  };
  $("btn-export").onclick = async () => {
    const lines = EVENTS.map((E, i) => `  "${E.id}": "${current(E.id)}"${i < EVENTS.length - 1 ? "," : ""}${picks[E.id] ? "" : "   // default"}`);
    const txt = "Level Devil — my sound picks (paste this to your dev):\n{\n" + lines.join("\n") + "\n}";
    try { await navigator.clipboard.writeText(txt); $("btn-export").textContent = "✓ Copied!"; }
    catch (_) { prompt("Copy this and send it to your dev:", txt); }
    setTimeout(() => { $("btn-export").textContent = "📋 Copy my picks"; }, 1600);
  };

  // deep-link: soundlab.html#death scrolls to that card
  if (location.hash) {
    const t = $("ev-" + location.hash.slice(1));
    if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
