// Level Devil clone — editor v3. Mobile-first (FAB -> palette sheet, props sheet),
// desktop gets docked panels. WYSIWYG via the game renderer; explanatory properties;
// spotlight tour; verify-then-share.
(() => {
  "use strict";

  const S = 3, SNAP = 10;
  const sfx = (n) => { if (window.SFX) SFX.play(n); };
  const $ = (id) => document.getElementById(id);
  const mqDesktop = matchMedia("(min-width: 980px)");

  // ================= object registry =================
  const REG = [
    { t: "solids", cat: "Terrain", label: "Ground", mk: (x, y) => ({ x, y, w: 160, h: 40 }),
      desc: "Solid block. The honest one. Build floors, walls and ledges with it." },
    { t: "oneways", cat: "Terrain", label: "One-Way", mk: (x, y) => ({ x, y, w: 120, h: 14 }),
      desc: "Jump up THROUGH it, land on top. Can't fall back through." },
    { t: "fakes", cat: "Terrain", label: "Fake Block", mk: (x, y) => ({ x, y, w: 120, h: 40 }),
      desc: "TROLL — looks exactly like ground in-game, but nothing is there. The hatching is only visible to you." },
    { t: "invisible", cat: "Terrain", label: "Invisible", mk: (x, y) => ({ x, y, w: 120, h: 16 }),
      desc: "TROLL — solid platform that players can't see until they touch it. The reverse of a Fake Block." },
    { t: "ice", cat: "Terrain", label: "Ice", mk: (x, y) => ({ x, y, w: 160, h: 40 }),
      desc: "Slippery floor. Players keep sliding after they stop pressing. Put a pit after it." },
    { t: "conveyors", cat: "Terrain", label: "Conveyor", mk: (x, y) => ({ x, y, w: 200, h: 40, belt: 140 }),
      desc: "Moving belt floor. Positive push = right, negative = left. Make them fight the current." },
    { t: "disappear", cat: "Terrain", label: "Vanishing", mk: (x, y) => ({ x, y, w: 90, h: 22, delay: 0.25 }),
      desc: "TROLL — fades away moments after being stood on. Keep 'em moving." },
    { t: "collapse", cat: "Terrain", label: "Crumbling", mk: (x, y) => ({ x, y, w: 110, h: 22, delay: 0.18 }),
      desc: "TROLL — drops out of the world shortly after a foot touches it." },
    { t: "appearing", cat: "Terrain", label: "Appearing", zone: 1, mk: (x, y) => ({ x, y, w: 90, h: 16, zone: { x: x - 140, y: y - 60, w: 120, h: 140 } }),
      desc: "Hidden until the player enters its trigger zone, then becomes solid. A reward for the brave." },
    { t: "movers", cat: "Terrain", label: "Moving Platform", partner: ["x2", "y2"], mk: (x, y) => ({ x, y, w: 90, h: 16, x2: x + 180, y2: y, speed: 120 }),
      desc: "Rides back and forth between two points and carries the player. Drag the ◆ to set the far end." },
    { t: "gates", cat: "Terrain", label: "Gate", mk: (x, y) => ({ id: "g" + (Date.now() % 10000), x, y, w: 24, h: 128 }),
      desc: "A wall that can open. Link a Pressure Plate to it, or set a Key to unlock it." },

    { t: "spikes", cat: "Hazards", label: "Spikes", enums: { dir: ["up", "down"] }, mk: (x, y) => ({ x, y, w: 120, h: 14, dir: "up" }),
      desc: "The classic. Touch = death. Point them up from floors or down from ceilings." },
    { t: "popspikes", cat: "Hazards", label: "Pop-up Spikes", zone: 1, mk: (x, y) => ({ x, y, w: 60, h: 40, dir: "up", zone: { x: x - 110, y: y - 120, w: 110, h: 160 } }),
      desc: "TROLL — hidden in the floor until the trigger zone is entered, then springs up. Put the zone where they'll walk." },
    { t: "fallers", cat: "Hazards", label: "Crusher", zone: 1, mk: (x, y) => ({ x, y, w: 80, h: 80, deadly: true, zone: { x: x - 110, y: 0, w: 110, h: 540 } }),
      desc: "Spiked slab that slams down when its zone is entered, then keeps cycling forever. Time it or die." },
    { t: "saws", cat: "Hazards", label: "Saw Blade", partner: ["cx2", "cy2"], mk: (x, y) => ({ cx: x, cy: y, r: 26, cx2: x, cy2: y - 110, speed: 110 }),
      desc: "Spinning blade, deadly to touch. Drag the ◆ to give it a patrol path (same spot = stationary)." },
    { t: "lasers", cat: "Hazards", label: "Laser", mk: (x, y) => ({ x, y, w: 8, h: 300, on: 0.7, off: 1.1, phase: 0 }),
      desc: "Beam that cycles on/off. It blinks a warning before firing. Set On time to 99 for always-on." },
    { t: "fires", cat: "Hazards", label: "Fire", mk: (x, y) => ({ x, y, w: 70 }),
      desc: "A strip of flames on the floor. Jump it." },
    { t: "chasers", cat: "Hazards", label: "Chaser", zone: 1, mk: (x, y) => ({ x, y, w: 34, h: 48, speed: 165, zone: { x: x + 100, y: y - 100, w: 140, h: 200 } }),
      desc: "TROLL — spiked block that wakes when its zone is entered and slides toward the player forever. Jumpable." },
    { t: "patrols", cat: "Hazards", label: "Patrol", mk: (x, y) => ({ x, y, minX: x - 80, maxX: x + 120, speed: 100 }),
      desc: "Little enemy that marches between two points. Deadly on touch — hop over it." },

    { t: "gravZones", cat: "Traps", label: "Gravity Flip", mk: (x, y) => ({ x, y, w: 60, h: 140 }),
      desc: "Walking into this flips gravity — the player falls UP and walks on ceilings. Add a second one to flip back." },
    { t: "ctrlZones", cat: "Traps", label: "Reverse Controls", mk: (x, y) => ({ x, y, w: 80, h: 140 }),
      desc: "TROLL — invisible in-game! Crossing it swaps left and right. Pure evil." },
    { t: "jumpZones", cat: "Traps", label: "Jump Modifier", mk: (x, y) => ({ x, y, w: 160, h: 180, mult: 0.65, visible: true }),
      desc: "Inside this area jump strength is multiplied. Weak knees or moon boots — your call." },
    { t: "portals", cat: "Traps", label: "Portal Pair", partner: ["bx", "by"], mk: (x, y) => ({ ax: x, ay: y, bx: x + 240, by: y, w: 34, h: 64, oneway: false }),
      desc: "Step in the entrance, pop out at the ◆ exit. Troll idea: a portal right before the door that sends them back to spawn." },
    { t: "fakeExits", cat: "Traps", label: "Fake Exit", enums: { action: ["spikes", "flee"] }, mk: (x, y) => ({ x, y, action: "spikes" }),
      desc: "TROLL — looks IDENTICAL to the real door. Either it bites, or it vanishes. Triggering it reveals the real door (tip: set the real door to hidden)." },

    { t: "buttons", cat: "Interactive", label: "Pressure Plate", enums: { mode: ["toggle", "hold"] }, mk: (x, y) => ({ x, y, mode: "toggle", targets: [] }),
      desc: "Stand on it to open/close Gates. Tick which gates it controls in the panel." },
    { t: "keys", cat: "Interactive", label: "Key", mk: (x, y) => ({ x, y, id: "k1" }),
      desc: "Collect to permanently open every Gate set to need this key." },
    { t: "checkpoints", cat: "Interactive", label: "Checkpoint", mk: (x, y) => ({ x, y, fake: false }),
      desc: "Respawn point once touched. The 'fake' checkbox makes it lie — flag goes up, nothing is saved." },

    { t: "coins", cat: "Collect", label: "Coin", mk: (x, y) => ({ x, y }),
      desc: "Optional shiny. Use them to bait players toward traps — that's what the devil would do." },
    { t: "stars", cat: "Collect", label: "Star", mk: (x, y) => ({ x, y }),
      desc: "A rare collectible for the boldest route. One per level feels right." },

    { t: "camZones", cat: "Level", label: "Camera Zone", mk: (x, y) => ({ x: Math.max(0, x - 480), y: 0, w: 960, h: 540 }),
      desc: "While the player is inside, the camera is locked to this box — they can't see past it. Make arenas, hide what's ahead." },
  ];
  const CATS = [...new Set(REG.map((r) => r.cat))];
  const regOf = (t) => REG.find((r) => r.t === t);
  const SINGLETONS = {
    spawn: { label: "Spawn Point", desc: "Where the player appears. The camera starts here — everything else can wait off-screen." },
    door: { label: "Exit Door", desc: "The goal. It can run away from the player, or start hidden until a Fake Exit is triggered." },
  };

  function rectOf(t, o) {
    switch (t) {
      case "saws": return { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
      case "fires": return { x: o.x, y: o.y, w: o.w, h: 26 };
      case "patrols": return { x: o.x, y: o.y, w: 24, h: 22 };
      case "buttons": return { x: o.x, y: o.y - 10, w: 44, h: 10 };
      case "coins": return { x: o.x - 12, y: o.y - 12, w: 24, h: 24 };
      case "stars": return { x: o.x - 11, y: o.y - 11, w: 22, h: 22 };
      case "keys": return { x: o.x - 10, y: o.y - 8, w: 20, h: 16 };
      case "checkpoints": return { x: o.x - 6, y: o.y - 50, w: 26, h: 50 };
      case "portals": return { x: o.ax, y: o.ay, w: o.w, h: o.h };
      case "fakeExits": return { x: o.x, y: o.y, w: 44, h: 64 };
      default: return { x: o.x, y: o.y, w: o.w ?? 40, h: o.h ?? 40 };
    }
  }
  const partnerRect = (t, o) => {
    if (t === "portals") return { x: o.bx, y: o.by, w: o.w, h: o.h };
    if (t === "movers") return { x: o.x2, y: o.y2, w: o.w, h: o.h };
    if (t === "saws") return { x: o.cx2 - o.r, y: o.cy2 - o.r, w: o.r * 2, h: o.r * 2 };
    return null;
  };

  // ================= level model =================
  const blank = () => ({
    name: "My Level", hint: "", author: "", theme: "tan", reverse: false,
    w: 960, h: 540,
    spawn: { x: 50, y: 466 },
    door: { x: 880, y: 436, runaway: false, wall: 920, speed: 280, trigger: 160, hidden: false },
    solids: [{ x: 0, y: 500, w: 960, h: 40 }],
    oneways: [], fakes: [], invisible: [], ice: [], conveyors: [], disappear: [], collapse: [],
    appearing: [], movers: [], gates: [], spikes: [], popspikes: [], fallers: [], saws: [],
    lasers: [], fires: [], chasers: [], patrols: [], portals: [], gravZones: [], ctrlZones: [],
    jumpZones: [], camZones: [], buttons: [], keys: [], checkpoints: [], fakeExits: [], coins: [], stars: [],
  });
  let level = blank();
  try { const a = JSON.parse(localStorage.getItem("ld_editor_autosave") || "null"); if (a) level = Object.assign(blank(), a); } catch (_) {}

  const levelJSON = () => JSON.stringify(level);
  const levelHash = () => LDS.hash(levelJSON());
  let verifiedHash = localStorage.getItem("ld_verified_hash") || "";

  // ================= undo/redo + autosave =================
  let undoStack = [levelJSON()], undoPos = 0;
  function push() {
    undoStack = undoStack.slice(0, undoPos + 1);
    undoStack.push(levelJSON());
    if (undoStack.length > 100) undoStack.shift();
    undoPos = undoStack.length - 1;
    localStorage.setItem("ld_editor_autosave", levelJSON());
    dirty = true;
    syncShareBtn();
  }
  function restoreTo(json) {
    level = Object.assign(blank(), JSON.parse(json));
    localStorage.setItem("ld_editor_autosave", levelJSON());
    sel = null; dirty = true;
    syncDrawer(); buildProps(); syncShareBtn(); sizeWorldBuf();
  }
  const undo = () => { if (undoPos > 0) { undoPos--; restoreTo(undoStack[undoPos]); } };
  const redo = () => { if (undoPos < undoStack.length - 1) { undoPos++; restoreTo(undoStack[undoPos]); } };

  // ================= view / canvases =================
  const stage = $("stage"), cv = $("ed"), ctx = cv.getContext("2d");
  const mini = $("minimap"), mctx = mini.getContext("2d");
  const view = { x: 0, y: 0, zoom: 0.8 };
  let dirty = true;
  let xray = true;

  const worldBuf = document.createElement("canvas");
  const wbctx = worldBuf.getContext("2d");
  function sizeWorldBuf() {
    worldBuf.width = Math.ceil(level.w / S);
    worldBuf.height = Math.ceil(level.h / S);
    dirty = true;
  }
  function sizeCanvas() { cv.width = stage.clientWidth; cv.height = stage.clientHeight; clampView(); }
  addEventListener("resize", () => { sizeCanvas(); if (tourAt >= 0) positionTour(); });

  const minZoom = () => Math.min(cv.width / level.w, cv.height / level.h) * 0.9;
  function clampView() {
    view.zoom = Math.max(Math.min(minZoom(), 0.35), Math.min(2.5, view.zoom));
    const vw = cv.width / view.zoom, vh = cv.height / view.zoom;
    view.x = vw >= level.w ? (level.w - vw) / 2 : Math.max(0, Math.min(level.w - vw, view.x));
    view.y = vh >= level.h ? (level.h - vh) / 2 : Math.max(0, Math.min(level.h - vh, view.y));
    $("zoom-pill").textContent = Math.round(view.zoom * 100) + "%";
  }
  let sheetShift = 0; // slides the world up while the mobile props sheet covers the bottom
  const s2w = (mx, my) => ({ x: view.x + mx / view.zoom, y: view.y + (my + sheetShift) / view.zoom });
  const w2sX = (x) => (x - view.x) * view.zoom;
  const w2sY = (y) => (y - view.y) * view.zoom - sheetShift;

  // ================= selection =================
  let placing = null;
  let sel = null;
  const selObj = () => !sel ? null : sel.t === "spawn" ? level.spawn : sel.t === "door" ? level.door : level[sel.t][sel.i];
  const snap = (v) => Math.round(v / SNAP) * SNAP;

  // make the selected object visible in the part of the canvas not covered by the mobile sheet:
  // pan where possible, and slide the render up (sheetShift) where the clamp won't let us pan
  function ensureVisible() {
    const o = selObj();
    if (!o) { sheetShift = 0; return; }
    if (mqDesktop.matches) { sheetShift = 0; return; }
    const rc = sel.i != null ? rectOf(sel.t, o) : { x: o.x, y: o.y, w: 44, h: 64 };
    const cx0 = rc.x + rc.w / 2, cy0 = rc.y + rc.h / 2;
    const usableH = cv.height * 0.30;   // the props sheet covers roughly the lower 60% on phones
    const vw = cv.width / view.zoom;
    if (cx0 < view.x + vw * 0.08 || cx0 > view.x + vw * 0.92) {
      view.x = cx0 - vw / 2;
      clampView();
    }
    sheetShift = 0;
    const sy = (cy0 - view.y) * view.zoom;
    if (sy > usableH * 0.85) sheetShift = Math.min(sy - usableH * 0.6, cv.height * 0.5);
  }

  // ================= rendering =================
  function redrawWorld() {
    const rt = LDR.buildRuntime(level);
    LDR.drawWorld(wbctx, rt, THEMES[level.theme] || THEMES.tan, { time: 0.85, camX: 0, camY: 0, xray });
    LDR.drawSpriteAt("idle0", level.spawn.x, level.spawn.y, 34, false, false, 0.95);
    dirty = false;
  }
  function drawMinimap() {
    const mw = mini.clientWidth || 104;
    const mh = Math.max(20, Math.round(mw * level.h / level.w));
    if (mini.width !== mw || mini.height !== mh) { mini.width = mw; mini.height = mh; }
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(worldBuf, 0, 0, mw, mh);
    mctx.strokeStyle = "#00d0ff"; mctx.lineWidth = 1;
    const vw = cv.width / view.zoom, vh = cv.height / view.zoom;
    mctx.strokeRect(view.x / level.w * mw, view.y / level.h * mh, Math.min(1, vw / level.w) * mw, Math.min(1, vh / level.h) * mh);
  }
  function frame() {
    if (dirty) redrawWorld();
    ctx.imageSmoothingEnabled = view.zoom < 1.2;
    ctx.fillStyle = "#0e0a07";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(worldBuf, view.x / S, view.y / S, cv.width / view.zoom / S, cv.height / view.zoom / S, 0, -sheetShift, cv.width, cv.height);
    drawOverlays();
    drawMinimap();
    requestAnimationFrame(frame);
  }

  function chip(x, y, txt, color) {
    ctx.font = "11px system-ui";
    const w = ctx.measureText(txt).width + 12;
    ctx.fillStyle = "rgba(10,7,5,0.82)";
    ctx.beginPath(); ctx.roundRect(x, y, w, 17, 6); ctx.fill();
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(txt, x + 6, y + 9);
  }

  function drawOverlays() {
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
    ctx.strokeRect(w2sX(0), w2sY(0), level.w * view.zoom, level.h * view.zoom);

    for (const z of level.camZones) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = "#f0a01e"; ctx.lineWidth = 2;
      ctx.strokeRect(w2sX(z.x), w2sY(z.y), z.w * view.zoom, z.h * view.zoom);
      ctx.setLineDash([]);
      chip(w2sX(z.x) + 4, w2sY(z.y) + 4, "📷 camera zone", "#f0a01e");
    }
    chip(w2sX(level.spawn.x), w2sY(level.spawn.y) - 20, "SPAWN", "#7ec8ff");
    if (level.door.hidden) chip(w2sX(level.door.x), w2sY(level.door.y) - 20, "DOOR (hidden)", "#e8d87a");

    const o = selObj();
    if (!o) return;
    const rc = sel.t === "spawn" ? { x: o.x, y: o.y, w: 30, h: 34 }
      : sel.t === "door" ? { x: o.x, y: o.y, w: 44, h: 64 }
      : rectOf(sel.t, o);
    ctx.strokeStyle = "#00d0ff"; ctx.lineWidth = 2;
    ctx.strokeRect(w2sX(rc.x) - 2, w2sY(rc.y) - 2, rc.w * view.zoom + 4, rc.h * view.zoom + 4);
    chip(w2sX(rc.x), w2sY(rc.y) - 20, sel.i != null ? regOf(sel.t).label : SINGLETONS[sel.t].label, "#00d0ff");
    if (sel.i != null && o.w != null && o.h != null && sel.t !== "portals") {
      ctx.fillStyle = "#00d0ff";
      ctx.fillRect(w2sX(rc.x + rc.w) - 6, w2sY(rc.y + rc.h) - 6, 12, 12);
    }
    if (o.zone) {
      ctx.setLineDash([6, 5]); ctx.strokeStyle = "#00d0ff";
      ctx.strokeRect(w2sX(o.zone.x), w2sY(o.zone.y), o.zone.w * view.zoom, o.zone.h * view.zoom);
      ctx.setLineDash([]);
      chip(w2sX(o.zone.x) + 3, w2sY(o.zone.y) + 3, "trigger zone — drag me", "#00a0c8");
    }
    if (sel.i != null) {
      const pb = partnerRect(sel.t, o);
      if (pb) {
        ctx.setLineDash([3, 5]); ctx.strokeStyle = "#00d0ff";
        ctx.beginPath();
        ctx.moveTo(w2sX(rc.x + rc.w / 2), w2sY(rc.y + rc.h / 2));
        ctx.lineTo(w2sX(pb.x + pb.w / 2), w2sY(pb.y + pb.h / 2));
        ctx.stroke(); ctx.setLineDash([]);
        const cxp = w2sX(pb.x + pb.w / 2), cyp = w2sY(pb.y + pb.h / 2);
        ctx.fillStyle = "#00d0ff";
        ctx.beginPath();
        ctx.moveTo(cxp, cyp - 9); ctx.lineTo(cxp + 9, cyp); ctx.lineTo(cxp, cyp + 9); ctx.lineTo(cxp - 9, cyp);
        ctx.fill();
        chip(cxp + 12, cyp - 8, sel.t === "portals" ? "exit — drag me" : "path end — drag me", "#00a0c8");
      }
      if (sel.t === "patrols") {
        ctx.setLineDash([2, 4]); ctx.strokeStyle = "#00d0ff";
        ctx.beginPath();
        ctx.moveTo(w2sX(o.minX), w2sY(o.y + 22)); ctx.lineTo(w2sX(o.maxX), w2sY(o.y + 22));
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  // ================= hit testing =================
  const inR = (x, y, r, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  function hitAll(wx, wy) {
    const hits = [];
    if (inR(wx, wy, { x: level.spawn.x, y: level.spawn.y, w: 30, h: 34 }, 6)) hits.push({ t: "spawn" });
    if (inR(wx, wy, { x: level.door.x, y: level.door.y, w: 44, h: 64 }, 6)) hits.push({ t: "door" });
    for (let ri = REG.length - 1; ri >= 0; ri--) {
      const r = REG[ri], arr = level[r.t] || [];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (inR(wx, wy, rectOf(r.t, arr[i]), 5)) hits.push({ t: r.t, i });
        else { const pb = partnerRect(r.t, arr[i]); if (pb && inR(wx, wy, pb, 5)) hits.push({ t: r.t, i }); }
      }
    }
    return hits;
  }
  function grabTest(wx, wy) {
    const o = selObj();
    if (!o || sel.i == null) return null;
    const rc = rectOf(sel.t, o);
    const hs = 8 / view.zoom;
    if (o.w != null && o.h != null && sel.t !== "portals" &&
        inR(wx, wy, { x: rc.x + rc.w - hs, y: rc.y + rc.h - hs, w: hs * 2, h: hs * 2 })) return "resize";
    const pb = partnerRect(sel.t, o);
    if (pb && inR(wx, wy, pb, 6)) return "partner";
    if (o.zone && inR(wx, wy, o.zone, 4)) return "zone";
    return null;
  }

  // ================= pointer interactions =================
  const pointers = new Map();
  let drag = null, pinch = null, lastTapHits = [], lastTapIdx = 0;

  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: view.zoom };
      drag = null;
      return;
    }
    const { x: wx, y: wy } = s2w(e.offsetX, e.offsetY);
    if (placing) {
      const o = placing.mk(snap(wx), snap(wy));
      level[placing.t].push(o);
      sel = { t: placing.t, i: level[placing.t].length - 1 };
      if (!e.shiftKey) setPlacing(null);
      sfx("appear");
      push(); buildProps(); ensureVisible();
      return;
    }
    const grab = grabTest(wx, wy);
    if (grab) { drag = { mode: grab, lx: wx, ly: wy, moved: false }; return; }
    const hits = hitAll(wx, wy);
    if (hits.length) {
      const same = JSON.stringify(hits) === JSON.stringify(lastTapHits);
      lastTapIdx = same ? (lastTapIdx + 1) % hits.length : 0;
      lastTapHits = hits;
      sel = hits[lastTapIdx];
      drag = { mode: "move", lx: wx, ly: wy, moved: false };
      sfx("click");
      buildProps();
      if (!mqDesktop.matches) ensureVisible();
    } else {
      drag = { mode: "pan", lx: e.offsetX, ly: e.offsetY, moved: false };
    }
  });

  cv.addEventListener("pointermove", (e) => {
    const pt = pointers.get(e.pointerId);
    if (pt) { pt.x = e.offsetX; pt.y = e.offsetY; }
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx0 = (a.x + b.x) / 2, cy0 = (a.y + b.y) / 2;
      const before = s2w(cx0, cy0);
      view.zoom = pinch.z0 * (d / Math.max(20, pinch.d0));
      clampView();
      const after = s2w(cx0, cy0);
      view.x += before.x - after.x; view.y += before.y - after.y;
      clampView();
      return;
    }
    if (!drag) return;
    if (drag.mode === "pan") {
      view.x -= (e.offsetX - drag.lx) / view.zoom;
      view.y -= (e.offsetY - drag.ly) / view.zoom;
      drag.lx = e.offsetX; drag.ly = e.offsetY;
      drag.moved = true;
      clampView();
      return;
    }
    const { x: wx, y: wy } = s2w(e.offsetX, e.offsetY);
    const dx = wx - drag.lx, dy = wy - drag.ly;
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    drag.moved = true;
    const o = selObj();
    if (!o) return;
    const mv = (obj, kx, ky) => { obj[kx] = snap(obj[kx] + dx); obj[ky] = snap(obj[ky] + dy); };
    if (drag.mode === "move") {
      if (sel.t === "saws") mv(o, "cx", "cy");
      else if (sel.t === "portals") mv(o, "ax", "ay");
      else if (sel.t === "patrols") { mv(o, "x", "y"); o.minX = snap(o.minX + dx); o.maxX = snap(o.maxX + dx); }
      else mv(o, "x", "y");
    } else if (drag.mode === "zone") mv(o.zone, "x", "y");
    else if (drag.mode === "partner") {
      if (sel.t === "portals") mv(o, "bx", "by");
      else if (sel.t === "movers") mv(o, "x2", "y2");
      else if (sel.t === "saws") mv(o, "cx2", "cy2");
    } else if (drag.mode === "resize") {
      o.w = Math.max(10, snap(o.w + dx));
      o.h = Math.max(6, snap(o.h + dy));
    }
    drag.lx = snap(drag.lx + dx); drag.ly = snap(drag.ly + dy);
    dirty = true;
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag) {
      if (drag.mode === "pan" && !drag.moved) { sel = null; sheetShift = 0; buildProps(); }
      else if (drag.moved && drag.mode !== "pan") { push(); buildProps(); }
      drag = null;
    }
  };
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);

  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const before = s2w(e.offsetX, e.offsetY);
    view.zoom *= e.deltaY < 0 ? 1.12 : 0.89;
    clampView();
    const after = s2w(e.offsetX, e.offsetY);
    view.x += before.x - after.x; view.y += before.y - after.y;
    clampView();
  }, { passive: false });

  mini.addEventListener("pointerdown", (e) => {
    const r = mini.getBoundingClientRect();
    view.x = (e.clientX - r.left) / r.width * level.w - cv.width / view.zoom / 2;
    view.y = (e.clientY - r.top) / r.height * level.h - cv.height / view.zoom / 2;
    clampView();
  });

  addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.key === "Escape") { setPlacing(null); sel = null; buildProps(); }
    if ((e.key === "Delete" || e.key === "Backspace") && sel && sel.i != null) deleteSel();
    if (e.ctrlKey && e.key.toLowerCase() === "d" && sel && sel.i != null) { e.preventDefault(); dupSel(); }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key.toLowerCase() === "y") || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z")) { e.preventDefault(); redo(); }
    const o = selObj();
    if (o && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : SNAP;
      const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
      const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
      if (sel.t === "saws") { o.cx += dx; o.cy += dy; if (o.cx2 != null) { o.cx2 += dx; o.cy2 += dy; } }
      else if (sel.t === "portals") { o.ax += dx; o.ay += dy; }
      else { o.x += dx; o.y += dy; }
      push(); dirty = true; buildProps();
    }
  });

  function deleteSel() { level[sel.t].splice(sel.i, 1); sel = null; sfx("error"); push(); buildProps(); }
  function dupSel() {
    const c = JSON.parse(JSON.stringify(level[sel.t][sel.i]));
    if (c.x != null) c.x += 30; if (c.ax != null) { c.ax += 30; c.bx += 30; } if (c.cx != null) { c.cx += 30; if (c.cx2 != null) c.cx2 += 30; }
    level[sel.t].push(c);
    sel = { t: sel.t, i: level[sel.t].length - 1 };
    sfx("appear"); push(); buildProps();
  }

  // ================= palette (sections; lives in dock or sheet) =================
  const thumbCache = {};
  function thumbURL(t) {
    const k = t + "|" + level.theme;
    if (!thumbCache[k]) {
      const tc = document.createElement("canvas"); tc.width = tc.height = 44;
      if (t === "camZones") {
        const g = tc.getContext("2d");
        g.strokeStyle = "#f0a01e"; g.setLineDash([4, 3]); g.lineWidth = 2;
        g.strokeRect(6, 9, 32, 26);
        g.font = "13px system-ui"; g.textAlign = "center"; g.fillText("📷", 22, 27);
      } else if (t === "spawn") {
        LDR.drawThumb(tc.getContext("2d"), "spawnPt", level.theme, 44);
      } else if (t === "door") {
        LDR.drawThumb(tc.getContext("2d"), "doorObj", level.theme, 44);
      } else {
        LDR.drawThumb(tc.getContext("2d"), t, level.theme, 44);
      }
      thumbCache[k] = tc.toDataURL();
    }
    return thumbCache[k];
  }

  const BADGES = {
    oneways: "↑", fakes: "✕", invisible: "👻", disappear: "⏱", collapse: "▼",
    appearing: "✨", movers: "↔", ice: "❄", conveyors: "▶", ctrlZones: "⇄", jumpZones: "⇅",
  };
  function setPlacing(r) {
    placing = r;
    document.querySelectorAll(".pal-grid button").forEach((b) => b.classList.toggle("placing", r && b.dataset.t === r.t));
    const ban = $("armed-banner");
    if (r) { ban.style.display = ""; $("armed-text").textContent = `Placing: ${r.label} — tap the canvas`; }
    else ban.style.display = "none";
  }
  $("armed-cancel").onclick = () => { sfx("click"); setPlacing(null); };

  function buildPalette() {
    const root = $("palette-root");
    root.innerHTML = "";
    for (const c of CATS) {
      const sec = document.createElement("div"); sec.className = "pal-sec";
      const h = document.createElement("h4"); h.textContent = c; sec.appendChild(h);
      const grid = document.createElement("div"); grid.className = "pal-grid";
      for (const r of REG.filter((r) => r.cat === c)) {
        const b = document.createElement("button");
        b.dataset.t = r.t; b.title = r.desc;
        const img = document.createElement("img"); img.src = thumbURL(r.t);
        const sp = document.createElement("span"); sp.textContent = r.label;
        b.appendChild(img); b.appendChild(sp);
        const badge = BADGES[r.t];   // tells the lookalike terrain tiles apart at a glance
        if (badge) { const bd = document.createElement("i"); bd.className = "tile-badge"; bd.textContent = badge; b.appendChild(bd); }
        b.onclick = () => {
          sfx("click");
          setPlacing(placing === r ? null : r);
          if (!mqDesktop.matches) $("palette-sheet").style.display = "none";
        };
        grid.appendChild(b);
      }
      sec.appendChild(grid);
      root.appendChild(sec);
    }
  }

  // ================= explanatory properties =================
  const FRIENDLY = {
    x: ["X position", "pixels from the left edge"], y: ["Y position", "pixels from the top"],
    w: ["Width", "in pixels"], h: ["Height", "in pixels"],
    mode: ["Plate mode", "toggle = a press flips it · hold = open only while stood on"],
    cx: ["Center X", ""], cy: ["Center Y", ""], r: ["Blade radius", ""],
    ax: ["Entrance X", ""], ay: ["Entrance Y", ""],
    speed: ["Speed", "pixels per second"],
    delay: ["Delay", "seconds of mercy before it gives way"],
    belt: ["Belt push", "+ pushes right · − pushes left"],
    on: ["On time", "seconds the beam fires (99 = always on)"],
    off: ["Off time", "seconds of safety between blasts"],
    phase: ["Rhythm offset", "shifts this laser's timing vs others (seconds)"],
    mult: ["Jump power", "1 = normal · 0.65 = weak knees · 1.5 = moon boots"],
    oneway: ["One-way trip", "can't come back through the exit"],
    fake: ["Fake (evil)", "flag goes up, but NOTHING is saved"],
    runaway: ["Runs away", "the door flees when the player gets close"],
    wall: ["Gives up at X", "where the fleeing door finally stops"],
    trigger: ["Scare distance", "how close the player gets before it runs"],
    hidden: ["Start hidden", "revealed when a Fake Exit is triggered"],
    visible: ["Visible in game", "untick to hide this zone from players (troll)"],
    minX: ["Patrol left edge", ""], maxX: ["Patrol right edge", ""],
    id: ["ID name", "plates and gates use this name to find it"],
    dir: ["Points", "which way the spikes face"],
    action: ["When touched", "spikes = it bites · flee = it vanishes"],
    deadly: ["Deadly", "it crushes"],
  };
  const ENUMS = { dir: ["up", "down"], action: ["spikes", "flee"], mode: ["toggle", "hold"] };
  const ENUM_LABELS = { toggle: "toggle", hold: "hold", spikes: "spikes — it bites", flee: "flee — it vanishes", up: "up", down: "down" };
  const POS_KEYS = ["x", "y", "w", "h", "cx", "cy", "r", "ax", "ay"];
  const PATH_KEYS = ["x2", "y2", "bx", "by", "cx2", "cy2"];
  const LINK_KEYS = ["id", "targets", "needKey", "mode"];

  function fieldRow(key, val, setter) {
    const row = document.createElement("div"); row.className = "prow";
    const lab = document.createElement("div"); lab.className = "plab";
    const [name, help] = FRIENDLY[key] || [key, ""];
    lab.innerHTML = `<b>${name}</b>` + (help ? `<small>${help}</small>` : "");
    row.appendChild(lab);
    let inp;
    if (ENUMS[key] && typeof val === "string") {
      inp = document.createElement("select");
      for (const v of ENUMS[key]) { const op = document.createElement("option"); op.value = v; op.textContent = ENUM_LABELS[v] || v; inp.appendChild(op); }
      inp.value = val;
      inp.onchange = () => { setter(inp.value); push(); };
    } else if (typeof val === "boolean") {
      inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = val;
      inp.onchange = () => { setter(inp.checked); push(); };
    } else if (typeof val === "number") {
      inp = document.createElement("input"); inp.type = "number"; inp.value = val;
      inp.step = ["delay", "on", "off", "phase", "mult"].includes(key) ? 0.05 : 1;
      inp.onchange = () => { setter(parseFloat(inp.value) || 0); push(); };
    } else {
      inp = document.createElement("input"); inp.type = "text"; inp.value = val;
      inp.onchange = () => { setter(inp.value); push(); };
    }
    row.appendChild(inp);
    return row;
  }

  function group(title, hint) {
    const g = document.createElement("div"); g.className = "pgroup";
    const h = document.createElement("h4"); h.textContent = title; g.appendChild(h);
    if (hint) { const p = document.createElement("p"); p.className = "ghint"; p.textContent = hint; g.appendChild(p); }
    return g;
  }

  function buildProps() {
    const root = $("props-root");
    const o = selObj();
    root.innerHTML = "";
    syncPropsVisibility();
    if (!o) return;
    const meta = sel.i != null ? regOf(sel.t) : SINGLETONS[sel.t];

    // header: picture + name + what it does
    const head = document.createElement("div"); head.className = "props-head";
    const img = document.createElement("img");
    img.src = thumbURL(sel.i != null ? sel.t : sel.t === "spawn" ? "spawn" : "door");
    const hd = document.createElement("div");
    hd.innerHTML = `<h3>${meta.label}</h3><p>${meta.desc}</p>`;
    head.appendChild(img); head.appendChild(hd);
    root.appendChild(head);

    if (sel.i != null) {
      const acts = document.createElement("div"); acts.className = "props-actions";
      const bd = document.createElement("button"); bd.textContent = "⧉ Duplicate"; bd.onclick = dupSel;
      const bx2 = document.createElement("button"); bx2.textContent = "🗑 Delete"; bx2.className = "danger"; bx2.onclick = deleteSel;
      acts.appendChild(bd); acts.appendChild(bx2);
      root.appendChild(acts);
    }

    const keys = Object.keys(o).filter((k) => k !== "zone" && k !== "deadly");
    const posKeys = keys.filter((k) => POS_KEYS.includes(k));
    const linkKeys = keys.filter((k) => LINK_KEYS.includes(k));
    const pathKeys = keys.filter((k) => PATH_KEYS.includes(k));
    const behaveKeys = keys.filter((k) => !posKeys.includes(k) && !linkKeys.includes(k) && !pathKeys.includes(k));

    if (posKeys.length) {
      const g = group(posKeys.some((k) => ["w", "h", "r"].includes(k)) ? "Position & size" : "Position");
      for (const k of posKeys) g.appendChild(fieldRow(k, o[k], (v) => { o[k] = v; dirty = true; }));
      root.appendChild(g);
    }
    if (behaveKeys.length) {
      const g = group("Behaviour");
      for (const k of behaveKeys) g.appendChild(fieldRow(k, o[k], (v) => { o[k] = v; dirty = true; }));
      root.appendChild(g);
    }
    if (linkKeys.length) {
      const g = group("Connections", sel.t === "buttons" ? "Tick every gate this plate should open or close." : null);
      for (const k of linkKeys) {
        if (k === "targets") {
          if (!level.gates.length) {
            const p = document.createElement("p"); p.className = "pnote";
            p.textContent = "No gates in the level yet — place a Gate first, then link it here.";
            g.appendChild(p);
          } else {
            for (const gt of level.gates) {
              const line = document.createElement("label"); line.className = "chkline";
              const cb = document.createElement("input"); cb.type = "checkbox";
              cb.checked = o.targets.includes(gt.id);
              cb.onchange = () => {
                o.targets = cb.checked ? [...o.targets, gt.id] : o.targets.filter((t2) => t2 !== gt.id);
                push();
              };
              line.appendChild(cb);
              line.appendChild(Object.assign(document.createElement("span"), { textContent: `Gate "${gt.id}"` }));
              line.appendChild(Object.assign(document.createElement("small"), { textContent: ` at x ${gt.x}` }));
              g.appendChild(line);
            }
          }
        } else if (k === "needKey") {
          const row = document.createElement("div"); row.className = "prow";
          row.innerHTML = `<div class="plab"><b>Opens with key</b><small>pick a key, or none for plate control</small></div>`;
          const sel2 = document.createElement("select");
          const none = document.createElement("option"); none.value = ""; none.textContent = "— no key —"; sel2.appendChild(none);
          for (const kk of level.keys) { const op = document.createElement("option"); op.value = kk.id; op.textContent = `Key "${kk.id}"`; sel2.appendChild(op); }
          sel2.value = o.needKey || "";
          sel2.onchange = () => { if (sel2.value) o.needKey = sel2.value; else delete o.needKey; push(); };
          row.appendChild(sel2);
          g.appendChild(row);
        } else {
          g.appendChild(fieldRow(k, o[k], (v) => { o[k] = v; dirty = true; }));
        }
      }
      // gates: offer needKey even if absent
      if (sel.t === "gates" && !("needKey" in o)) {
        const row = document.createElement("div"); row.className = "prow";
        row.innerHTML = `<div class="plab"><b>Opens with key</b><small>pick a key, or none for plate control</small></div>`;
        const sel2 = document.createElement("select");
        const none = document.createElement("option"); none.value = ""; none.textContent = "— no key —"; sel2.appendChild(none);
        for (const kk of level.keys) { const op = document.createElement("option"); op.value = kk.id; op.textContent = `Key "${kk.id}"`; sel2.appendChild(op); }
        sel2.onchange = () => { if (sel2.value) o.needKey = sel2.value; push(); buildProps(); };
        row.appendChild(sel2);
        g.appendChild(row);
      }
      root.appendChild(g);
    }
    if (o.zone) {
      const g = group("Trigger zone", "The object activates the moment the player enters this area. Drag the dashed box on the canvas, or fine-tune here.");
      for (const zk of ["x", "y", "w", "h"]) {
        g.appendChild(fieldRow(zk, o.zone[zk], (v) => { o.zone[zk] = v; dirty = true; }));
      }
      root.appendChild(g);
    }
    if (pathKeys.length) {
      const g = group(sel.t === "portals" ? "Exit point" : "Path end",
        sel.t === "portals" ? "Where the player pops out. Drag the ◆ diamond on the canvas." : "The far point it travels to. Drag the ◆ diamond on the canvas.");
      for (const k of pathKeys) g.appendChild(fieldRow(k, o[k], (v) => { o[k] = v; dirty = true; }));
      root.appendChild(g);
    }
    if (!mqDesktop.matches) $("props-sheet-title").textContent = meta.label;
  }

  function syncPropsVisibility() {
    const has = !!selObj();
    if (mqDesktop.matches) {
      $("props-sheet").style.display = "none";
      $("dock-right-empty").style.display = has ? "none" : "";
    } else {
      $("props-sheet").style.display = has ? "" : "none";
    }
  }

  // ================= layout re-parenting (mobile sheets <-> desktop docks) =================
  function placeRoots() {
    const pr = $("palette-root"), ps = $("props-root");
    if (mqDesktop.matches) {
      $("dock-left").appendChild(pr);
      $("dock-right").insertBefore(ps, $("dock-right-empty"));
      $("palette-sheet").style.display = "none";
    } else {
      $("palette-slot").appendChild(pr);
      $("props-slot").appendChild(ps);
    }
    syncPropsVisibility();
  }
  mqDesktop.addEventListener("change", placeRoots);

  $("btn-add").onclick = () => { sfx("click"); $("palette-sheet").style.display = ""; };
  $("palette-close").onclick = () => { sfx("click"); $("palette-sheet").style.display = "none"; };
  $("props-close").onclick = () => { sfx("click"); sel = null; sheetShift = 0; buildProps(); };

  // ================= drawer =================
  function syncDrawer() {
    $("lv-name").value = level.name; $("lv-hint").value = level.hint || "";
    $("lv-author").value = level.author || ""; $("lv-theme").value = level.theme;
    $("lv-w").value = level.w; $("lv-h").value = level.h;
    $("lv-reverse").checked = !!level.reverse;
    $("lv-label").textContent = level.name;
  }
  $("btn-menu").onclick = () => { sfx("click"); syncDrawer(); $("drawer").style.display = ""; };
  $("btn-drawer-close").onclick = () => { sfx("click"); $("drawer").style.display = "none"; };
  $("drawer").addEventListener("pointerdown", (e) => { if (e.target === $("drawer")) $("drawer").style.display = "none"; });
  $("lv-name").onchange = () => { level.name = $("lv-name").value || "My Level"; $("lv-label").textContent = level.name; push(); };
  $("lv-hint").onchange = () => { level.hint = $("lv-hint").value; push(); };
  $("lv-author").onchange = () => { level.author = $("lv-author").value; push(); };
  $("lv-theme").onchange = () => { level.theme = $("lv-theme").value; push(); buildPalette(); };
  $("lv-w").onchange = () => { level.w = Math.max(960, Math.min(9600, +$("lv-w").value || 960)); push(); sizeWorldBuf(); clampView(); };
  $("lv-h").onchange = () => { level.h = Math.max(540, Math.min(3240, +$("lv-h").value || 540)); push(); sizeWorldBuf(); clampView(); };
  $("lv-reverse").onchange = () => { level.reverse = $("lv-reverse").checked; push(); };
  $("btn-clear").onclick = () => {
    if (!confirm("Clear the whole level? (↩ Undo can bring it back)")) return;
    level = blank(); sel = null; push(); syncDrawer(); buildProps(); sizeWorldBuf();
  };
  $("btn-export").onclick = () => {
    const blob = new Blob([JSON.stringify(level, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (level.name || "level").toLowerCase().replace(/\W+/g, "-") + ".json";
    a.click();
  };
  $("btn-import").onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      f.text().then((txt) => {
        try { level = Object.assign(blank(), JSON.parse(txt)); sel = null; push(); syncDrawer(); buildProps(); sizeWorldBuf(); }
        catch (err) { alert("Not valid level JSON: " + err.message); }
      });
    };
    inp.click();
  };

  // ================= topbar toggles =================
  $("btn-xray").onclick = () => {
    xray = !xray; dirty = true; sfx("click");
    $("btn-xray").classList.toggle("on", xray);
  };
  $("btn-undo").onclick = () => { sfx("click"); undo(); };
  $("btn-redo").onclick = () => { sfx("click"); redo(); };

  // ================= test / verify / share =================
  function syncShareBtn() {
    const ok = verifiedHash && verifiedHash === levelHash();
    const b = $("btn-share");
    b.classList.toggle("locked", !ok);
    b.textContent = ok ? "🔗 Share" : "🔒 Share";
    b.title = ok ? "Your level is verified — share it!" : "Beat your level in ▶ Test to unlock sharing";
  }
  $("btn-test").onclick = () => {
    sfx("click");
    localStorage.setItem("ld_custom_level", levelJSON());
    localStorage.removeItem("ld_verify");
    window.open("index.html?custom=1", "ldtest");
  };
  function checkVerify() {
    try {
      const v = JSON.parse(localStorage.getItem("ld_verify") || "null");
      if (v && v.hash === levelHash() && verifiedHash !== v.hash) {
        verifiedHash = v.hash;
        localStorage.setItem("ld_verified_hash", verifiedHash);
        syncShareBtn();
        sfx("complete");
      }
    } catch (_) {}
  }
  addEventListener("focus", checkVerify);
  addEventListener("storage", checkVerify);
  setInterval(checkVerify, 1500);

  $("btn-share").onclick = async () => {
    if (!(verifiedHash && verifiedHash === levelHash())) {
      sfx("error");
      alert("🔒 Not verified yet.\n\nHit ▶ Test and beat your own level from spawn — if you can't beat it, neither can anyone else. Any edit needs a fresh verify run.");
      return;
    }
    sfx("complete");
    const code = await LDS.encode(level);
    $("share-url").value = location.href.replace(/editor\.html.*$/, "index.html#lvl=") + code;
    $("share-code").value = code;
    $("share-dlg").style.display = "";
  };
  $("copy-url").onclick = () => { navigator.clipboard.writeText($("share-url").value).catch(() => {}); $("copy-url").textContent = "✓"; setTimeout(() => $("copy-url").textContent = "Copy", 1200); };
  $("copy-code").onclick = () => { navigator.clipboard.writeText($("share-code").value).catch(() => {}); $("copy-code").textContent = "✓"; setTimeout(() => $("copy-code").textContent = "Copy", 1200); };
  $("share-close").onclick = () => $("share-dlg").style.display = "none";

  // ================= help (with Show-me highlighting) =================
  const HELP_SECTIONS = [
    ["Placing objects", () => mqDesktop.matches ? "#dock-left" : "#btn-add",
      "Pick an object from the palette, then tap the canvas where you want it. Hold Shift to place several. Press the tile again (or ✕ on the banner) to cancel."],
    ["Moving around", "#stage",
      "Drag empty space to pan. Pinch or scroll to zoom. Your level can be up to 10 screens wide — set its size in the ☰ menu."],
    ["The minimap", "#minimap",
      "The little map shows your whole level and the box shows what's on screen. Tap anywhere on it to jump there."],
    ["Editing objects", null,
      "Tap any object to open its panel — every setting is explained there. Drag objects to move; drag the ■ corner to resize; dashed boxes are trigger zones; ◆ diamonds are path ends and portal exits. Tap the same spot again to cycle through overlapping objects."],
    ["X-ray vision", "#btn-xray",
      "Fake blocks (hatched), invisible platforms, pop-up spikes and hidden doors are invisible to players. X-ray ghosts them for YOU. Toggle it off to see the level exactly as players will."],
    ["Test & verify", "#btn-test",
      "▶ Test opens your level in the game. Beat it from spawn and it becomes verified — proof it's beatable."],
    ["Sharing", "#btn-share",
      "Once verified, Share gives you a link and a code. Friends paste the code on the game's title screen. Any edit re-locks sharing until you verify again."],
  ];
  $("btn-help").onclick = () => { sfx("click"); buildHelp(); $("help-dlg").style.display = ""; };
  $("help-close").onclick = () => $("help-dlg").style.display = "none";
  function buildHelp() {
    const b = $("help-body");
    b.innerHTML = "";
    for (const [title, target, text] of HELP_SECTIONS) {
      const h = document.createElement("h4");
      h.textContent = title;
      const tgt = typeof target === "function" ? target() : target;
      if (tgt) {
        const btn = document.createElement("button");
        btn.className = "showme"; btn.textContent = "show me";
        btn.onclick = () => { $("help-dlg").style.display = "none"; flash(tgt); };
        h.appendChild(btn);
      }
      const p = document.createElement("p"); p.textContent = text;
      b.appendChild(h); b.appendChild(p);
    }
    const h2 = document.createElement("h4"); h2.textContent = "Every object, explained";
    b.appendChild(h2);
    for (const c of CATS) {
      const p = document.createElement("p");
      p.innerHTML = REG.filter((r) => r.cat === c).map((r) => `<b>${r.label}:</b> ${r.desc}`).join("<br/>");
      b.appendChild(p);
    }
  }
  function flash(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 2200);
  }

  // ================= spotlight tour =================
  const TOUR = [
    { sel: null, title: "Welcome to Create 😈", text: "This editor shows your level EXACTLY as players will see it — same renderer, just paused. Let's take 60 seconds to find everything." },
    { sel: () => mqDesktop.matches ? "#dock-left" : "#btn-add", title: "The palette", text: "Every placeable object lives here, with a picture and a description. Pick one, then tap the canvas to place it." },
    { sel: "#stage", title: "Your level", text: "Drag empty space to pan, pinch or scroll to zoom. Levels can be up to 10 screens wide (☰ menu → size). The camera follows the player in-game, so build beyond the first screen!" },
    { sel: "#minimap", title: "The minimap", text: "Your whole level at a glance — the bright box is your current view. Tap the map to jump anywhere." },
    { sel: "#btn-xray", title: "X-ray vision", text: "Fake blocks, invisible platforms and buried spikes can't be seen by players — this eye ghosts them for YOU. Toggle it off to preview the player's view." },
    { sel: "#btn-test", title: "Test it", text: "▶ Test opens your level in the game. Beating it from spawn VERIFIES the level — proof that it's possible." },
    { sel: "#btn-share", title: "Share it", text: "Once verified, Share creates a link + code anyone can play from the game's title screen. If you can't beat it, nobody can. Now go be evil." },
  ];
  let tourAt = -1;
  function positionTour() {
    if (tourAt < 0) return;
    const step = TOUR[tourAt];
    const spot = $("tour-spot"), card = $("tour-card");
    const tgt = step.sel ? document.querySelector(typeof step.sel === "function" ? step.sel() : step.sel) : null;
    if (tgt) {
      const r = tgt.getBoundingClientRect();
      spot.style.left = (r.left - 7) + "px"; spot.style.top = (r.top - 7) + "px";
      spot.style.width = (r.width + 14) + "px"; spot.style.height = (r.height + 14) + "px";
      const ch = 200, cw = Math.min(370, innerWidth - 22), margin = 14;
      if (r.height > innerHeight * 0.55 && (innerWidth - r.right > cw + margin || r.left > cw + margin)) {
        // tall target (a dock): put the card BESIDE it so it never covers what it describes
        card.style.left = (innerWidth - r.right > cw + margin ? r.right + margin : r.left - cw - margin) + "px";
        card.style.top = Math.max(10, r.top + 30) + "px";
      } else {
        let cy = r.bottom + margin;
        if (cy + ch > innerHeight) cy = Math.max(10, r.top - ch - margin);
        card.style.top = cy + "px";
        card.style.left = Math.max(10, Math.min(innerWidth - cw - 12, r.left)) + "px";
      }
    } else {
      spot.style.left = "50vw"; spot.style.top = "40vh"; spot.style.width = "0px"; spot.style.height = "0px";
      card.style.left = Math.max(10, innerWidth / 2 - 180) + "px";
      card.style.top = Math.max(10, innerHeight / 2 - 140) + "px";
    }
    $("tour-title").textContent = step.title;
    $("tour-text").textContent = step.text;
    $("tour-step").textContent = `${tourAt + 1}/${TOUR.length}`;
    $("tour-next").textContent = tourAt === TOUR.length - 1 ? "Let's go!" : "Next →";
  }
  function showTour(i) { tourAt = i; $("tour").style.display = ""; positionTour(); }
  function endTour() { tourAt = -1; $("tour").style.display = "none"; localStorage.setItem("ld_tour_done", "1"); }
  $("tour-next").onclick = () => { sfx("click"); (tourAt + 1 < TOUR.length) ? showTour(tourAt + 1) : endTour(); };
  $("tour-skip").onclick = () => { sfx("click"); endTour(); };
  $("btn-tour").onclick = () => { $("drawer").style.display = "none"; showTour(0); };

  // ================= boot =================
  buildPalette();
  placeRoots();
  syncDrawer();
  syncShareBtn();
  sizeWorldBuf();
  sizeCanvas();
  view.zoom = Math.min(cv.height / 560, 1.2);
  clampView();
  buildProps();
  if (!localStorage.getItem("ld_tour_done")) showTour(0);
  requestAnimationFrame(frame);

  // debug hook for automated tests
  window.__ed = {
    get level() { return level; },
    get sel() { return sel; },
    get view() { return view; },
    get verified() { return verifiedHash === levelHash(); },
    place(t, x, y) { const r = regOf(t); const o = r.mk(x, y); level[t].push(o); sel = { t, i: level[t].length - 1 }; push(); buildProps(); ensureVisible(); return o; },
    select(t, i) { sel = { t, i }; buildProps(); },
    push, hash: levelHash,
  };
})();
