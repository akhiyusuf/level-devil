// Level Devil clone — shared renderer + runtime builder.
// Used by BOTH the game (js/game.js) and the editor (js/editor.js) so the editor
// is true WYSIWYG. Draws into a 320x180 pixel buffer; caller upscales.
window.LDR = (() => {
  "use strict";

  const S = 3, VW = 960, VH = 540, BW = 320, BH = 180;

  // ---- per-call context (set by drawWorld) ----
  let bctx = null, C = null, L = null, camX = 0, camY = 0, T = 0, XRAY = false;

  // ---- pixel sprite maps (10 wide x 12 tall) ----
  const mirror = (m) => m.map((row) => row.split("").reverse().join(""));
  const SPR = {
    idle0: ["..######..","..######..","..######..",".########.",".########.",".########.",".########.","..##..##..","..##..##..","..##..##..","..##..##..","..##..##.."],
    idle1: ["..........","..######..","..######..","..######..",".########.",".########.",".########.","..##..##..","..##..##..","..##..##..","..##..##..","..##..##.."],
    run0:  ["..######..","..######..","..######..",".########.",".########.",".########.",".########.","..##..##..","..##...##.",".##.....##",".##.....##","##.......#"],
    run1:  ["..######..","..######..","..######..",".########.",".########.",".########.",".########.","..#####...","..####....","...###....","...##.....",".........."],
    jump:  ["..######..","..######..","..######..","##########",".########.",".########.",".########.",".##....##.",".##....##.","..##..##..","..........",".........."],
    fall:  ["..######..","..######..","..######..","##########",".########.",".########.",".########.",".##....##.","##......##","##......##","..........",".........."],
  };
  SPR.run2 = mirror(SPR.run0);
  SPR.run3 = mirror(SPR.run1);
  const RUN_FRAMES = ["run0", "run1", "run2", "run3"];

  // ---- coordinate helpers (world -> buffer, camera-aware) ----
  const bx = (v) => Math.round((v - camX) / S);
  const by = (v) => Math.round((v - camY) / S);

  function rect(x, y, w, h, color) {
    const X = bx(x), Y = by(y);
    bctx.fillStyle = color;
    bctx.fillRect(X, Y, Math.max(1, bx(x + w) - X), Math.max(1, by(y + h) - Y));
  }

  // 1px outline so overlapping same-colour objects never melt together
  function outline(x, y, w, h) {
    const X = bx(x), Y = by(y), W = Math.max(1, bx(x + w) - X), H = Math.max(1, by(y + h) - Y);
    bctx.fillStyle = C.outline;
    bctx.fillRect(X, Y, W, 1); bctx.fillRect(X, Y + H - 1, W, 1);
    bctx.fillRect(X, Y, 1, H); bctx.fillRect(X + W - 1, Y, 1, H);
  }

  function drawBrick(r, fill) {
    rect(r.x, r.y, r.w, r.h, fill || C.brick);
    rect(r.x, r.y + r.h - S, r.w, S, C.brickShade);
    outline(r.x, r.y, r.w, r.h);
  }

  // stepped-pyramid spikes (like the icon)
  function spikeStrip(x, y, w, h, dir, color) {
    const X = bx(x), Y = by(y), W = Math.max(2, bx(x + w) - X), H = Math.max(2, by(y + h) - Y);
    const n = Math.max(1, Math.round(W / 9)), tw = W / n;
    bctx.fillStyle = color || C.spike || C.brick;
    for (let i = 0; i < n; i++) {
      const cx0 = X + i * tw + tw / 2;
      for (let r2 = 0; r2 < H; r2++) {
        const rw = Math.max(1, Math.round((tw - 1) * (r2 + 1) / H));
        bctx.fillRect(Math.round(cx0 - rw / 2), dir === "down" ? Y + H - 1 - r2 : Y + r2, rw, 1);
      }
    }
  }

  function fillCircleB(x, y, r, color) {
    const CX = bx(x), CY = by(y), R = Math.max(2, Math.round(r / S));
    bctx.fillStyle = color;
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.floor(Math.sqrt(R * R - dy * dy));
      bctx.fillRect(CX - half, CY + dy, half * 2 + 1, 1);
    }
  }

  function pixelArch(X, Y, W, H, color) {
    const R = Math.floor(W / 2);
    bctx.fillStyle = color;
    bctx.fillRect(X, Y + R, W, H - R);
    for (let dy = 0; dy < R; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, R * R - (R - dy) * (R - dy))));
      bctx.fillRect(X + R - half, Y + dy, half * 2 + (W % 2), 1);
    }
  }

  function drawDoorAt(x, y, opening) {
    const X = bx(x), Y = by(y), W = bx(x + 44) - X, H = by(y + 64) - Y;
    pixelArch(X - 1, Y - 1, W + 2, H + 1, C.doorEdge);
    pixelArch(X, Y, W, H, C.door);
    if (opening > 0) {
      const iw = Math.max(2, Math.round((W - 4) * Math.min(1, opening)));
      pixelArch(X + ((W - iw) >> 1), Y + 2, iw, H - 2, C.doorDark);
    } else {
      pixelArch(X + 3, Y + 3, W - 6, H - 3, C.doorEdge);
      pixelArch(X + 4, Y + 4, W - 8, H - 4, C.door);
    }
  }

  // character sprite at an explicit position (px,py = hitbox top-left, ph = hitbox height)
  function drawSpriteAt(name, pxX, pxY, ph, flipH, flipV, alpha, color) {
    const map = SPR[name];
    const X = bx(pxX);
    const Y = flipV ? by(pxY) : by(pxY + ph) - 12;
    bctx.globalAlpha = alpha;
    bctx.fillStyle = color || C.player;
    for (let r2 = 0; r2 < 12; r2++) {
      const row = map[flipV ? 11 - r2 : r2];
      for (let c2 = 0; c2 < 10; c2++) {
        if (row[flipH ? 9 - c2 : c2] === "#") bctx.fillRect(X + c2, Y + r2, 1, 1);
      }
    }
    bctx.globalAlpha = 1;
  }

  function drawSaw(s) {
    fillCircleB(s.x, s.y, s.r + 3, C.outline);
    fillCircleB(s.x, s.y, s.r, C.metal);
    const R = Math.max(2, Math.round(s.r / S));
    const CX = bx(s.x), CY = by(s.y);
    bctx.fillStyle = C.spike;
    for (let k = 0; k < 8; k++) {
      const a = s.angle + (k * Math.PI) / 4;
      bctx.fillRect(Math.round(CX + Math.cos(a) * R) - 1, Math.round(CY + Math.sin(a) * R) - 1, 2, 2);
    }
    bctx.fillStyle = C.bg;
    bctx.fillRect(CX - 1, CY - 1, 2, 2);
  }

  function drawFire(f) {
    const X = bx(f.x), W = bx(f.x + f.w) - X, baseY = by(f.y + f.h);
    for (let c2 = 0; c2 < W; c2 += 2) {
      const hgt = 4 + Math.round(3 * Math.abs(Math.sin(T * 9 + c2 * 1.7)));
      bctx.fillStyle = C.fire[0];
      bctx.fillRect(X + c2, baseY - hgt, 2, hgt);
      bctx.fillStyle = C.fire[1];
      bctx.fillRect(X + c2, baseY - hgt, 2, Math.max(1, hgt >> 1));
    }
  }

  function drawChaser(c, lookX) {
    rect(c.x + 4, c.y + 4, c.w - 8, c.h - 8, C.brickShade);
    spikeStrip(c.x, c.y + 4, 6, c.h - 8, "up", C.spike);
    spikeStrip(c.x + c.w - 6, c.y + 4, 6, c.h - 8, "up", C.spike);
    spikeStrip(c.x + 2, c.y, c.w - 4, 8, "up", C.spike);
    spikeStrip(c.x + 2, c.y + c.h - 8, c.w - 4, 8, "down", C.spike);
    bctx.fillStyle = "#fff";
    const ex = bx(c.x + c.w / 2) + (lookX > c.x ? 1 : -3);
    bctx.fillRect(ex, by(c.y) + 5, 2, 2);
  }

  function drawPatrol(p) {
    const X = bx(p.x), Y = by(p.y), W = bx(p.x + p.w) - X, H = by(p.y + p.h) - Y;
    bctx.fillStyle = C.enemy;
    bctx.fillRect(X, Y, W, H - 2);
    const step = Math.floor(T * 8) % 2;
    bctx.fillRect(X + 1 + step, Y + H - 2, 2, 2);
    bctx.fillRect(X + W - 3 - step, Y + H - 2, 2, 2);
    bctx.fillStyle = C.spike;
    bctx.fillRect(p.dir > 0 ? X + W - 3 : X + 1, Y + 2, 2, 2);
  }

  function drawPortalAt(x, y, w, h) {
    const X = bx(x), Y = by(y), W = bx(x + w) - X, H = by(y + h) - Y;
    bctx.fillStyle = C.portal;
    for (let r2 = 0; r2 < H; r2++) {
      const wob = Math.round(Math.sin(T * 5 + r2 * 0.9) * 1);
      bctx.fillRect(X + wob + 1, Y + r2, W - 2, 1);
    }
    bctx.fillStyle = C.bg;
    bctx.fillRect(X + (W >> 1), Y + (H >> 1) - 2, 1, 4);
  }

  function drawCoin(c) {
    fillCircleB(c.x, c.y, 15, C.outline);
    fillCircleB(c.x, c.y, 12, C.coin);
    bctx.fillStyle = "rgba(255,255,255,0.9)";
    bctx.fillRect(bx(c.x) - 1, by(c.y) - 2, 2, 2);
  }

  const STAR_MAP = ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "#.....#"];
  function drawStar(s, bob) {
    const X = bx(s.x), Y = by(s.y) + (bob ? Math.round(Math.sin(T * 3) * 1) : 0);
    bctx.fillStyle = C.outline;
    for (let r2 = 0; r2 < 7; r2++) for (let c2 = 0; c2 < 7; c2++) if (STAR_MAP[r2][c2] === "#") bctx.fillRect(X - 3 + c2 + 1, Y - 3 + r2 + 1, 1, 1);
    bctx.fillStyle = C.star;
    for (let r2 = 0; r2 < 7; r2++) for (let c2 = 0; c2 < 7; c2++) if (STAR_MAP[r2][c2] === "#") bctx.fillRect(X - 3 + c2, Y - 3 + r2, 1, 1);
  }

  function drawKey(k, bob) {
    const X = bx(k.x), Y = by(k.y) + (bob ? Math.round(Math.sin(T * 3) * 1) : 0);
    bctx.fillStyle = C.outline;
    bctx.fillRect(X - 4, Y - 3, 12, 5);
    bctx.fillStyle = C.key;
    bctx.fillRect(X - 3, Y - 2, 3, 3); bctx.fillRect(X - 2, Y - 1, 6, 1); bctx.fillRect(X + 2, Y, 1, 2); bctx.fillRect(X + 4, Y, 1, 2);
  }

  function drawFlag(c) {
    const X = bx(c.x), Y = by(c.y);
    bctx.fillStyle = C.metal; bctx.fillRect(X, Y - 16, 1, 16);
    bctx.fillStyle = c.hit ? C.flag : C.brickShade;
    const fy = c.hit ? Y - 16 : Y - 6;
    bctx.fillRect(X + 1, fy, 5, 3); bctx.fillRect(X + 1, fy + 1, 3, 3);
  }

  const laserState = (l, t) => {
    if (l.on >= 99) return { active: true, warn: false };
    const cyc = l.on + l.off;
    const tt = (t + (l.phase || 0)) % cyc;
    return { active: tt < l.on, warn: tt > cyc - 0.25 };
  };

  // ---- runtime builder (shared by game + editor) ----
  function buildRuntime(src) {
    return {
      name: src.name, hint: src.hint, reverse: !!src.reverse, grav: 1,
      w: Math.max(VW, src.w || VW), h: Math.max(VH, src.h || VH),
      spawn: { ...src.spawn },
      door: { ...src.door, w: 44, h: 64, hidden: !!src.door.hidden && !src.__doorShown },
      solids: (src.solids || []).map((r) => ({ ...r })),
      oneways: (src.oneways || []).map((r) => ({ ...r })),
      fakes: (src.fakes || []).map((r) => ({ ...r })),
      invisible: (src.invisible || []).map((r) => ({ ...r, seen: false })),
      ice: (src.ice || []).map((r) => ({ ...r, ice: true })),
      conveyors: (src.conveyors || []).map((r) => ({ ...r })),
      disappear: (src.disappear || []).map((r) => ({ ...r, touched: false, t: 0, gone: false, alpha: 1 })),
      collapse: (src.collapse || []).map((r) => ({ ...r, touched: false, t: 0, falling: false, vy: 0 })),
      appearing: (src.appearing || []).map((r) => ({ ...r, on: false })),
      movers: (src.movers || []).map((r) => ({ ...r, t: 0, fwd: true, dx: 0, dy: 0, mover: true })),
      gates: (src.gates || []).map((r) => ({ ...r, opened: false })),
      spikes: (src.spikes || []).map((r) => ({ ...r })),
      popspikes: (src.popspikes || []).map((r) => ({ ...r, y0: r.y, active: false, prog: 0 })),
      fallers: (src.fallers || []).map((r) => ({ ...r, y0: r.y, phase: "idle", vy: 0, timer: 0 })),
      saws: (src.saws || []).map((s) => ({ ...s, t: 0, fwd: true, x: s.cx, y: s.cy, angle: 0 })),
      lasers: (src.lasers || []).map((l) => ({ ...l })),
      fires: (src.fires || []).map((f) => ({ ...f, h: 26 })),
      chasers: (src.chasers || []).map((c) => ({ ...c, active: false })),
      patrols: (src.patrols || []).map((p) => ({ ...p, dir: 1, w: 24, h: 22 })),
      portals: (src.portals || []).map((p) => ({ ...p })),
      gravZones: (src.gravZones || []).map((z) => ({ ...z, armed: true })),
      ctrlZones: (src.ctrlZones || []).map((z) => ({ ...z, armed: true })),
      jumpZones: (src.jumpZones || []).map((z) => ({ ...z })),
      camZones: (src.camZones || []).map((z) => ({ ...z })),
      buttons: (src.buttons || []).map((b) => ({ ...b, w: 44, pressed: false, was: false })),
      keys: (src.keys || []).map((k) => ({ ...k, got: false })),
      checkpoints: (src.checkpoints || []).map((c) => ({ ...c, hit: false })),
      fakeExits: (src.fakeExits || []).map((f) => ({ ...f, w: 44, h: 64, triggered: !!src.__fakeDone, gone: !!src.__fakeDone && f.action === "flee" })),
      coins: (src.coins || []).map((c) => ({ ...c, got: false })),
      stars: (src.stars || []).map((s) => ({ ...s, got: false })),
    };
  }

  // ---- the world pass ----
  // opts: { time, camX, camY, char: {player, anim, entering, enterDur, grav} | null,
  //         particles: [] | null, xray: bool (editor: reveal trolls/ghosts) }
  function drawWorld(ctx2, runtime, theme, opts = {}) {
    bctx = ctx2; L = runtime; C = theme;
    camX = Math.round(opts.camX || 0); camY = Math.round(opts.camY || 0);
    T = opts.time || 0; XRAY = !!opts.xray;

    // room: bg fills the target canvas; darker band along the top of the WORLD
    const cw = bctx.canvas.width, chh = bctx.canvas.height;
    bctx.fillStyle = C.bg; bctx.fillRect(0, 0, cw, chh);
    if (camY < 69) {
      bctx.fillStyle = C.band; bctx.fillRect(0, by(0), cw, Math.max(1, by(66) - by(0)));
      bctx.fillStyle = C.bandEdge; bctx.fillRect(0, by(66), cw, 1);
    }

    // gates
    for (const g of L.gates) {
      if (g.opened) {
        bctx.strokeStyle = C.brickShade; bctx.lineWidth = 1;
        bctx.strokeRect(bx(g.x) + 0.5, by(g.y) + 0.5, bx(g.x + g.w) - bx(g.x) - 1, by(g.y + g.h) - by(g.y) - 1);
      } else {
        drawBrick(g);
        bctx.fillStyle = g.needKey ? C.key : C.doorDark;   // keyhole colour marks key-gates
        bctx.fillRect(bx(g.x + g.w / 2) - 1, by(g.y + g.h / 2) - 2, 2, 4);
      }
    }

    // doors (real + fakes render IDENTICALLY — that's the game)
    if (!L.door.hidden) drawDoorAt(L.door.x, L.door.y, opts.char && opts.char.entering ? opts.char.entering.t / opts.char.enterDur : 0);
    else if (XRAY) { bctx.globalAlpha = 0.35; drawDoorAt(L.door.x, L.door.y, 0); bctx.globalAlpha = 1; }
    for (const f of L.fakeExits) {
      if (f.gone) continue;
      if (f.triggered && f.action === "spikes") spikeStrip(f.x, f.y + 20, f.w, 44, "up");
      else drawDoorAt(f.x, f.y, 0);
    }

    // portals
    for (const p of L.portals) { drawPortalAt(p.ax, p.ay, p.w, p.h); drawPortalAt(p.bx, p.by, p.w, p.h); }

    // terrain
    for (const r of L.fakes) drawBrick(r);
    for (const r of L.solids) drawBrick(r);
    for (const r of L.ice) { rect(r.x, r.y, r.w, r.h, C.ice); rect(r.x, r.y, r.w, S, C.iceShade); outline(r.x, r.y, r.w, r.h); }
    for (const r of L.conveyors) {
      drawBrick(r, C.brickShade);
      const off = Math.floor(T * (r.belt / S)) % 6;
      bctx.fillStyle = C.metal;
      for (let cx0 = bx(r.x) - 6; cx0 < bx(r.x + r.w); cx0 += 6) {
        const px = cx0 + ((off % 6) + 6) % 6;
        if (px >= bx(r.x) && px < bx(r.x + r.w) - 1) bctx.fillRect(px, by(r.y), 2, 2);
      }
    }
    for (const r of L.oneways) { rect(r.x, r.y, r.w, r.h, C.brickShade); rect(r.x, r.y, r.w, S, C.brick); }
    for (const r of L.disappear) if (!r.gone) { bctx.globalAlpha = r.alpha; drawBrick(r); bctx.globalAlpha = 1; }
    for (const r of L.collapse) drawBrick(r, r.touched ? C.brickShade : C.brick);
    for (const a of L.appearing) { if (a.on) drawBrick(a); else if (XRAY) { bctx.globalAlpha = 0.3; drawBrick(a); bctx.globalAlpha = 1; } }
    for (const r of L.invisible) {
      if (r.seen) { bctx.globalAlpha = 0.5; drawBrick(r); bctx.globalAlpha = 1; }
      else if (XRAY) { bctx.globalAlpha = 0.25; drawBrick(r); bctx.globalAlpha = 1; }
    }
    for (const m of L.movers) { drawBrick(m, C.brick); rect(m.x, m.y, m.w, S, C.metal); }

    // interactive
    for (const b of L.buttons) {
      const h = b.pressed ? 3 : 6;
      rect(b.x, b.y - h, b.w, h, C.metal);
      rect(b.x + 4, b.y - h - 3, b.w - 8, 3, b.pressed ? C.metal : C.key);
      outline(b.x, b.y - h - 3, b.w, h + 3);
    }
    for (const k of L.keys) if (!k.got) drawKey(k, true);
    for (const c of L.checkpoints) drawFlag(c);

    // hazards
    for (const s of L.spikes) spikeStrip(s.x, s.y, s.w, s.h, s.dir || "up");
    for (const s of L.popspikes) {
      if (s.prog > 0.02) spikeStrip(s.x, s.y0 - s.h * s.prog, s.w, s.h * s.prog, "up");
      else if (XRAY) { bctx.globalAlpha = 0.3; spikeStrip(s.x, s.y0 - s.h, s.w, s.h, "up"); bctx.globalAlpha = 1; }
    }
    for (const f of L.fallers) if (f.phase !== "idle" || f.y > -60 || XRAY) {
      drawBrick(f, C.brick);
      spikeStrip(f.x, f.y + f.h, f.w, 12, "down");
    }
    for (const s of L.saws) drawSaw(s);
    for (const l of L.lasers) {
      const st = laserState(l, T);
      const X = bx(l.x), Y = by(l.y), W = Math.max(1, bx(l.x + l.w) - X), H = Math.max(1, by(l.y + l.h) - Y);
      if (st.active) { bctx.fillStyle = C.laser; bctx.fillRect(X, Y, W, H); }
      else if (st.warn) { bctx.globalAlpha = 0.3 + 0.2 * Math.sin(T * 40); bctx.fillStyle = C.laser; bctx.fillRect(X, Y, W, H); bctx.globalAlpha = 1; }
      bctx.fillStyle = C.metal;
      if (l.w < l.h) { bctx.fillRect(X - 2, Y - 2, W + 4, 3); bctx.fillRect(X - 2, Y + H - 1, W + 4, 3); }
      else { bctx.fillRect(X - 2, Y - 2, 3, H + 4); bctx.fillRect(X + W - 1, Y - 2, 3, H + 4); }
    }
    for (const f of L.fires) drawFire(f);
    for (const c of L.chasers) if (c.active || XRAY || (opts.char && inZoneRect(opts.char.player, c.zone))) drawChaser(c, opts.char ? opts.char.player.x : c.x - 10);
    for (const p of L.patrols) drawPatrol(p);

    // zone markers players may see
    for (const z of L.gravZones) {
      bctx.fillStyle = C.portal;
      const X = bx(z.x + z.w / 2), Y = by(z.y + z.h / 2);
      const up = L.grav > 0;
      for (let i = 0; i < 4; i++) bctx.fillRect(X - (up ? i : 3 - i), Y + i - 2, (up ? i : 3 - i) * 2 + 1, 1);
    }
    for (const z of L.jumpZones) if (z.visible || XRAY) {
      bctx.globalAlpha = 0.25; bctx.fillStyle = C.portal;
      bctx.fillRect(bx(z.x), by(z.y), bx(z.x + z.w) - bx(z.x), by(z.y + z.h) - by(z.y));
      bctx.globalAlpha = 1;
    }
    if (XRAY) for (const z of L.ctrlZones) {
      bctx.globalAlpha = 0.25; bctx.fillStyle = C.laser;
      bctx.fillRect(bx(z.x), by(z.y), bx(z.x + z.w) - bx(z.x), by(z.y + z.h) - by(z.y));
      bctx.globalAlpha = 1;
    }

    // collectibles
    for (const c of L.coins) if (!c.got) drawCoin(c);
    for (const s of L.stars) if (!s.got) drawStar(s, true);

    // character
    if (opts.char && opts.char.player.alive) drawChar(opts.char);

    // particles
    if (opts.particles) for (const p of opts.particles) {
      bctx.globalAlpha = Math.max(0, p.life / 0.6);
      bctx.fillStyle = p.color || C.brickShade;
      const r2 = Math.max(1, Math.round(p.r / S));
      bctx.fillRect(bx(p.x) - (r2 >> 1), by(p.y) - (r2 >> 1), r2, r2);
    }
    bctx.globalAlpha = 1;
  }

  const inZoneRect = (pl, z) => z && pl.x < z.x + z.w && pl.x + pl.w > z.x && pl.y < z.y + z.h && pl.y + pl.h > z.y;

  function drawChar(ch) {
    const pl = ch.player, anim = ch.anim, gd = ch.grav || 1;
    const grounded = pl.onGround, moving = Math.abs(pl.vx) > 5;
    let frame;
    if (ch.entering) frame = RUN_FRAMES[Math.floor(anim.stride) % 4];
    else if (!grounded) frame = (pl.vy * gd < -60) ? "jump" : "fall";
    else if (moving) frame = RUN_FRAMES[Math.floor(anim.stride) % 4];
    else if (anim.landPose > 0) frame = "idle1";
    else frame = Math.floor(T * 2) % 2 ? "idle1" : "idle0";

    if (grounded && gd > 0 && !ch.entering) rect(pl.x + 3, pl.y + pl.h - 2, pl.w - 6, 3, "rgba(0,0,0,0.18)");

    if (ch.entering) {
      const d = L.door;
      const prog = ch.entering.t / ch.enterDur;
      const alpha = Math.max(0, 1 - prog * 1.15);
      bctx.save();
      bctx.beginPath();
      const X = bx(d.x), Y = by(d.y), W = bx(d.x + d.w) - X, H = by(d.y + d.h) - Y;
      bctx.rect(prog < 0.25 ? 0 : X + 1, 0, prog < 0.25 ? bctx.canvas.width : W - 2, bctx.canvas.height);
      bctx.clip();
      drawSpriteAt(frame, pl.x, pl.y, pl.h, anim.facing < 0, false, alpha);
      bctx.restore();
      return;
    }
    drawSpriteAt(frame, pl.x, pl.y, pl.h, anim.facing < 0, gd < 0, 1);
  }

  // ---- editor palette thumbnails: render one object with the real renderer ----
  const G = 500; // sample ground line
  const THUMB_SAMPLES = {
    solids:    { solids: [{ x: 440, y: 480, w: 80, h: 40 }] },
    oneways:   { oneways: [{ x: 440, y: 495, w: 80, h: 14 }] },
    fakes:     { fakes: [{ x: 440, y: 480, w: 80, h: 40 }] },
    invisible: { invisible: [{ x: 442, y: 490, w: 76, h: 16 }], __seen: 1 },
    ice:       { ice: [{ x: 440, y: 485, w: 80, h: 30 }] },
    conveyors: { conveyors: [{ x: 435, y: 485, w: 90, h: 30, belt: 140 }] },
    disappear: { disappear: [{ x: 442, y: 490, w: 76, h: 20 }] },
    collapse:  { collapse: [{ x: 442, y: 490, w: 76, h: 20 }] },
    appearing: { appearing: [{ x: 442, y: 490, w: 76, h: 16 }], __on: 1 },
    movers:    { movers: [{ x: 442, y: 492, w: 76, h: 16, x2: 442, y2: 492, speed: 0 }] },
    gates:     { gates: [{ id: "g", x: 468, y: 455, w: 24, h: 85 }] },
    spikes:    { spikes: [{ x: 435, y: 495, w: 90, h: 22, dir: "up" }] },
    popspikes: { popspikes: [{ x: 445, y: 540, w: 70, h: 44, dir: "up", zone: { x: 0, y: 0, w: 0, h: 0 } }], __pop: 1 },
    fallers:   { fallers: [{ x: 442, y: 462, w: 76, h: 56, deadly: true, zone: { x: 0, y: 0, w: 0, h: 0 } }] },
    saws:      { saws: [{ cx: 480, cy: 505, r: 30 }] },
    lasers:    { lasers: [{ x: 476, y: 462, w: 8, h: 80, on: 99, off: 0.01, phase: 0 }] },
    fires:     { fires: [{ x: 445, y: 495, w: 70 }] },
    chasers:   { chasers: [{ x: 462, y: 468, w: 36, h: 50, speed: 0, zone: { x: 0, y: 0, w: 0, h: 0 } }], __active: 1 },
    patrols:   { patrols: [{ x: 468, y: 490, minX: 0, maxX: 960, speed: 0 }] },
    portals:   { portals: [{ ax: 462, ay: 462, bx: 462, by: 462, w: 36, h: 76 }] },
    gravZones: { gravZones: [{ x: 450, y: 465, w: 60, h: 70 }] },
    ctrlZones: { ctrlZones: [{ x: 445, y: 462, w: 70, h: 76 }], __xray: 1 },
    jumpZones: { jumpZones: [{ x: 445, y: 462, w: 70, h: 76, mult: 0.6, visible: true }] },
    camZones:  { camZones: [] }, // drawn by editor overlay only
    buttons:   { buttons: [{ x: 458, y: 505, mode: "toggle", targets: [] }] },
    keys:      { keys: [{ x: 480, y: 500, id: "k" }] },
    checkpoints: { checkpoints: [{ x: 476, y: 520 }], __hit: 1 },
    fakeExits: { fakeExits: [{ x: 458, y: 442, action: "spikes" }] },
    coins:     { coins: [{ x: 480, y: 500 }] },
    stars:     { stars: [{ x: 480, y: 500 }] },
    spawnPt:   { __char: 1 },
    doorObj:   { __door: 1 },
  };
  let thumbBuf = null;
  function drawThumb(targetCtx, type, themeName, size) {
    if (!thumbBuf) { thumbBuf = document.createElement("canvas"); thumbBuf.width = BW; thumbBuf.height = BH; }
    const tb = thumbBuf.getContext("2d");
    const sample = THUMB_SAMPLES[type] || {};
    const src = Object.assign({ spawn: { x: -500, y: 0 }, door: { x: -500, y: 0, hidden: false }, w: 960, h: 1080 }, sample);
    if (sample.__door) src.door = { x: 458, y: 442 };
    const rt = buildRuntime(src);
    if (sample.__pop) { rt.popspikes[0].prog = 1; rt.popspikes[0].y = rt.popspikes[0].y0 - rt.popspikes[0].h; }
    if (sample.__on) rt.appearing[0].on = true;
    if (sample.__seen) rt.invisible[0].seen = true;
    if (sample.__active) rt.chasers[0].active = true;
    if (sample.__hit) rt.checkpoints[0].hit = true;
    const theme = THEMES[themeName] || THEMES.tan;
    drawWorld(tb, rt, theme, { time: 0.8, camX: 320, camY: 410, xray: !!sample.__xray });
    if (sample.__char) {
      bctx = tb; C = theme; camX = 320; camY = 410;
      drawSpriteAt("idle0", 465, 466, 34, false, false, 1);
    }
    // crop the centre 40x40 buffer px around the object (world 480,500 -> buffer (480-320)/3=53, (500-410)/3=30)
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.clearRect(0, 0, size, size);
    targetCtx.drawImage(thumbBuf, 53 - 14, 30 - 14, 28, 28, 0, 0, size, size);
  }

  return { S, VW, VH, BW, BH, SPR, RUN_FRAMES, buildRuntime, drawWorld, drawThumb, drawSpriteAt, laserState };
})();
