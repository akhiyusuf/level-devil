// Level Devil clone — level editor. Palette -> place -> tweak -> test-play.
// Produces plain level JSON in the exact schema js/levels.js uses.
(() => {
  "use strict";

  const cv = document.getElementById("ed");
  const ctx = cv.getContext("2d");
  const SNAP = 10;

  // ---------- object registry (palette) ----------
  // mk() returns a fresh object in engine schema. rect() maps it to a draw/hit box.
  const R = (x, y, w, h) => ({ x, y, w, h });
  const REG = [
    // Terrain
    { t: "solids",    cat: "Terrain", label: "Ground Block",    mk: (x, y) => ({ x, y, w: 160, h: 40 }) },
    { t: "oneways",   cat: "Terrain", label: "One-Way Platform", mk: (x, y) => ({ x, y, w: 120, h: 14 }) },
    { t: "fakes",     cat: "Terrain", label: "Fake Block",      mk: (x, y) => ({ x, y, w: 120, h: 40 }) },
    { t: "invisible", cat: "Terrain", label: "Invisible Platform", mk: (x, y) => ({ x, y, w: 120, h: 16 }) },
    { t: "ice",       cat: "Terrain", label: "Ice Platform",    mk: (x, y) => ({ x, y, w: 160, h: 40 }) },
    { t: "conveyors", cat: "Terrain", label: "Conveyor Belt",   mk: (x, y) => ({ x, y, w: 200, h: 40, belt: 140 }) },
    { t: "disappear", cat: "Terrain", label: "Disappearing Floor", mk: (x, y) => ({ x, y, w: 90, h: 22, delay: 0.25 }) },
    { t: "collapse",  cat: "Terrain", label: "Floor Collapse",  mk: (x, y) => ({ x, y, w: 110, h: 22, delay: 0.18 }) },
    { t: "appearing", cat: "Terrain", label: "Appearing Floor", zone: 1, mk: (x, y) => ({ x, y, w: 90, h: 16, zone: { x: x - 140, y: y - 60, w: 120, h: 140 } }) },
    { t: "movers",    cat: "Terrain", label: "Moving Platform", partner: ["x2", "y2"], mk: (x, y) => ({ x, y, w: 90, h: 16, x2: x + 180, y2: y, speed: 120 }) },
    { t: "gates",     cat: "Terrain", label: "Gate / Wall",     mk: (x, y) => ({ id: "g" + Date.now() % 10000, x, y, w: 24, h: 128 }) },
    // Hazards
    { t: "spikes",    cat: "Hazards", label: "Spikes",          enums: { dir: ["up", "down"] }, mk: (x, y) => ({ x, y, w: 120, h: 14, dir: "up" }) },
    { t: "popspikes", cat: "Hazards", label: "Pop-up Spikes",   zone: 1, enums: { dir: ["up"] }, mk: (x, y) => ({ x, y, w: 60, h: 40, dir: "up", zone: { x: x - 110, y: y - 120, w: 110, h: 160 } }) },
    { t: "fallers",   cat: "Hazards", label: "Crusher",         zone: 1, mk: (x, y) => ({ x, y, w: 80, h: 80, deadly: true, zone: { x: x - 110, y: 0, w: 110, h: 540 } }) },
    { t: "saws",      cat: "Hazards", label: "Saw Blade",       partner: ["cx2", "cy2"], mk: (x, y) => ({ cx: x, cy: y, r: 26, cx2: x, cy2: y - 110, speed: 110 }) },
    { t: "lasers",    cat: "Hazards", label: "Laser",           mk: (x, y) => ({ x, y, w: 8, h: 300, on: 0.7, off: 1.1, phase: 0 }) },
    { t: "fires",     cat: "Hazards", label: "Fire",            mk: (x, y) => ({ x, y, w: 70 }) },
    { t: "chasers",   cat: "Hazards", label: "Chaser Block",    zone: 1, mk: (x, y) => ({ x, y, w: 34, h: 48, speed: 165, zone: { x: x + 100, y: y - 100, w: 140, h: 200 } }) },
    { t: "patrols",   cat: "Hazards", label: "Patrol Enemy",    mk: (x, y) => ({ x, y, minX: x - 80, maxX: x + 120, speed: 100 }) },
    // Traps & Triggers
    { t: "gravZones", cat: "Traps",   label: "Gravity Flip Zone",  mk: (x, y) => ({ x, y, w: 60, h: 140 }) },
    { t: "ctrlZones", cat: "Traps",   label: "Reverse Controls Zone", mk: (x, y) => ({ x, y, w: 80, h: 140 }) },
    { t: "jumpZones", cat: "Traps",   label: "Jump Modifier Zone", mk: (x, y) => ({ x, y, w: 160, h: 180, mult: 0.65, visible: true }) },
    { t: "portals",   cat: "Traps",   label: "Portal Pair",     partner: ["bx", "by"], mk: (x, y) => ({ ax: x, ay: y, bx: x + 240, by: y, w: 34, h: 64, oneway: false }) },
    { t: "fakeExits", cat: "Traps",   label: "Fake Exit Door",  enums: { action: ["spikes", "flee"] }, mk: (x, y) => ({ x, y, action: "spikes" }) },
    // Interactive
    { t: "buttons",     cat: "Interactive", label: "Pressure Plate", enums: { mode: ["toggle", "hold"] }, mk: (x, y) => ({ x, y, mode: "toggle", targets: [] }) },
    { t: "keys",        cat: "Interactive", label: "Key",        mk: (x, y) => ({ x, y, id: "k1" }) },
    { t: "checkpoints", cat: "Interactive", label: "Checkpoint", mk: (x, y) => ({ x, y, fake: false }) },
    // Collectibles
    { t: "coins", cat: "Collect", label: "Coin", mk: (x, y) => ({ x, y }) },
    { t: "stars", cat: "Collect", label: "Star", mk: (x, y) => ({ x, y }) },
  ];
  const CATS = [...new Set(REG.map((r) => r.cat))];
  const regOf = (t) => REG.find((r) => r.t === t);

  // draw/hit rectangle for any object
  function rectOf(t, o) {
    switch (t) {
      case "saws": return R(o.cx - o.r, o.cy - o.r, o.r * 2, o.r * 2);
      case "fires": return R(o.x, o.y, o.w, 26);
      case "patrols": return R(o.x, o.y, 24, 22);
      case "buttons": return R(o.x, o.y - 10, 44, 10);
      case "coins": return R(o.x - 9, o.y - 9, 18, 18);
      case "stars": return R(o.x - 11, o.y - 11, 22, 22);
      case "keys": return R(o.x - 10, o.y - 8, 20, 16);
      case "checkpoints": return R(o.x - 6, o.y - 50, 26, 50);
      case "portals": return R(o.ax, o.ay, o.w, o.h);
      case "fakeExits": return R(o.x, o.y, 44, 64);
      default: return R(o.x, o.y, o.w ?? 40, o.h ?? 40);
    }
  }
  const partnerRect = (t, o) => {
    if (t === "portals") return R(o.bx, o.by, o.w, o.h);
    if (t === "movers") return R(o.x2, o.y2, o.w, o.h);
    if (t === "saws") return R(o.cx2 - o.r, o.cy2 - o.r, o.r * 2, o.r * 2);
    return null;
  };

  // ---------- level model ----------
  const blank = () => ({
    name: "My Level", hint: "", theme: "tan", reverse: false,
    spawn: { x: 50, y: 466 },
    door: { x: 880, y: 436, runaway: false, wall: 920, speed: 280, trigger: 160, hidden: false },
    solids: [{ x: 0, y: 500, w: 960, h: 40 }],
    oneways: [], fakes: [], invisible: [], ice: [], conveyors: [], disappear: [], collapse: [],
    appearing: [], movers: [], gates: [], spikes: [], popspikes: [], fallers: [], saws: [],
    lasers: [], fires: [], chasers: [], patrols: [], portals: [], gravZones: [], ctrlZones: [],
    jumpZones: [], buttons: [], keys: [], checkpoints: [], fakeExits: [], coins: [], stars: [],
  });
  let level = blank();
  try { const a = JSON.parse(localStorage.getItem("ld_editor_autosave") || "null"); if (a) level = Object.assign(blank(), a); } catch (_) {}

  // ---------- undo/redo ----------
  let undoStack = [JSON.stringify(level)], undoPos = 0;
  function push() {
    undoStack = undoStack.slice(0, undoPos + 1);
    undoStack.push(JSON.stringify(level));
    if (undoStack.length > 100) undoStack.shift();
    undoPos = undoStack.length - 1;
    localStorage.setItem("ld_editor_autosave", JSON.stringify(level));
  }
  function restore() { localStorage.setItem("ld_editor_autosave", JSON.stringify(level)); sel = null; syncTop(); refresh(); }
  function undo() { if (undoPos > 0) { undoPos--; level = JSON.parse(undoStack[undoPos]); restore(); } }
  function redo() { if (undoPos < undoStack.length - 1) { undoPos++; level = JSON.parse(undoStack[undoPos]); restore(); } }

  // ---------- state ----------
  let placing = null;             // REG entry being placed
  let sel = null;                 // {t, i} or {t:'spawn'|'door'}
  let drag = null;                // {mode, ox, oy, moved}
  let snapOn = true;
  const snap = (v) => (snapOn ? Math.round(v / SNAP) * SNAP : Math.round(v));

  const selObj = () => !sel ? null : sel.t === "spawn" ? level.spawn : sel.t === "door" ? level.door : level[sel.t][sel.i];

  // ---------- rendering ----------
  function draw() {
    const T = THEMES[level.theme] || THEMES.tan;
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = T.band; ctx.fillRect(0, 0, 960, 66);
    ctx.fillStyle = T.bandEdge; ctx.fillRect(0, 66, 960, 3);
    // grid
    ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.lineWidth = 1;
    for (let gx = 0; gx <= 960; gx += 40) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, 540); ctx.stroke(); }
    for (let gy = 0; gy <= 540; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(960, gy + 0.5); ctx.stroke(); }

    const box = (r, fill, alpha = 1, dash = false) => {
      ctx.globalAlpha = alpha;
      if (dash) { ctx.setLineDash([5, 4]); ctx.strokeStyle = fill; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h); ctx.setLineDash([]); }
      else { ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h); }
      ctx.globalAlpha = 1;
    };
    const label = (r, txt, color = "#000") => {
      ctx.fillStyle = color; ctx.font = "10px system-ui"; ctx.textAlign = "center";
      ctx.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 3);
    };

    const colors = {
      solids: T.brick, oneways: T.brickShade, fakes: T.brick, invisible: T.brickShade, ice: T.ice,
      conveyors: T.brickShade, disappear: T.brick, collapse: T.brick, appearing: T.brick, movers: T.brick,
      gates: T.brickShade, spikes: T.brick, popspikes: T.brick, fallers: "#3a3a44", saws: T.metal,
      lasers: T.laser, fires: T.fire[0], chasers: T.brickShade, patrols: T.enemy, portals: T.portal,
      gravZones: T.portal, ctrlZones: T.portal, jumpZones: T.portal, buttons: T.metal, keys: T.key,
      checkpoints: T.flag, fakeExits: T.door, coins: T.coin, stars: T.star,
    };
    const glyphs = {
      fakes: "FAKE", invisible: "INVIS", disappear: "VANISH", collapse: "CRUMBLE", appearing: "APPEAR",
      oneways: "1-WAY", ice: "ICE", conveyors: "BELT", movers: "MOVE", gates: "GATE", lasers: "",
      gravZones: "GRAV", ctrlZones: "CTRL", jumpZones: "JUMP", chasers: "CHASE", fakeExits: "?",
    };

    for (const r of REG) {
      const arr = level[r.t] || [];
      arr.forEach((o, i) => {
        const rc = rectOf(r.t, o);
        const zoneLike = ["gravZones", "ctrlZones", "jumpZones"].includes(r.t);
        box(rc, colors[r.t] || "#888", zoneLike ? 0.3 : (r.t === "invisible" ? 0.4 : 1));
        if (glyphs[r.t]) label(rc, glyphs[r.t], r.t === "fakeExits" ? "#333" : (zoneLike ? "#fff" : "rgba(255,255,255,0.85)"));
        if (r.t === "portals") { const pb = partnerRect(r.t, o); box(pb, colors.portals, 0.8); label(rc, "A", "#fff"); label(pb, "B", "#fff"); }
        if (r.t === "spikes" || r.t === "popspikes") label(rc, "▲▲", "rgba(255,255,255,0.9)");
        if (r.t === "saws") { ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, 7); ctx.fillStyle = T.metal; ctx.fill(); label(rectOf(r.t, o), "SAW", "#fff"); }
        const isSel = sel && sel.t === r.t && sel.i === i;
        if (isSel) {
          ctx.strokeStyle = "#00d0ff"; ctx.lineWidth = 2; ctx.strokeRect(rc.x - 2, rc.y - 2, rc.w + 4, rc.h + 4); ctx.lineWidth = 1;
          if (o.zone) { box(o.zone, "#00d0ff", 1, true); label(o.zone, "trigger zone", "#00a0c8"); }
          const pb = partnerRect(r.t, o);
          if (pb) {
            ctx.setLineDash([3, 4]); ctx.strokeStyle = "#00d0ff"; ctx.beginPath();
            ctx.moveTo(rc.x + rc.w / 2, rc.y + rc.h / 2); ctx.lineTo(pb.x + pb.w / 2, pb.y + pb.h / 2); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = "#00d0ff"; ctx.beginPath();
            ctx.moveTo(pb.x + pb.w / 2, pb.y + pb.h / 2 - 8); ctx.lineTo(pb.x + pb.w / 2 + 8, pb.y + pb.h / 2);
            ctx.lineTo(pb.x + pb.w / 2, pb.y + pb.h / 2 + 8); ctx.lineTo(pb.x + pb.w / 2 - 8, pb.y + pb.h / 2); ctx.fill();
          }
          if (r.t === "patrols") {
            ctx.strokeStyle = "#00d0ff"; ctx.setLineDash([2, 3]); ctx.beginPath();
            ctx.moveTo(o.minX, o.y + 22); ctx.lineTo(o.maxX, o.y + 22); ctx.stroke(); ctx.setLineDash([]);
          }
          // resize handle (rect objects only)
          if (o.w != null && o.h != null && !["portals"].includes(r.t)) {
            ctx.fillStyle = "#00d0ff"; ctx.fillRect(rc.x + rc.w - 5, rc.y + rc.h - 5, 10, 10);
          }
        }
      });
    }

    // door + spawn
    const d = level.door;
    ctx.fillStyle = T.doorEdge; ctx.fillRect(d.x - 2, d.y - 2, 48, 66);
    ctx.fillStyle = T.door; ctx.fillRect(d.x, d.y, 44, 64);
    label(R(d.x, d.y, 44, 64), d.hidden ? "DOOR (hidden)" : "DOOR", "#333");
    const sp = level.spawn;
    ctx.fillStyle = T.player; ctx.fillRect(sp.x, sp.y, 30, 34);
    label(R(sp.x, sp.y - 16, 30, 12), "SPAWN", T.player);
    for (const who of ["door", "spawn"]) {
      if (sel && sel.t === who) {
        const rc = who === "door" ? R(d.x, d.y, 44, 64) : R(sp.x, sp.y, 30, 34);
        ctx.strokeStyle = "#00d0ff"; ctx.lineWidth = 2; ctx.strokeRect(rc.x - 2, rc.y - 2, rc.w + 4, rc.h + 4); ctx.lineWidth = 1;
      }
    }

    if (placing) {
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, 960, 26);
      ctx.fillStyle = "#fff"; ctx.font = "13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(`Click to place: ${placing.label} (Esc to cancel, Shift-click for multiple)`, 480, 17);
    }
  }

  // ---------- hit testing ----------
  const inR = (mx, my, r, pad = 0) => mx >= r.x - pad && mx <= r.x + r.w + pad && my >= r.y - pad && my <= r.y + r.h + pad;
  function hitTest(mx, my) {
    const o = selObj();
    if (o && sel.i != null) {
      const rc = rectOf(sel.t, o);
      if (o.w != null && inR(mx, my, R(rc.x + rc.w - 6, rc.y + rc.h - 6, 12, 12))) return { grab: "resize" };
      const pb = partnerRect(sel.t, o);
      if (pb && inR(mx, my, pb, 4)) return { grab: "partner" };
      if (o.zone && inR(mx, my, o.zone, 3)) return { grab: "zone" };
    }
    if (inR(mx, my, R(level.spawn.x, level.spawn.y, 30, 34), 4)) return { pick: { t: "spawn" } };
    if (inR(mx, my, R(level.door.x, level.door.y, 44, 64), 4)) return { pick: { t: "door" } };
    for (let ri = REG.length - 1; ri >= 0; ri--) {
      const r = REG[ri], arr = level[r.t] || [];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (inR(mx, my, rectOf(r.t, arr[i]), 3)) return { pick: { t: r.t, i } };
        const pb = partnerRect(r.t, arr[i]);
        if (pb && inR(mx, my, pb, 3)) return { pick: { t: r.t, i } };
      }
    }
    return null;
  }

  // ---------- mouse ----------
  const mpos = (e) => {
    const r = cv.getBoundingClientRect();
    return { mx: (e.clientX - r.left) * (960 / r.width), my: (e.clientY - r.top) * (540 / r.height) };
  };
  cv.addEventListener("mousedown", (e) => {
    const { mx, my } = mpos(e);
    if (placing) {
      const o = placing.mk(snap(mx), snap(my));
      level[placing.t].push(o);
      sel = { t: placing.t, i: level[placing.t].length - 1 };
      if (!e.shiftKey) { setPlacing(null); }
      push(); refresh();
      return;
    }
    const hit = hitTest(mx, my);
    if (!hit) { sel = null; refresh(); return; }
    if (hit.grab) { drag = { mode: hit.grab, lx: mx, ly: my, moved: false }; return; }
    sel = hit.pick;
    drag = { mode: "move", lx: mx, ly: my, moved: false };
    refresh();
  });
  addEventListener("mousemove", (e) => {
    if (!drag || !sel) return;
    const { mx, my } = mpos(e);
    const dx = mx - drag.lx, dy = my - drag.ly;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !drag.moved) return;
    drag.moved = true;
    const o = selObj();
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
      o.w = Math.max(10, snap(o.w + dx)); o.h = Math.max(6, snap(o.h + dy));
    }
    drag.lx = snap(drag.lx + dx); drag.ly = snap(drag.ly + dy);
    refresh(false);
  });
  addEventListener("mouseup", () => { if (drag && drag.moved) { push(); refresh(); } drag = null; });

  // ---------- keyboard ----------
  addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.key === "Escape") setPlacing(null);
    if ((e.key === "Delete" || e.key === "Backspace") && sel && sel.i != null) { level[sel.t].splice(sel.i, 1); sel = null; push(); refresh(); }
    if (e.ctrlKey && e.key.toLowerCase() === "d" && sel && sel.i != null) {
      e.preventDefault();
      const c = JSON.parse(JSON.stringify(level[sel.t][sel.i]));
      if (c.x != null) c.x += 30; if (c.ax != null) { c.ax += 30; c.bx += 30; } if (c.cx != null) c.cx += 30;
      level[sel.t].push(c); sel = { t: sel.t, i: level[sel.t].length - 1 }; push(); refresh();
    }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key.toLowerCase() === "y") || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z")) { e.preventDefault(); redo(); }
  });

  // ---------- properties panel ----------
  const propsTitle = document.getElementById("props-title");
  const propsBody = document.getElementById("props-body");
  const propsActions = document.getElementById("props-actions");
  const ENUMS = { dir: ["up", "down"], action: ["spikes", "flee"], mode: ["toggle", "hold"] };
  const SKIP = new Set(["zone"]);

  function buildProps() {
    const o = selObj();
    propsBody.innerHTML = "";
    propsActions.style.display = sel && sel.i != null ? "flex" : "none";
    if (!o) { propsTitle.textContent = "Nothing selected"; return; }
    propsTitle.textContent = sel.i != null ? regOf(sel.t).label : sel.t.toUpperCase();
    const addRow = (key, val, setter) => {
      const row = document.createElement("div"); row.className = "row";
      const lab = document.createElement("label"); lab.textContent = key; row.appendChild(lab);
      let inp;
      if (ENUMS[key] && typeof val === "string") {
        inp = document.createElement("select");
        for (const v of ENUMS[key]) { const op = document.createElement("option"); op.value = op.textContent = v; inp.appendChild(op); }
        inp.value = val;
        inp.onchange = () => { setter(inp.value); push(); refresh(false); };
      } else if (typeof val === "boolean") {
        inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = val;
        inp.onchange = () => { setter(inp.checked); push(); refresh(false); };
      } else if (typeof val === "number") {
        inp = document.createElement("input"); inp.type = "number"; inp.value = val; inp.step = key === "delay" || key === "on" || key === "off" || key === "phase" || key === "mult" ? 0.05 : 1;
        inp.onchange = () => { setter(parseFloat(inp.value) || 0); push(); refresh(false); };
      } else if (Array.isArray(val)) {
        inp = document.createElement("input"); inp.type = "text"; inp.value = val.join(",");
        inp.onchange = () => { setter(inp.value.split(",").map((s) => s.trim()).filter(Boolean)); push(); refresh(false); };
      } else {
        inp = document.createElement("input"); inp.type = "text"; inp.value = val;
        inp.onchange = () => { setter(inp.value); push(); refresh(false); };
      }
      row.appendChild(inp); propsBody.appendChild(row);
    };
    for (const k of Object.keys(o)) {
      if (SKIP.has(k)) continue;
      addRow(k, o[k], (v) => { o[k] = v; });
    }
    if (o.zone) for (const zk of ["x", "y", "w", "h"]) addRow("zone." + zk, o.zone[zk], (v) => { o.zone[zk] = v; });
  }

  document.getElementById("btn-del").onclick = () => { if (sel && sel.i != null) { level[sel.t].splice(sel.i, 1); sel = null; push(); refresh(); } };
  document.getElementById("btn-dup").onclick = () => {
    if (!sel || sel.i == null) return;
    const c = JSON.parse(JSON.stringify(level[sel.t][sel.i]));
    if (c.x != null) c.x += 30; if (c.ax != null) { c.ax += 30; c.bx += 30; } if (c.cx != null) c.cx += 30;
    level[sel.t].push(c); sel = { t: sel.t, i: level[sel.t].length - 1 }; push(); refresh();
  };

  // ---------- toolbar ----------
  const catsEl = document.getElementById("cats");
  const palEl = document.getElementById("palette");
  let activeCat = CATS[0];
  function setPlacing(r) {
    placing = r;
    [...palEl.children].forEach((b) => b.classList.toggle("placing", r && b.dataset.t === r.t));
    draw();
  }
  function buildToolbar() {
    catsEl.innerHTML = ""; palEl.innerHTML = "";
    for (const c of CATS) {
      const b = document.createElement("button");
      b.textContent = c; b.classList.toggle("active", c === activeCat);
      b.onclick = () => { activeCat = c; buildToolbar(); };
      catsEl.appendChild(b);
    }
    for (const r of REG.filter((r) => r.cat === activeCat)) {
      const b = document.createElement("button");
      b.textContent = r.label; b.dataset.t = r.t;
      b.onclick = () => setPlacing(placing === r ? null : r);
      palEl.appendChild(b);
    }
  }

  // ---------- top bar ----------
  const $ = (id) => document.getElementById(id);
  function syncTop() {
    $("lv-name").value = level.name; $("lv-hint").value = level.hint || "";
    $("lv-theme").value = level.theme; $("lv-reverse").checked = !!level.reverse;
  }
  $("lv-name").onchange = () => { level.name = $("lv-name").value; push(); };
  $("lv-hint").onchange = () => { level.hint = $("lv-hint").value; push(); };
  $("lv-theme").onchange = () => { level.theme = $("lv-theme").value; push(); draw(); };
  $("lv-reverse").onchange = () => { level.reverse = $("lv-reverse").checked; push(); };
  $("chk-snap").onchange = () => { snapOn = $("chk-snap").checked; };
  $("btn-undo").onclick = undo;
  $("btn-redo").onclick = redo;
  $("btn-clear").onclick = () => { if (confirm("Clear the whole level?")) { level = blank(); sel = null; push(); syncTop(); refresh(); } };
  $("btn-export").onclick = () => {
    const json = JSON.stringify(level, null, 1);
    const blob = new Blob([json], { type: "application/json" });
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
        try { level = Object.assign(blank(), JSON.parse(txt)); sel = null; push(); syncTop(); refresh(); }
        catch (err) { alert("Not valid level JSON: " + err.message); }
      });
    };
    inp.click();
  };
  $("btn-test").onclick = () => {
    localStorage.setItem("ld_custom_level", JSON.stringify(level));
    window.open("index.html?custom=1", "ldtest");
  };

  // ---------- boot ----------
  function refresh(rebuildProps = true) { draw(); if (rebuildProps) buildProps(); }
  buildToolbar(); syncTop(); refresh();
})();
