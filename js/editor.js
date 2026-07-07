// Level Devil clone — editor v2. True WYSIWYG (renders with the game's renderer, paused),
// mobile-first (touch drag / pinch zoom / bottom-sheet properties), palette thumbnails,
// camera zones + big levels, guided tour, verify-then-share.
(() => {
  "use strict";

  const S = 3, SNAP = 10;
  const sfx = (n) => { if (window.SFX) SFX.play(n); };
  const $ = (id) => document.getElementById(id);

  // ================= object registry =================
  // desc doubles as tooltip, info strip and help text. troll tips included.
  const REG = [
    { t: "solids", cat: "Terrain", label: "Ground", mk: (x, y) => ({ x, y, w: 160, h: 40 }),
      desc: "Solid block. The honest one. Build floors, walls and ledges with it." },
    { t: "oneways", cat: "Terrain", label: "One-Way", mk: (x, y) => ({ x, y, w: 120, h: 14 }),
      desc: "Jump up THROUGH it, land on top. Can't fall back through." },
    { t: "fakes", cat: "Terrain", label: "Fake Block", mk: (x, y) => ({ x, y, w: 120, h: 40 }),
      desc: "TROLL — looks exactly like ground, but nothing is there. Players fall straight through." },
    { t: "invisible", cat: "Terrain", label: "Invisible", mk: (x, y) => ({ x, y, w: 120, h: 16 }),
      desc: "TROLL — solid platform that can't be seen until touched. The reverse of a fake block." },
    { t: "ice", cat: "Terrain", label: "Ice", mk: (x, y) => ({ x, y, w: 160, h: 40 }),
      desc: "Slippery floor. Players keep sliding after they stop pressing. Put a pit after it." },
    { t: "conveyors", cat: "Terrain", label: "Conveyor", mk: (x, y) => ({ x, y, w: 200, h: 40, belt: 140 }),
      desc: "Moving belt floor. Positive speed pushes right, negative pushes left. Fight the current." },
    { t: "disappear", cat: "Terrain", label: "Vanishing", mk: (x, y) => ({ x, y, w: 90, h: 22, delay: 0.25 }),
      desc: "TROLL — fades away moments after being stood on. 'delay' = seconds of mercy." },
    { t: "collapse", cat: "Terrain", label: "Crumbling", mk: (x, y) => ({ x, y, w: 110, h: 22, delay: 0.18 }),
      desc: "TROLL — drops out of the world shortly after a foot touches it." },
    { t: "appearing", cat: "Terrain", label: "Appearing", zone: 1, mk: (x, y) => ({ x, y, w: 90, h: 16, zone: { x: x - 140, y: y - 60, w: 120, h: 140 } }),
      desc: "Hidden until the player enters its trigger zone, then becomes solid. Reward for the brave." },
    { t: "movers", cat: "Terrain", label: "Moving Platform", partner: ["x2", "y2"], mk: (x, y) => ({ x, y, w: 90, h: 16, x2: x + 180, y2: y, speed: 120 }),
      desc: "Rides back and forth between its two points and carries the player. Drag the ◆ to set the far end." },
    { t: "gates", cat: "Terrain", label: "Gate", mk: (x, y) => ({ id: "g" + (Date.now() % 10000), x, y, w: 24, h: 128 }),
      desc: "A wall that can open. Link a Pressure Plate to its id, or set needKey to a Key's id." },

    { t: "spikes", cat: "Hazards", label: "Spikes", enums: { dir: ["up", "down"] }, mk: (x, y) => ({ x, y, w: 120, h: 14, dir: "up" }),
      desc: "The classic. Touch = death. Point them up from floors or down from ceilings." },
    { t: "popspikes", cat: "Hazards", label: "Pop-up Spikes", zone: 1, mk: (x, y) => ({ x, y, w: 60, h: 40, dir: "up", zone: { x: x - 110, y: y - 120, w: 110, h: 160 } }),
      desc: "TROLL — hidden in the floor until the trigger zone is entered, then springs up. Place the zone where they'll walk." },
    { t: "fallers", cat: "Hazards", label: "Crusher", zone: 1, mk: (x, y) => ({ x, y, w: 80, h: 80, deadly: true, zone: { x: x - 110, y: 0, w: 110, h: 540 } }),
      desc: "Spiked slab that slams down when the zone is entered, then keeps cycling forever. Time it or die." },
    { t: "saws", cat: "Hazards", label: "Saw Blade", partner: ["cx2", "cy2"], mk: (x, y) => ({ cx: x, cy: y, r: 26, cx2: x, cy2: y - 110, speed: 110 }),
      desc: "Spinning blade, deadly to touch. Drag the ◆ to give it a patrol path (same spot = stationary)." },
    { t: "lasers", cat: "Hazards", label: "Laser", mk: (x, y) => ({ x, y, w: 8, h: 300, on: 0.7, off: 1.1, phase: 0 }),
      desc: "Beam that cycles on/off ('on'/'off' seconds, 'phase' offsets the rhythm). Set on=99 for always-on. It blinks before firing." },
    { t: "fires", cat: "Hazards", label: "Fire", mk: (x, y) => ({ x, y, w: 70 }),
      desc: "A strip of flames on the floor. Jump it. Sits 26px tall above its y." },
    { t: "chasers", cat: "Hazards", label: "Chaser", zone: 1, mk: (x, y) => ({ x, y, w: 34, h: 48, speed: 165, zone: { x: x + 100, y: y - 100, w: 140, h: 200 } }),
      desc: "TROLL — spiked block that wakes when the zone is entered and slides toward the player forever. They can jump over it." },
    { t: "patrols", cat: "Hazards", label: "Patrol", mk: (x, y) => ({ x, y, minX: x - 80, maxX: x + 120, speed: 100 }),
      desc: "Little enemy that marches between minX and maxX. Deadly on touch — hop over it." },

    { t: "gravZones", cat: "Traps", label: "Gravity Flip", mk: (x, y) => ({ x, y, w: 60, h: 140 }),
      desc: "Walking into this flips gravity — the player falls UP and walks on ceilings. Add a second one to flip back." },
    { t: "ctrlZones", cat: "Traps", label: "Reverse Controls", mk: (x, y) => ({ x, y, w: 80, h: 140 }),
      desc: "TROLL — invisible in-game! Crossing it swaps left and right. Pure evil." },
    { t: "jumpZones", cat: "Traps", label: "Jump Modifier", mk: (x, y) => ({ x, y, w: 160, h: 180, mult: 0.65, visible: true }),
      desc: "Inside this area jumps are multiplied by 'mult' (0.65 = weak knees, 1.5 = moon boots). visible=false hides it. Troll." },
    { t: "portals", cat: "Traps", label: "Portal Pair", partner: ["bx", "by"], mk: (x, y) => ({ ax: x, ay: y, bx: x + 240, by: y, w: 34, h: 64, oneway: false }),
      desc: "Step in A, pop out B (drag the ◆). oneway=true stops the return trip. Troll idea: a portal right before the door that sends them back to spawn." },
    { t: "fakeExits", cat: "Traps", label: "Fake Exit", enums: { action: ["spikes", "flee"] }, mk: (x, y) => ({ x, y, action: "spikes" }),
      desc: "TROLL — looks IDENTICAL to the real door. 'spikes' = it bites; 'flee' = it vanishes. Either way the real door is revealed (tip: set the real door hidden)." },

    { t: "buttons", cat: "Interactive", label: "Pressure Plate", enums: { mode: ["toggle", "hold"] }, mk: (x, y) => ({ x, y, mode: "toggle", targets: [] }),
      desc: "Stand on it to trigger the Gates listed in 'targets' (comma-separated ids). toggle = stays; hold = only while stood on." },
    { t: "keys", cat: "Interactive", label: "Key", mk: (x, y) => ({ x, y, id: "k1" }),
      desc: "Collect to permanently open every Gate whose needKey matches this id." },
    { t: "checkpoints", cat: "Interactive", label: "Checkpoint", mk: (x, y) => ({ x, y, fake: false }),
      desc: "Respawn point once touched. fake=true raises its flag but saves NOTHING. The cruelest checkbox in this editor." },

    { t: "coins", cat: "Collect", label: "Coin", mk: (x, y) => ({ x, y }),
      desc: "Optional shiny. Use them to bait players toward traps. That's what the devil would do." },
    { t: "stars", cat: "Collect", label: "Star", mk: (x, y) => ({ x, y }),
      desc: "A rare collectible for the boldest route. One per level feels right." },

    { t: "camZones", cat: "Level", label: "Camera Zone", mk: (x, y) => ({ x: Math.max(0, x - 480), y: 0, w: 960, h: 540 }),
      desc: "While the player is inside, the camera is locked to this box — they can't see past it. Make arenas, hide what's ahead." },
  ];
  const CATS = [...new Set(REG.map((r) => r.cat))];
  const regOf = (t) => REG.find((r) => r.t === t);

  const SINGLETON_DESC = {
    spawn: "Where the player appears. The camera starts here too — everything else can wait off-screen.",
    door: "The exit. runaway=true makes it flee toward 'wall' when approached. hidden=true keeps it invisible until a Fake Exit is triggered.",
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
    syncDrawer(); syncSheet(); syncShareBtn(); sizeWorldBuf();
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

  function sizeCanvas() {
    cv.width = stage.clientWidth;
    cv.height = stage.clientHeight;
    clampView();
  }
  addEventListener("resize", sizeCanvas);

  const minZoom = () => Math.min(cv.width / level.w, cv.height / level.h) * 0.9;
  function clampView() {
    view.zoom = Math.max(Math.min(minZoom(), 0.35), Math.min(2.5, view.zoom));
    const vw = cv.width / view.zoom, vh = cv.height / view.zoom;
    view.x = vw >= level.w ? (level.w - vw) / 2 : Math.max(0, Math.min(level.w - vw, view.x));
    view.y = vh >= level.h ? (level.h - vh) / 2 : Math.max(0, Math.min(level.h - vh, view.y));
  }
  const s2w = (mx, my) => ({ x: view.x + mx / view.zoom, y: view.y + my / view.zoom });
  const w2sX = (x) => (x - view.x) * view.zoom;
  const w2sY = (y) => (y - view.y) * view.zoom;

  // ================= selection =================
  let placing = null;      // REG entry armed for placement
  let sel = null;          // {t, i} | {t:'spawn'} | {t:'door'}
  const selObj = () => !sel ? null : sel.t === "spawn" ? level.spawn : sel.t === "door" ? level.door : level[sel.t][sel.i];
  const snap = (v) => Math.round(v / SNAP) * SNAP;

  // ================= rendering =================
  function redrawWorld() {
    const rt = LDR.buildRuntime(level);
    // editor previews trap states so nothing is invisible to the creator
    LDR.drawWorld(wbctx, rt, THEMES[level.theme] || THEMES.tan, { time: 0.85, camX: 0, camY: 0, xray });
    // spawn ghost drawn with the real character sprite
    LDR.drawSpriteAt("idle0", level.spawn.x, level.spawn.y, 34, false, false, 0.95);
    dirty = false;
    drawMinimap();
  }

  function drawMinimap() {
    const mw = 148, mh = Math.max(24, Math.round(mw * level.h / level.w));
    mini.width = mw; mini.height = mh;
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
    // world
    const sx = view.x / S, sy = view.y / S, sw = cv.width / view.zoom / S, sh = cv.height / view.zoom / S;
    ctx.drawImage(worldBuf, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    drawOverlays();
    drawMinimap();
    requestAnimationFrame(frame);
  }

  function drawOverlays() {
    // world border
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
    ctx.strokeRect(w2sX(0), w2sY(0), level.w * view.zoom, level.h * view.zoom);

    // camera zones (editor-only visual)
    for (let i = 0; i < level.camZones.length; i++) {
      const z = level.camZones[i];
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "#f0a01e"; ctx.lineWidth = 2;
      ctx.strokeRect(w2sX(z.x), w2sY(z.y), z.w * view.zoom, z.h * view.zoom);
      ctx.setLineDash([]);
      chip(w2sX(z.x) + 4, w2sY(z.y) + 4, "📷 camera zone", "#f0a01e");
    }

    // spawn / door chips
    chip(w2sX(level.spawn.x), w2sY(level.spawn.y) - 20, "SPAWN", "#7ec8ff");
    if (level.door.hidden) chip(w2sX(level.door.x), w2sY(level.door.y) - 20, "DOOR (hidden)", "#e8d87a");

    const o = selObj();
    if (o) {
      const rc = sel.t === "spawn" ? { x: o.x, y: o.y, w: 30, h: 34 }
        : sel.t === "door" ? { x: o.x, y: o.y, w: 44, h: 64 }
        : rectOf(sel.t, o);
      ctx.strokeStyle = "#00d0ff"; ctx.lineWidth = 2;
      ctx.strokeRect(w2sX(rc.x) - 2, w2sY(rc.y) - 2, rc.w * view.zoom + 4, rc.h * view.zoom + 4);
      chip(w2sX(rc.x), w2sY(rc.y) - 20, sel.i != null ? regOf(sel.t).label : sel.t.toUpperCase(), "#00d0ff");
      // resize handle
      if (sel.i != null && o.w != null && o.h != null && sel.t !== "portals") {
        ctx.fillStyle = "#00d0ff";
        ctx.fillRect(w2sX(rc.x + rc.w) - 6, w2sY(rc.y + rc.h) - 6, 12, 12);
      }
      // zone
      if (o.zone) {
        ctx.setLineDash([6, 5]); ctx.strokeStyle = "#00d0ff";
        ctx.strokeRect(w2sX(o.zone.x), w2sY(o.zone.y), o.zone.w * view.zoom, o.zone.h * view.zoom);
        ctx.setLineDash([]);
        chip(w2sX(o.zone.x) + 3, w2sY(o.zone.y) + 3, "trigger zone — drag me", "#00a0c8");
      }
      // partner
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
        }
        if (sel.t === "patrols") {
          ctx.setLineDash([2, 4]); ctx.strokeStyle = "#00d0ff";
          ctx.beginPath();
          ctx.moveTo(w2sX(o.minX), w2sY(o.y + 22)); ctx.lineTo(w2sX(o.maxX), w2sY(o.y + 22));
          ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
  }

  function chip(x, y, txt, color) {
    ctx.font = "11px system-ui";
    const w = ctx.measureText(txt).width + 12;
    ctx.fillStyle = "rgba(10,7,5,0.82)";
    ctx.beginPath(); ctx.roundRect(x, y, w, 17, 6); ctx.fill();
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(txt, x + 6, y + 9);
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
  let drag = null;          // {mode, lx, ly, moved} modes: move|zone|partner|resize|pan
  let pinch = null;         // {d0, z0, cx, cy}
  let lastTapHits = [], lastTapIdx = 0;

  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: view.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
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
      push(); syncSheet();
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
      syncSheet();
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
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const before = s2w(cx, cy);
      view.zoom = pinch.z0 * (d / Math.max(20, pinch.d0));
      clampView();
      const after = s2w(cx, cy);
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
      if (drag.mode === "pan" && !drag.moved) { sel = null; syncSheet(); }
      else if (drag.moved && drag.mode !== "pan") { push(); syncSheet(); }
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
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    view.x = fx * level.w - cv.width / view.zoom / 2;
    view.y = fy * level.h - cv.height / view.zoom / 2;
    clampView();
  });

  // keyboard (desktop comfort)
  addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.key === "Escape") { setPlacing(null); sel = null; syncSheet(); }
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
      push(); dirty = true; syncSheet();
    }
  });

  function deleteSel() { level[sel.t].splice(sel.i, 1); sel = null; sfx("error"); push(); syncSheet(); }
  function dupSel() {
    const c = JSON.parse(JSON.stringify(level[sel.t][sel.i]));
    if (c.x != null) c.x += 30; if (c.ax != null) { c.ax += 30; c.bx += 30; } if (c.cx != null) { c.cx += 30; if (c.cx2 != null) c.cx2 += 30; }
    level[sel.t].push(c);
    sel = { t: sel.t, i: level[sel.t].length - 1 };
    sfx("appear"); push(); syncSheet();
  }

  // ================= palette =================
  let activeCat = CATS[0];
  function setPlacing(r) {
    placing = r;
    [...$("palette").children].forEach((b) => b.classList.toggle("placing", r && b.dataset.t === r.t));
    const ban = $("armed-banner");
    if (r) { ban.style.display = ""; ban.textContent = `Placing: ${r.label} — tap the canvas (Shift = place many)`; }
    else ban.style.display = "none";
    $("info-strip").textContent = r ? r.desc : "Tap an object, then tap the canvas to place it. Drag objects to move them.";
  }
  function buildToolbar() {
    const catsEl = $("cats"), palEl = $("palette");
    catsEl.innerHTML = ""; palEl.innerHTML = "";
    for (const c of CATS) {
      const b = document.createElement("button");
      b.textContent = c; b.classList.toggle("active", c === activeCat);
      b.onclick = () => { sfx("click"); activeCat = c; buildToolbar(); };
      catsEl.appendChild(b);
    }
    for (const r of REG.filter((r) => r.cat === activeCat)) {
      const b = document.createElement("button");
      b.dataset.t = r.t; b.title = r.desc;
      const img = document.createElement("img");
      const tc = document.createElement("canvas"); tc.width = tc.height = 44;
      if (r.t === "camZones") { // editor-only visual: draw a dashed box icon
        const g = tc.getContext("2d");
        g.strokeStyle = "#f0a01e"; g.setLineDash([4, 3]); g.lineWidth = 2;
        g.strokeRect(6, 9, 32, 26);
        g.fillStyle = "#f0a01e"; g.font = "13px system-ui"; g.textAlign = "center"; g.fillText("📷", 22, 27);
      } else {
        LDR.drawThumb(tc.getContext("2d"), r.t, level.theme, 44);
      }
      img.src = tc.toDataURL();
      const sp = document.createElement("span"); sp.textContent = r.label;
      b.appendChild(img); b.appendChild(sp);
      b.onclick = () => { sfx("click"); setPlacing(placing === r ? null : r); };
      palEl.appendChild(b);
    }
  }

  // ================= properties sheet =================
  const ENUMS = { dir: ["up", "down"], action: ["spikes", "flee"], mode: ["toggle", "hold"] };
  const FIELD_HELP = {
    delay: "seconds before it gives way", belt: "push speed (+right / −left)", speed: "movement speed px/s",
    on: "seconds the beam is ON (99 = always)", off: "seconds OFF", phase: "cycle offset in seconds",
    mult: "jump strength multiplier", targets: "gate ids, comma-separated", needKey: "key id that opens this",
    id: "name used by plates/keys", oneway: "no return trip", fake: "raises flag, saves nothing (evil)",
    runaway: "door flees when approached", wall: "x it stops fleeing at", trigger: "distance that spooks it",
    hidden: "invisible until a Fake Exit is triggered", visible: "players can see this zone", minX: "left patrol limit", maxX: "right patrol limit",
  };
  function syncSheet() {
    const sheet = $("sheet"), body = $("sheet-body");
    const o = selObj();
    if (!o) { sheet.style.display = "none"; return; }
    sheet.style.display = "";
    $("sheet-title").textContent = sel.i != null ? regOf(sel.t).label : (sel.t === "spawn" ? "Spawn Point" : "Exit Door");
    $("sheet-desc").textContent = sel.i != null ? regOf(sel.t).desc : SINGLETON_DESC[sel.t];
    $("props-actions"); // noop safeguard
    document.querySelector(".sheet-actions").style.visibility = sel.i != null ? "visible" : "hidden";
    body.innerHTML = "";
    const addRow = (key, val, setter) => {
      const row = document.createElement("div"); row.className = "row";
      const lab = document.createElement("label");
      lab.textContent = key + (FIELD_HELP[key] ? ` — ${FIELD_HELP[key]}` : "");
      row.appendChild(lab);
      let inp;
      if (ENUMS[key] && typeof val === "string") {
        inp = document.createElement("select");
        for (const v of ENUMS[key]) { const op = document.createElement("option"); op.value = op.textContent = v; inp.appendChild(op); }
        inp.value = val;
        inp.onchange = () => { setter(inp.value); push(); };
      } else if (typeof val === "boolean") {
        inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = val;
        inp.onchange = () => { setter(inp.checked); push(); };
      } else if (typeof val === "number") {
        inp = document.createElement("input"); inp.type = "number"; inp.value = val;
        inp.step = ["delay", "on", "off", "phase", "mult"].includes(key) ? 0.05 : 1;
        inp.onchange = () => { setter(parseFloat(inp.value) || 0); push(); };
      } else if (Array.isArray(val)) {
        inp = document.createElement("input"); inp.type = "text"; inp.value = val.join(",");
        inp.onchange = () => { setter(inp.value.split(",").map((s) => s.trim()).filter(Boolean)); push(); };
      } else {
        inp = document.createElement("input"); inp.type = "text"; inp.value = val;
        inp.onchange = () => { setter(inp.value); push(); };
      }
      row.appendChild(inp); body.appendChild(row);
    };
    for (const k of Object.keys(o)) {
      if (k === "zone") continue;
      addRow(k, o[k], (v) => { o[k] = v; dirty = true; });
    }
    if (o.zone) for (const zk of ["x", "y", "w", "h"]) addRow("zone." + zk, o.zone[zk], (v) => { o.zone[zk] = v; dirty = true; });
  }
  $("btn-del").onclick = () => sel && sel.i != null && deleteSel();
  $("btn-dup").onclick = () => sel && sel.i != null && dupSel();
  $("btn-sheet-close").onclick = () => { sel = null; syncSheet(); };

  // ================= drawer (level settings) =================
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
  $("lv-theme").onchange = () => { level.theme = $("lv-theme").value; push(); buildToolbar(); };
  $("lv-w").onchange = () => { level.w = Math.max(960, Math.min(9600, +$("lv-w").value || 960)); push(); sizeWorldBuf(); clampView(); };
  $("lv-h").onchange = () => { level.h = Math.max(540, Math.min(3240, +$("lv-h").value || 540)); push(); sizeWorldBuf(); clampView(); };
  $("lv-reverse").onchange = () => { level.reverse = $("lv-reverse").checked; push(); };
  $("btn-clear").onclick = () => {
    if (!confirm("Clear the whole level? This can be undone with ↩.")) return;
    level = blank(); sel = null; push(); syncDrawer(); syncSheet(); sizeWorldBuf();
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
        try { level = Object.assign(blank(), JSON.parse(txt)); sel = null; push(); syncDrawer(); syncSheet(); sizeWorldBuf(); }
        catch (err) { alert("Not valid level JSON: " + err.message); }
      });
    };
    inp.click();
  };

  // ================= x-ray / undo buttons =================
  $("btn-xray").onclick = () => {
    xray = !xray; dirty = true; sfx("click");
    $("btn-xray").classList.toggle("on", xray);
    $("info-strip").textContent = xray
      ? "X-ray ON: hidden trolls (fakes, invisible platforms, pop-up spikes...) are ghosted so YOU can see them."
      : "X-ray OFF: this is exactly what players will see. Spooky, right?";
  };
  $("btn-undo").onclick = () => { sfx("click"); undo(); };
  $("btn-redo").onclick = () => { sfx("click"); redo(); };

  // ================= test play + verify + share =================
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
    $("info-strip").textContent = "Test running in the other tab. Beat it from spawn to VERIFY the level — then come back here to share.";
  };
  function checkVerify() {
    try {
      const v = JSON.parse(localStorage.getItem("ld_verify") || "null");
      if (v && v.hash === levelHash() && verifiedHash !== v.hash) {
        verifiedHash = v.hash;
        localStorage.setItem("ld_verified_hash", verifiedHash);
        syncShareBtn();
        sfx("complete");
        $("info-strip").textContent = "VERIFIED ✓ — you beat it, so it's beatable. The Share button is unlocked.";
      }
    } catch (_) {}
  }
  addEventListener("focus", checkVerify);
  addEventListener("storage", checkVerify);
  setInterval(checkVerify, 1500);

  $("btn-share").onclick = async () => {
    if (!(verifiedHash && verifiedHash === levelHash())) {
      sfx("error");
      $("info-strip").textContent = "🔒 Not verified yet — hit ▶ Test and beat your own level first. If you can't beat it, neither can they.";
      return;
    }
    sfx("complete");
    const code = await LDS.encode(level);
    const url = location.href.replace(/editor\.html.*$/, "index.html#lvl=") + code;
    $("share-url").value = url;
    $("share-code").value = code;
    $("share-dlg").style.display = "";
  };
  $("copy-url").onclick = () => { navigator.clipboard.writeText($("share-url").value).catch(() => {}); $("copy-url").textContent = "✓"; setTimeout(() => $("copy-url").textContent = "Copy", 1200); };
  $("copy-code").onclick = () => { navigator.clipboard.writeText($("share-code").value).catch(() => {}); $("copy-code").textContent = "✓"; setTimeout(() => $("copy-code").textContent = "Copy", 1200); };
  $("share-close").onclick = () => $("share-dlg").style.display = "none";

  // ================= help =================
  $("btn-help").onclick = () => { sfx("click"); buildHelp(); $("help-dlg").style.display = ""; };
  $("help-close").onclick = () => $("help-dlg").style.display = "none";
  function buildHelp() {
    const b = $("help-body");
    let html = `
      <h4>The basics</h4>
      <p><b>Place:</b> tap a palette tile, then tap the canvas. Hold Shift to place several.<br/>
      <b>Move:</b> drag any object. <b>Resize:</b> drag the ■ corner handle.<br/>
      <b>Pan:</b> drag empty space (or two fingers). <b>Zoom:</b> pinch or scroll.<br/>
      <b>Overlapping objects:</b> tap the same spot again to cycle through them.<br/>
      <b>Zones & paths:</b> dashed box = trigger zone, ◆ = path end / portal exit — drag them.</p>
      <h4>Big levels & the camera</h4>
      <p>Set Width/Height in the ☰ menu — up to 10 screens wide. The camera follows the player.
      Drop a <b>Camera Zone</b> to lock the view inside a region: players can't see past it. Levels start showing only the spawn area.</p>
      <h4>Verify & share</h4>
      <p>▶ Test opens your level in the game. Beat it from spawn and it becomes <b>verified</b> —
      only then can you Share. Any edit un-verifies it. No impossible levels. 😈</p>
      <h4>Objects</h4>`;
    for (const c of CATS) {
      html += `<h4>${c}</h4>`;
      for (const r of REG.filter((r) => r.cat === c)) html += `<p><b>${r.label}:</b> ${r.desc}</p>`;
    }
    b.innerHTML = html;
  }

  // ================= guided tour =================
  const TOUR = [
    ["Welcome to Create 😈", "This is the Level Devil editor. What you see here is EXACTLY what players see — same renderer, just paused. Let's take 60 seconds to learn it."],
    ["The palette", "The bottom bar holds every object, with a picture of each. Tabs group them: Terrain, Hazards, Traps, Interactive, Collect, Level. Tap a tile, then tap the canvas to place it."],
    ["Moving around", "Drag empty space to pan, pinch or scroll to zoom, and use the minimap (top-right) to jump anywhere. Your level can be up to 10 screens wide — set the size in the ☰ menu."],
    ["Trolls & X-ray", "Fake floors, invisible platforms and pop-up spikes are invisible to players — the 👁 X-ray button ghosts them for YOU while editing. Toggle it off to preview the player's view."],
    ["Zones, paths & properties", "Select an object and a panel slides up with everything editable. Dashed boxes are trigger zones, ◆ diamonds are path ends and portal exits — drag them where you want."],
    ["Verify, then share", "Hit ▶ Test to play your level. Beat it from spawn and it's VERIFIED — unlocking 🔗 Share, which gives you a link and a code anyone can play. If you can't beat it, nobody can. Now go be evil."],
  ];
  let tourAt = 0;
  function showTour(i) {
    tourAt = i;
    $("tour").style.display = "";
    $("tour-title").textContent = TOUR[i][0];
    $("tour-text").textContent = TOUR[i][1];
    $("tour-step").textContent = `${i + 1}/${TOUR.length}`;
    $("tour-next").textContent = i === TOUR.length - 1 ? "Let's go!" : "Next →";
  }
  $("tour-next").onclick = () => {
    sfx("click");
    if (tourAt + 1 < TOUR.length) showTour(tourAt + 1);
    else { $("tour").style.display = "none"; localStorage.setItem("ld_tour_done", "1"); }
  };
  $("tour-skip").onclick = () => { sfx("click"); $("tour").style.display = "none"; localStorage.setItem("ld_tour_done", "1"); };
  $("btn-tour").onclick = () => { $("drawer").style.display = "none"; showTour(0); };

  // ================= boot =================
  buildToolbar();
  syncDrawer();
  syncShareBtn();
  sizeWorldBuf();
  sizeCanvas();
  view.zoom = Math.min(cv.height / 560, 1.2);
  clampView();
  if (!localStorage.getItem("ld_tour_done")) showTour(0);
  requestAnimationFrame(frame);

  // debug hook for automated tests
  window.__ed = {
    get level() { return level; },
    get sel() { return sel; },
    get view() { return view; },
    get verified() { return verifiedHash === levelHash(); },
    place(t, x, y) { const r = regOf(t); const o = r.mk(x, y); level[t].push(o); sel = { t, i: level[t].length - 1 }; push(); syncSheet(); return o; },
    select(t, i) { sel = { t, i }; syncSheet(); },
    push, hash: levelHash,
  };
})();
