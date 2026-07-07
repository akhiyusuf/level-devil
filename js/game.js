// Level Devil clone — engine. Vanilla JS, fixed-timestep physics, single-screen levels.
// Renders into a 320x180 pixel buffer upscaled 3x with smoothing off -> true pixel-art look.
(() => {
  "use strict";

  const VW = 960, VH = 540;                  // logical resolution (physics space)
  const S = 3, BW = VW / S, BH = VH / S;     // pixel buffer scale + size
  const GRAV = 2400, MOVE = 300, JUMP = 780; // physics tuning (px, s)
  const MAXFALL = 1400;
  const ICE_ACC = 700, ICE_FRICTION = 260;   // slippery response
  const ENTER_DUR = 0.6;                     // door-enter animation length

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const buf = document.createElement("canvas");
  buf.width = BW; buf.height = BH;
  const bctx = buf.getContext("2d");

  // ---- theme (swapped per world in loadLevel) ----
  let C = THEMES.tan;

  // ---- pixel sprite maps (10 wide x 12 tall, '#' = player colour) ----
  // 3 head rows + 4 torso rows + 5 leg rows -> reads as the icon's blocky runner
  const mirror = (m) => m.map((row) => row.split("").reverse().join(""));
  const SPR = {
    idle0: ["..######..","..######..","..######..",".########.",".########.",".########.",".########.","..##..##..","..##..##..","..##..##..","..##..##..","..##..##.."],
    idle1: ["..........","..######..","..######..","..######..",".########.",".########.",".########.",".########.","..##..##..","..##..##..","..##..##..","..##..##.."],
    run0:  ["..######..","..######..","..######..",".########.",".########.",".########.",".########.","..##..##..","..##...##.",".##.....##",".##.....##","##.......#"],
    run1:  ["..######..","..######..","..######..",".########.",".########.",".########.",".########.","..#####...","..####....","...###....","...##.....",".........."],
    jump:  ["..######..","..######..","..######..","##########",".########.",".########.",".########.",".##....##.",".##....##.","..##..##..","..........",".........."],
    fall:  ["..######..","..######..","..######..","##########",".########.",".########.",".########.",".##....##.","##......##","##......##","..........",".........."],
  };
  SPR.run2 = mirror(SPR.run0); // opposite stride
  SPR.run3 = mirror(SPR.run1);
  const RUN_FRAMES = ["run0", "run1", "run2", "run3"];

  // ---- character animation state ----
  const anim = { time: 0, stride: 0, facing: 1, landPose: 0, wasGround: false };

  // ---- input ----
  const keys = { left: false, right: false, jump: false };
  const setKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = down;
    else if (k === "arrowright" || k === "d") keys.right = down;
    else if (k === "arrowup" || k === "w" || k === " ") keys.jump = down;
    else if (down && k === "r") resetLevel();
    else return;
    e.preventDefault();
  };
  addEventListener("keydown", (e) => setKey(e, true));
  addEventListener("keyup", (e) => setKey(e, false));
  const bind = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { keys[key] = true; e.preventDefault(); };
    const off = (e) => { keys[key] = false; e.preventDefault(); };
    el.addEventListener("touchstart", on, { passive: false });
    el.addEventListener("touchend", off, { passive: false });
    el.addEventListener("touchcancel", off, { passive: false });
    el.addEventListener("mousedown", on);
    addEventListener("mouseup", off);
  };
  bind("btn-left", "left"); bind("btn-right", "right"); bind("btn-jump", "jump");

  // ---- custom level support (editor test-play via ?custom=1) ----
  let CUSTOM = false;
  try {
    if (new URLSearchParams(location.search).get("custom")) {
      const j = JSON.parse(localStorage.getItem("ld_custom_level") || "null");
      if (j) {
        j.theme = j.theme || "tan"; j.world = 0; j.wlevel = 0; j.wname = "Custom";
        LEVELS.length = 0; LEVELS.push(j); CUSTOM = true;
      }
    }
  } catch (_) { /* fall through to normal levels */ }

  // ---- state ----
  let levelIdx = 0, deaths = 0, totalTime = 0, won = false, starsGot = 0;
  let L = null;                 // active level runtime copy
  let entering = null;          // door-enter animation {t}
  let checkpointPos = null;     // respawn override within current level
  const keysHeld = new Set();   // collected key ids (reset on level load)
  const player = { x: 0, y: 0, w: 30, h: 34, vx: 0, vy: 0, onGround: false, alive: true, wasJump: false,
                   carrier: null, surf: { ice: false, belt: 0 }, portalCD: 0 };
  let particles = [];
  let respawnTimer = 0;

  // AABB overlap
  const overlap = (ax, ay, aw, ah, bx_, by_, bw, bh) =>
    ax < bx_ + bw && ax + aw > bx_ && ay < by_ + bh && ay + ah > by_;
  const pOver = (r, pad = 0) => overlap(player.x + pad, player.y + pad, player.w - pad * 2, player.h - pad * 2, r.x, r.y, r.w, r.h);
  const inZone = (z) => overlap(player.x, player.y, player.w, player.h, z.x, z.y, z.w, z.h);

  // Build a fresh mutable runtime for the current level (traps reset).
  function loadLevel(i) {
    const src = LEVELS[i];
    C = THEMES[src.theme] || THEMES.tan;
    L = {
      name: src.name, hint: src.hint, reverse: !!src.reverse, grav: 1,
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
      fires: (src.fires || []).map((f) => ({ ...f, h: 26, y: f.y })),
      chasers: (src.chasers || []).map((c) => ({ ...c, active: false })),
      patrols: (src.patrols || []).map((p) => ({ ...p, dir: 1, w: 24, h: 22 })),
      portals: (src.portals || []).map((p) => ({ ...p })),
      gravZones: (src.gravZones || []).map((z) => ({ ...z, armed: true })),
      ctrlZones: (src.ctrlZones || []).map((z) => ({ ...z, armed: true })),
      jumpZones: (src.jumpZones || []).map((z) => ({ ...z })),
      buttons: (src.buttons || []).map((b) => ({ ...b, w: 44, pressed: false, was: false })),
      keys: (src.keys || []).map((k) => ({ ...k, got: false })),
      checkpoints: (src.checkpoints || []).map((c) => ({ ...c, hit: false })),
      fakeExits: (src.fakeExits || []).map((f) => ({ ...f, w: 44, h: 64, triggered: !!src.__fakeDone, gone: src.__fakeDone && f.action === "flee" })),
      coins: (src.coins || []).map((c) => ({ ...c, got: false })),
      stars: (src.stars || []).map((s) => ({ ...s, got: false })),
    };
    const sp = checkpointPos || src.spawn;
    player.x = sp.x; player.y = sp.y;
    player.vx = player.vy = 0; player.onGround = false; player.alive = true;
    player.carrier = null; player.surf = { ice: false, belt: 0 }; player.portalCD = 0;
    keysHeld.clear();
    particles = [];
    respawnTimer = 0;
    entering = null;
  }

  function resetLevel() { loadLevel(levelIdx); }

  function nextLevel() {
    checkpointPos = null;
    if (levelIdx + 1 >= LEVELS.length) { won = true; return; }
    levelIdx++; loadLevel(levelIdx);
  }

  function burst(x, y, n, colors, speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const s = speed * 0.5 + Math.random() * speed;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 150, life: 0.5 + Math.random() * 0.25, r: 3 + Math.random() * 4, color: colors[(Math.random() * colors.length) | 0] });
    }
  }

  function die() {
    if (!player.alive || entering) return;
    player.alive = false;
    deaths++;
    respawnTimer = 0.45;
    burst(player.x + player.w / 2, player.y + player.h / 2 - 4, 26, [C.brickShade, C.brick, C.bg, C.player]);
  }

  // list of currently-solid rectangles (base + active traps + surfaces)
  function solidRects() {
    const out = L.solids.slice();
    for (const r of L.invisible) out.push(r);
    for (const r of L.ice) out.push(r);
    for (const r of L.conveyors) out.push(r);
    for (const d of L.disappear) if (!d.gone) out.push(d);
    for (const c of L.collapse) if (!c.falling) out.push(c);
    for (const a of L.appearing) if (a.on) out.push(a);
    for (const m of L.movers) out.push(m);
    for (const g of L.gates) if (!g.opened) out.push(g);
    return out; // fallers/chasers/patrols are pure hazards, never solid
  }

  const gateOpen = (g) => {
    if (g.needKey) return keysHeld.has(g.needKey);
    return g.opened;
  };

  // ---- update ----
  function update(dt) {
    if (won) return;
    totalTime += dt;
    anim.time += dt;
    if (anim.landPose > 0) anim.landPose -= dt;
    if (player.portalCD > 0) player.portalCD -= dt;

    // particles always animate
    for (const p of particles) { p.life -= dt; p.vy += GRAV * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter((p) => p.life > 0);

    if (!player.alive) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) resetLevel();
      return;
    }

    updateTraps(dt);

    // ---- door-enter sequence: input locked, walk into the doorway, fade ----
    if (entering) {
      entering.t += dt;
      const cx = L.door.x + L.door.w / 2 - player.w / 2;
      player.x += Math.sign(cx - player.x) * Math.min(Math.abs(cx - player.x), 160 * dt);
      anim.stride += 8 * dt;
      if (entering.t >= ENTER_DUR) nextLevel();
      return;
    }

    const gd = L.grav;

    // horizontal intent (reversed levels swap it)
    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (L.reverse) dir = -dir;
    if (player.surf.ice && player.onGround) {
      // slippery: accelerate toward intent, drift when idle
      const target = dir * MOVE;
      const acc = dir !== 0 ? ICE_ACC : ICE_FRICTION;
      const dv = target - player.vx;
      player.vx += Math.sign(dv) * Math.min(Math.abs(dv), acc * dt);
    } else {
      player.vx = dir * MOVE;
    }

    // jump (edge-triggered, gravity-aware, zone-modified)
    let jm = 1;
    for (const z of L.jumpZones) if (inZone(z)) jm = z.mult;
    if (keys.jump && player.onGround && !player.wasJump) {
      player.vy = -JUMP * jm * gd; player.onGround = false;
      burst(player.x + player.w / 2, player.y + (gd > 0 ? player.h : 0), 4, [C.brickShade], 90);
    }
    player.wasJump = keys.jump;

    // gravity
    player.vy += GRAV * gd * dt;
    player.vy = Math.max(-MAXFALL, Math.min(player.vy, MAXFALL));

    // movers advance; carry rider; push if they slide into the player
    for (const m of L.movers) {
      const px = m.x, py = m.y;
      const dxs = m.x2 - (m.ox ?? (m.ox = m.x)), dys = m.y2 - (m.oy ?? (m.oy = m.y));
      const len = Math.hypot(dxs, dys) || 1;
      m.t += (m.fwd ? 1 : -1) * (m.speed * dt) / len;
      if (m.t >= 1) { m.t = 1; m.fwd = false; } else if (m.t <= 0) { m.t = 0; m.fwd = true; }
      m.x = m.ox + dxs * m.t; m.y = m.oy + dys * m.t;
      m.dx = m.x - px; m.dy = m.y - py;
      if (player.carrier === m) { player.x += m.dx; player.y += m.dy; }
      else if (pOver(m)) { player.x += m.dx; player.y += m.dy; } // shoved by the platform
    }
    player.carrier = null;

    const solids = solidRects();

    // --- move X, resolve against actual displacement direction ---
    const effVx = player.vx + (player.onGround ? player.surf.belt : 0);
    player.x += effVx * dt;
    for (const r of solids) {
      if (pOver(r)) {
        if (effVx > 0) player.x = r.x - player.w;
        else if (effVx < 0) player.x = r.x + r.w;
        // effVx == 0: embedded (shoved/closed-on) -> crush check below decides
        if (effVx !== 0 && !player.surf.ice) player.vx = 0;
      }
    }

    // --- move Y, resolve ---
    const prevY = player.y;
    player.y += player.vy * dt;
    player.onGround = false;
    player.surf = { ice: false, belt: 0 };
    for (const r of solids) {
      if (pOver(r)) {
        if (player.vy * gd > 0) {           // moving with gravity -> land
          player.y = gd > 0 ? r.y - player.h : r.y + r.h;
          player.onGround = true;
          player.surf.ice = !!r.ice;
          player.surf.belt = r.belt || 0;
          if (r.mover) player.carrier = r;
          markStepped(r);
          player.vy = 0;
        } else if (player.vy * gd < 0) {    // moving against gravity -> bonk
          player.y = gd > 0 ? r.y + r.h : r.y - player.h;
          player.vy = 0;
        }
        // vy == 0 while overlapping: leave for the crush check
      }
    }

    // crushed: still deeply embedded after both resolves (gate closed on you, etc.)
    for (const r of solids) if (pOver(r, 8)) { die(); break; }
    // one-way platforms: only under normal gravity, only when crossing the top
    if (gd > 0 && player.vy >= 0) {
      for (const r of L.oneways) {
        const feetPrev = prevY + player.h, feetNow = player.y + player.h;
        if (feetPrev <= r.y + 1 && feetNow >= r.y &&
            player.x < r.x + r.w && player.x + player.w > r.x) {
          player.y = r.y - player.h; player.vy = 0; player.onGround = true;
        }
      }
    }

    // keep inside side walls of arena
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > VW) player.x = VW - player.w;

    // --- animation drivers ---
    if (Math.abs(player.vx) > 5) anim.facing = player.vx > 0 ? 1 : -1;
    if (player.onGround && Math.abs(player.vx) > 5) anim.stride += Math.abs(player.vx) * dt / 24;
    if (player.onGround && !anim.wasGround) {
      anim.landPose = 0.1;
      burst(player.x + player.w / 2, player.y + (gd > 0 ? player.h : 0), 3, [C.brickShade], 70);
    }
    anim.wasGround = player.onGround;

    updateDoor(dt);
    updateZones();
    collect();

    // death: hazards or out of the world (either direction)
    if (player.y > VH + 40 || player.y + player.h < -60) die();
    if (player.alive && touchingHazard()) die();

    // real door -> begin the enter animation (must be grounded, door visible)
    const d = L.door;
    if (!d.hidden && player.alive && player.onGround &&
        overlap(player.x + 4, player.y + 4, player.w - 8, player.h - 8, d.x + 6, d.y, d.w - 12, d.h)) {
      entering = { t: 0 };
    }

    // fake exits lie
    for (const f of L.fakeExits) {
      if (f.gone) continue;
      if (!f.triggered && player.onGround &&
          overlap(player.x + 4, player.y + 4, player.w - 8, player.h - 8, f.x + 6, f.y, f.w - 12, f.h)) {
        f.triggered = true;
        LEVELS[levelIdx].__fakeDone = true; LEVELS[levelIdx].__doorShown = true;
        L.door.hidden = false;
        burst(f.x + f.w / 2, f.y + f.h / 2, 18, [C.brick, C.brickShade, C.doorDark]);
        if (f.action === "flee") f.gone = true;
      }
      if (f.triggered && f.action === "spikes" && pOver(f, 4)) die(); // it has teeth now
    }
  }

  function markStepped(r) {
    if ("touched" in r && !r.touched) { r.touched = true; r.t = 0; }
  }

  function updateZones() {
    // gravity flip (re-arms when you leave the zone)
    for (const z of L.gravZones) {
      const inside = inZone(z);
      if (inside && z.armed) { z.armed = false; L.grav = -L.grav; player.vy = 0; }
      if (!inside) z.armed = true;
    }
    // control reversal toggles
    for (const z of L.ctrlZones) {
      const inside = inZone(z);
      if (inside && z.armed) { z.armed = false; L.reverse = !L.reverse; }
      if (!inside) z.armed = true;
    }
    // portals
    if (player.portalCD <= 0) {
      for (const p of L.portals) {
        const A = { x: p.ax, y: p.ay, w: p.w, h: p.h }, B = { x: p.bx, y: p.by, w: p.w, h: p.h };
        if (pOver(A)) {
          player.x = p.bx + (p.w - player.w) / 2; player.y = p.by + p.h - player.h;
          player.vy = 0; player.portalCD = 0.7;
          burst(player.x + player.w / 2, player.y + player.h / 2, 10, [C.portal], 160);
          break;
        }
        if (!p.oneway && pOver(B)) {
          player.x = p.ax + (p.w - player.w) / 2; player.y = p.ay + p.h - player.h;
          player.vy = 0; player.portalCD = 0.7;
          burst(player.x + player.w / 2, player.y + player.h / 2, 10, [C.portal], 160);
          break;
        }
      }
    }
    // buttons (pressure plates)
    for (const b of L.buttons) {
      const plate = { x: b.x, y: b.y - 8, w: b.w, h: 8 };
      b.pressed = pOver(plate);
      const rising = b.pressed && !b.was;
      b.was = b.pressed;
      for (const g of L.gates) {
        if (!b.targets.includes(g.id)) continue;
        if (b.mode === "hold") g.opened = b.pressed;
        else if (rising) g.opened = !g.opened;
      }
    }
    // key-locked gates
    for (const g of L.gates) if (g.needKey && keysHeld.has(g.needKey)) g.opened = true;
    // checkpoints (the fake ones raise their flag too — that's the joke)
    for (const c of L.checkpoints) {
      if (!c.hit && overlap(player.x, player.y, player.w, player.h, c.x - 10, c.y - 60, 40, 60)) {
        c.hit = true;
        if (!c.fake) checkpointPos = { x: c.x, y: c.y - player.h };
      }
    }
  }

  function collect() {
    for (const c of L.coins) {
      if (!c.got && overlap(player.x, player.y, player.w, player.h, c.x - 9, c.y - 9, 18, 18)) {
        c.got = true;
        burst(c.x, c.y, 8, [C.coin], 140);
      }
    }
    for (const s of L.stars) {
      if (!s.got && overlap(player.x, player.y, player.w, player.h, s.x - 12, s.y - 12, 24, 24)) {
        s.got = true; starsGot++;
        burst(s.x, s.y, 14, [C.star, C.coin], 200);
      }
    }
    for (const k of L.keys) {
      if (!k.got && overlap(player.x, player.y, player.w, player.h, k.x - 12, k.y - 10, 24, 20)) {
        k.got = true; keysHeld.add(k.id);
        burst(k.x, k.y, 10, [C.key], 150);
      }
    }
  }

  function updateTraps(dt) {
    // disappearing platforms
    for (const d of L.disappear) {
      if (d.touched && !d.gone) {
        d.t += dt;
        if (d.t >= d.delay) { d.alpha -= dt * 4; if (d.alpha <= 0) { d.alpha = 0; d.gone = true; } }
      }
    }
    // collapsing platforms
    for (const c of L.collapse) {
      if (c.touched) {
        c.t += dt;
        if (c.t >= c.delay) { c.falling = true; c.vy = Math.min(c.vy + GRAV * dt, MAXFALL); c.y += c.vy * dt; }
      }
    }
    // appearing platforms
    for (const a of L.appearing) if (!a.on && inZone(a.zone)) { a.on = true; burst(a.x + a.w / 2, a.y, 8, [C.brickShade], 120); }
    // pop-up spikes
    for (const s of L.popspikes) {
      if (!s.active && inZone(s.zone)) s.active = true;
      if (s.active && s.prog < 1) s.prog = Math.min(1, s.prog + dt * 8);
      s.y = s.y0 - s.h * s.prog;
    }
    // cyclic crushers
    for (const f of L.fallers) {
      const restY = f.rest != null ? f.rest : GROUND_TOP() - f.h;
      const gap = f.gap ?? 0.7, hold = f.hold ?? 0.45, up = f.up ?? 640;
      switch (f.phase) {
        case "idle": if (inZone(f.zone)) { f.phase = "armed"; f.timer = gap; } break;
        case "armed": f.timer -= dt; if (f.timer <= 0) { f.phase = "down"; f.vy = 0; } break;
        case "down":
          f.vy = Math.min(f.vy + GRAV * dt, MAXFALL); f.y += f.vy * dt;
          if (f.y >= restY) { f.y = restY; f.phase = "hold"; f.timer = hold; }
          break;
        case "hold": f.timer -= dt; if (f.timer <= 0) f.phase = "up"; break;
        case "up": f.y -= up * dt; if (f.y <= f.y0) { f.y = f.y0; f.phase = "armed"; f.timer = gap; } break;
      }
    }
    // saws spin, optionally patrol a path
    for (const s of L.saws) {
      s.angle += 7 * dt;
      if (s.cx2 != null) {
        const dxs = s.cx2 - s.cx, dys = (s.cy2 ?? s.cy) - s.cy;
        const len = Math.hypot(dxs, dys) || 1;
        s.t += (s.fwd ? 1 : -1) * (s.speed || 100) * dt / len;
        if (s.t >= 1) { s.t = 1; s.fwd = false; } else if (s.t <= 0) { s.t = 0; s.fwd = true; }
        s.x = s.cx + dxs * s.t; s.y = s.cy + dys * s.t;
      }
    }
    // chasers wake up and slide toward the player
    for (const c of L.chasers) {
      if (!c.active && inZone(c.zone)) c.active = true;
      if (c.active) {
        const target = player.x + player.w / 2 - c.w / 2;
        c.x += Math.sign(target - c.x) * Math.min(Math.abs(target - c.x), c.speed * dt);
      }
    }
    // patrol enemies pace their beat
    for (const p of L.patrols) {
      p.x += p.dir * p.speed * dt;
      if (p.x <= p.minX) { p.x = p.minX; p.dir = 1; }
      if (p.x + p.w >= p.maxX) { p.x = p.maxX - p.w; p.dir = -1; }
    }
  }

  function GROUND_TOP() { return 500; }

  function updateDoor(dt) {
    const d = L.door;
    if (!d.runaway || d.hidden) return;
    const pc = player.x + player.w / 2, dc = d.x + d.w / 2;
    if (Math.abs(pc - dc) < (d.trigger || 160) && d.x < (d.wall - d.w)) {
      d.x = Math.min(d.x + (d.speed || 280) * dt, d.wall - d.w);
    }
  }

  const laserState = (l) => {
    if (l.on >= 99) return { active: true, warn: false };
    const cyc = l.on + l.off;
    const t = (anim.time + (l.phase || 0)) % cyc;
    return { active: t < l.on, warn: t > cyc - 0.25 };
  };

  function touchingHazard() {
    const pad = 3;
    for (const s of L.spikes) if (pOver(s, pad)) return true;
    for (const s of L.popspikes) {
      if (s.prog > 0.15) {
        const hh = s.h * s.prog;
        if (overlap(player.x + pad, player.y + pad, player.w - 6, player.h - 6, s.x, s.y0 - hh, s.w, hh)) return true;
      }
    }
    for (const f of L.fallers) if (f.deadly && f.y > f.y0 + 4 &&
      overlap(player.x + pad, player.y + pad, player.w - 6, player.h - 6, f.x, f.y, f.w, f.h + 12)) return true; // body + hanging teeth
    for (const s of L.saws) { // circle vs rect
      const nx = Math.max(player.x + pad, Math.min(s.x, player.x + player.w - pad));
      const ny = Math.max(player.y + pad, Math.min(s.y, player.y + player.h - pad));
      if ((nx - s.x) ** 2 + (ny - s.y) ** 2 < (s.r - 2) ** 2) return true;
    }
    for (const l of L.lasers) if (laserState(l).active && pOver(l, pad)) return true;
    for (const f of L.fires) if (overlap(player.x + pad, player.y + pad, player.w - 6, player.h - 6, f.x, f.y, f.w, f.h)) return true;
    for (const c of L.chasers) if (c.active && pOver(c, pad)) return true;
    for (const p of L.patrols) if (pOver(p, pad)) return true;
    return false;
  }

  // ================= render (into the pixel buffer) =================
  const bX = (v) => Math.round(v / S);

  function rect(x, y, w, h, color) {
    const X = bX(x), Y = bX(y);
    bctx.fillStyle = color;
    bctx.fillRect(X, Y, Math.max(1, bX(x + w) - X), Math.max(1, bX(y + h) - Y));
  }

  function drawBrick(r, fill) {
    rect(r.x, r.y, r.w, r.h, fill || C.brick);
    rect(r.x, r.y + r.h - S, r.w, S, C.brickShade); // darker underside
  }

  // stepped-pyramid spikes (like the icon)
  function spikeStrip(x, y, w, h, dir, color) {
    const X = bX(x), Y = bX(y), W = Math.max(2, bX(x + w) - X), H = Math.max(2, bX(y + h) - Y);
    const n = Math.max(1, Math.round(W / 9)), tw = W / n;
    bctx.fillStyle = color || C.spike || C.brick;
    for (let i = 0; i < n; i++) {
      const cx0 = X + i * tw + tw / 2;
      for (let r = 0; r < H; r++) {
        // r=0 is the tip (narrowest); base row is widest
        const rw = Math.max(1, Math.round((tw - 1) * (r + 1) / H));
        bctx.fillRect(Math.round(cx0 - rw / 2), dir === "down" ? Y + H - 1 - r : Y + r, rw, 1);
      }
    }
  }

  function fillCircleB(x, y, r, color) {
    const CX = bX(x), CY = bX(y), R = Math.max(2, Math.round(r / S));
    bctx.fillStyle = color;
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.floor(Math.sqrt(R * R - dy * dy));
      bctx.fillRect(CX - half, CY + dy, half * 2 + 1, 1);
    }
  }

  // tombstone arch (pixel semicircle top + body)
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
    const X = bX(x), Y = bX(y), W = bX(x + 44) - X, H = bX(y + 64) - Y;
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

  function drawSprite(name, flipH, flipV, alpha) {
    const map = SPR[name];
    const X = bX(player.x);
    const Y = flipV ? bX(player.y) : bX(player.y + player.h) - 12;
    bctx.globalAlpha = alpha;
    bctx.fillStyle = C.player;
    for (let r = 0; r < 12; r++) {
      const row = map[flipV ? 11 - r : r];
      for (let c = 0; c < 10; c++) {
        if (row[flipH ? 9 - c : c] === "#") bctx.fillRect(X + c, Y + r, 1, 1);
      }
    }
    bctx.globalAlpha = 1;
  }

  function drawCharacter() {
    const grounded = player.onGround, moving = Math.abs(player.vx) > 5;
    const gd = L.grav;
    let frame;
    if (entering) frame = RUN_FRAMES[Math.floor(anim.stride) % 4];
    else if (!grounded) frame = (player.vy * gd < -60) ? "jump" : "fall";
    else if (moving) frame = RUN_FRAMES[Math.floor(anim.stride) % 4];
    else if (anim.landPose > 0) frame = "idle1";
    else frame = Math.floor(anim.time * 2) % 2 ? "idle1" : "idle0";

    // ground shadow
    if (grounded && gd > 0 && !entering) rect(player.x + 3, player.y + player.h - 2, player.w - 6, 3, "rgba(0,0,0,0.18)");

    let alpha = 1;
    if (entering) {
      // clip to the doorway so the character walks INTO it, fading into the dark
      const d = L.door;
      const prog = entering.t / ENTER_DUR;
      alpha = Math.max(0, 1 - prog * 1.15);
      bctx.save();
      bctx.beginPath();
      const X = bX(d.x), Y = bX(d.y), W = bX(d.x + d.w) - X, H = bX(d.y + d.h) - Y;
      bctx.rect(prog < 0.25 ? 0 : X + 1, 0, prog < 0.25 ? BW : W - 2, BH); // early: no clip; then: doorway only
      bctx.clip();
      drawSprite(frame, anim.facing < 0, false, alpha);
      bctx.restore();
      return;
    }
    drawSprite(frame, anim.facing < 0, gd < 0, alpha);
  }

  function drawSaw(s) {
    fillCircleB(s.x, s.y, s.r, C.metal);
    const R = Math.max(2, Math.round(s.r / S));
    const CX = bX(s.x), CY = bX(s.y);
    bctx.fillStyle = C.brick;
    for (let k = 0; k < 8; k++) {
      const a = s.angle + (k * Math.PI) / 4;
      bctx.fillRect(Math.round(CX + Math.cos(a) * R) - 1, Math.round(CY + Math.sin(a) * R) - 1, 2, 2);
    }
    bctx.fillStyle = C.bg;
    bctx.fillRect(CX - 1, CY - 1, 2, 2); // hub
  }

  function drawFire(f) {
    const X = bX(f.x), W = bX(f.x + f.w) - X, baseY = bX(f.y + f.h);
    for (let c = 0; c < W; c += 2) {
      const hgt = 4 + Math.round(3 * Math.abs(Math.sin(anim.time * 9 + c * 1.7)));
      bctx.fillStyle = C.fire[0];
      bctx.fillRect(X + c, baseY - hgt, 2, hgt);
      bctx.fillStyle = C.fire[1];
      bctx.fillRect(X + c, baseY - hgt, 2, Math.max(1, hgt >> 1));
    }
  }

  function drawChaser(c) {
    rect(c.x + 4, c.y + 4, c.w - 8, c.h - 8, C.brickShade);
    spikeStrip(c.x, c.y + 4, 6, c.h - 8, "up", C.brick); // left teeth (vertical-ish nubs)
    spikeStrip(c.x + c.w - 6, c.y + 4, 6, c.h - 8, "up", C.brick);
    spikeStrip(c.x + 2, c.y, c.w - 4, 8, "up", C.brick);
    spikeStrip(c.x + 2, c.y + c.h - 8, c.w - 4, 8, "down", C.brick);
    bctx.fillStyle = "#fff";
    const ex = bX(c.x + c.w / 2) + (player.x > c.x ? 1 : -3);
    bctx.fillRect(ex, bX(c.y) + 5, 2, 2);
  }

  function drawPatrol(p) {
    const X = bX(p.x), Y = bX(p.y), W = bX(p.x + p.w) - X, H = bX(p.y + p.h) - Y;
    bctx.fillStyle = C.enemy;
    bctx.fillRect(X, Y, W, H - 2);
    const step = Math.floor(anim.time * 8) % 2;
    bctx.fillRect(X + 1 + step, Y + H - 2, 2, 2);       // little marching feet
    bctx.fillRect(X + W - 3 - step, Y + H - 2, 2, 2);
    bctx.fillStyle = C.laser;
    bctx.fillRect(p.dir > 0 ? X + W - 3 : X + 1, Y + 2, 2, 2); // angry eye
  }

  function drawPortalAt(x, y, w, h) {
    const X = bX(x), Y = bX(y), W = bX(x + w) - X, H = bX(y + h) - Y;
    bctx.fillStyle = C.portal;
    for (let r = 0; r < H; r++) {
      const wob = Math.round(Math.sin(anim.time * 5 + r * 0.9) * 1);
      bctx.fillRect(X + wob + 1, Y + r, W - 2, 1);
    }
    bctx.fillStyle = C.bg;
    bctx.fillRect(X + (W >> 1), Y + (H >> 1) - 2, 1, 4); // shimmer core
  }

  function render() {
    // room: flat colour + darker top band
    bctx.fillStyle = C.bg; bctx.fillRect(0, 0, BW, BH);
    bctx.fillStyle = C.band; bctx.fillRect(0, 0, BW, 22);
    bctx.fillStyle = C.bandEdge; bctx.fillRect(0, 22, BW, 1);

    // gates (open ones show as faint outline)
    for (const g of L.gates) {
      if (g.opened) {
        bctx.strokeStyle = C.brickShade; bctx.lineWidth = 1;
        bctx.strokeRect(bX(g.x) + 0.5, bX(g.y) + 0.5, bX(g.x + g.w) - bX(g.x) - 1, bX(g.y + g.h) - bX(g.y) - 1);
      } else {
        drawBrick(g);
        if (g.needKey) { // keyhole
          bctx.fillStyle = C.doorDark;
          bctx.fillRect(bX(g.x + g.w / 2) - 1, bX(g.y + g.h / 2) - 2, 2, 4);
        }
      }
    }

    // doors (real + fakes look IDENTICAL — that's the game)
    if (!L.door.hidden) drawDoorAt(L.door.x, L.door.y, entering ? entering.t / ENTER_DUR : 0);
    for (const f of L.fakeExits) {
      if (f.gone) continue;
      if (f.triggered && f.action === "spikes") spikeStrip(f.x, f.y + 20, f.w, 44, "up");
      else drawDoorAt(f.x, f.y, 0);
    }

    // portals
    for (const p of L.portals) { drawPortalAt(p.ax, p.ay, p.w, p.h); drawPortalAt(p.bx, p.by, p.w, p.h); }

    // terrain
    for (const r of L.fakes) drawBrick(r);                 // the lie renders identically
    for (const r of L.solids) drawBrick(r);
    for (const r of L.ice) { rect(r.x, r.y, r.w, r.h, C.ice); rect(r.x, r.y, r.w, S, C.iceShade); }
    for (const r of L.conveyors) {
      drawBrick(r, C.brickShade);
      // scrolling belt notches
      const off = Math.floor(anim.time * (r.belt / S)) % 6;
      bctx.fillStyle = C.metal;
      for (let cx0 = bX(r.x) - 6; cx0 < bX(r.x + r.w); cx0 += 6) {
        const px = cx0 + ((off % 6) + 6) % 6;
        if (px >= bX(r.x) && px < bX(r.x + r.w) - 1) bctx.fillRect(px, bX(r.y), 2, 2);
      }
    }
    for (const r of L.oneways) { rect(r.x, r.y, r.w, r.h, C.brickShade); rect(r.x, r.y, r.w, S, C.brick); }
    for (const r of L.disappear) if (!r.gone) { bctx.globalAlpha = r.alpha; drawBrick(r); bctx.globalAlpha = 1; }
    for (const r of L.collapse) drawBrick(r, r.touched ? C.brickShade : C.brick);
    for (const a of L.appearing) if (a.on) drawBrick(a);
    for (const r of L.invisible) if (r.seen) { bctx.globalAlpha = 0.5; drawBrick(r); bctx.globalAlpha = 1; }
    for (const m of L.movers) { drawBrick(m, C.brick); rect(m.x, m.y, m.w, S, C.metal); }

    // interactive bits
    for (const b of L.buttons) {
      const h = b.pressed ? 3 : 6;
      rect(b.x, b.y - h, b.w, h, C.metal);
      rect(b.x + 4, b.y - h - 3, b.w - 8, 3, b.pressed ? C.metal : C.brick);
    }
    for (const k of L.keys) if (!k.got) {
      const X = bX(k.x), Y = bX(k.y) + Math.round(Math.sin(anim.time * 3) * 1);
      bctx.fillStyle = C.key;
      bctx.fillRect(X - 3, Y - 2, 3, 3); bctx.fillRect(X - 2, Y - 1, 6, 1); bctx.fillRect(X + 2, Y, 1, 2); bctx.fillRect(X + 4, Y, 1, 2);
    }
    for (const c of L.checkpoints) {
      const X = bX(c.x), Y = bX(c.y);
      bctx.fillStyle = C.metal; bctx.fillRect(X, Y - 16, 1, 16);          // pole
      bctx.fillStyle = c.hit ? C.flag : C.brickShade;
      const fy = c.hit ? Y - 16 : Y - 6;                                   // raised when hit
      bctx.fillRect(X + 1, fy, 5, 3); bctx.fillRect(X + 1, fy + 1, 3, 3);
    }

    // hazards
    for (const s of L.spikes) spikeStrip(s.x, s.y, s.w, s.h, s.dir || "up");
    for (const s of L.popspikes) if (s.prog > 0.02) spikeStrip(s.x, s.y0 - s.h * s.prog, s.w, s.h * s.prog, "up");
    for (const f of L.fallers) if (f.phase !== "idle" || f.y > -60) {
      drawBrick(f, C.brick);
      spikeStrip(f.x, f.y + f.h, f.w, 12, "down"); // teeth hang BELOW the slab -> silhouette against the room
    }
    for (const s of L.saws) drawSaw(s);
    for (const l of L.lasers) {
      const st = laserState(l);
      const X = bX(l.x), Y = bX(l.y), W = Math.max(1, bX(l.x + l.w) - X), H = Math.max(1, bX(l.y + l.h) - Y);
      if (st.active) { bctx.fillStyle = C.laser; bctx.fillRect(X, Y, W, H); }
      else if (st.warn) { bctx.globalAlpha = 0.3 + 0.2 * Math.sin(anim.time * 40); bctx.fillStyle = C.laser; bctx.fillRect(X, Y, W, H); bctx.globalAlpha = 1; }
      // emitters
      bctx.fillStyle = C.metal;
      if (l.w < l.h) { bctx.fillRect(X - 2, Y - 2, W + 4, 3); bctx.fillRect(X - 2, Y + H - 1, W + 4, 3); }
      else { bctx.fillRect(X - 2, Y - 2, 3, H + 4); bctx.fillRect(X + W - 1, Y - 2, 3, H + 4); }
    }
    for (const f of L.fires) drawFire(f);
    for (const c of L.chasers) if (c.active || inZone(c.zone)) drawChaser(c);
    for (const p of L.patrols) drawPatrol(p);

    // zone markers players are allowed to see
    for (const z of L.gravZones) {
      bctx.fillStyle = C.portal;
      const X = bX(z.x + z.w / 2), Y = bX(z.y + z.h / 2);
      const up = L.grav > 0;                              // arrow shows where gravity will point
      for (let i = 0; i < 4; i++) bctx.fillRect(X - (up ? i : 3 - i), Y + (up ? i : i) - 2, (up ? i : 3 - i) * 2 + 1, 1);
    }
    for (const z of L.jumpZones) if (z.visible) {
      bctx.globalAlpha = 0.25; bctx.fillStyle = C.portal;
      bctx.fillRect(bX(z.x), bX(z.y), bX(z.x + z.w) - bX(z.x), bX(z.y + z.h) - bX(z.y));
      bctx.globalAlpha = 1;
    }

    // collectibles
    for (const c of L.coins) if (!c.got) {
      fillCircleB(c.x, c.y, 12, C.coin);            // rounder silhouette -> reads as a coin, not a spike ball
      bctx.fillStyle = "rgba(255,255,255,0.85)";
      bctx.fillRect(bX(c.x) - 1, bX(c.y) - 2, 2, 2); // solid glint
    }
    for (const s of L.stars) if (!s.got) {
      const X = bX(s.x), Y = bX(s.y) + Math.round(Math.sin(anim.time * 3) * 1);
      bctx.fillStyle = C.star;
      const star = ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "#.....#"];
      for (let r = 0; r < 7; r++) for (let c2 = 0; c2 < 7; c2++) if (star[r][c2] === "#") bctx.fillRect(X - 3 + c2, Y - 3 + r, 1, 1);
    }

    // player
    if (player.alive) drawCharacter();

    // particles (chunky pixel squares)
    for (const p of particles) {
      bctx.globalAlpha = Math.max(0, p.life / 0.6);
      bctx.fillStyle = p.color || C.brickShade;
      const r = Math.max(1, Math.round(p.r / S));
      bctx.fillRect(bX(p.x) - (r >> 1), bX(p.y) - (r >> 1), r, r);
    }
    bctx.globalAlpha = 1;

    // ---- blit the pixel buffer, then crisp text overlays ----
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, VW, VH);

    if (L.hint && !won) {
      ctx.font = "16px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const tw = ctx.measureText(L.hint).width;
      ctx.fillStyle = C.hintPill;
      roundRect(VW / 2 - tw / 2 - 14, 24, tw + 28, 26, 13); ctx.fill();
      ctx.fillStyle = C.hintText; ctx.fillText(L.hint, VW / 2, 42);
    }

    if (won) drawWin();

    // sync HUD
    hudLevel.textContent = CUSTOM ? "TEST" : `${LEVELS[levelIdx].world}-${LEVELS[levelIdx].wlevel}`;
    hudName.textContent = won ? "Complete" : `${LEVELS[levelIdx].wname} · ${L.name}`;
    hudDeaths.textContent = deaths;
    hudTime.textContent = totalTime.toFixed(1) + "s";
    if (hudCoinsWrap) {
      if (L.coins.length) { hudCoinsWrap.style.display = ""; hudCoins.textContent = `${L.coins.filter((c) => c.got).length}/${L.coins.length}`; }
      else hudCoinsWrap.style.display = "none";
    }
    if (hudStarsWrap) {
      if (starsGot > 0 || L.stars.length) { hudStarsWrap.style.display = ""; hudStars.textContent = starsGot; }
      else hudStarsWrap.style.display = "none";
    }
  }

  function drawWin() {
    ctx.fillStyle = "rgba(20,14,8,0.9)"; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = C.brick === "#5b4a63" ? C.door : C.brick; ctx.textAlign = "center";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.fillText(CUSTOM ? "LEVEL CLEAR" : "YOU BEAT THE DEVIL", VW / 2, 210);
    ctx.fillStyle = "#f6f1e6"; ctx.font = "22px system-ui, sans-serif";
    ctx.fillText(`${deaths} deaths — ${totalTime.toFixed(1)}s${starsGot ? ` — ★${starsGot}` : ""}`, VW / 2, 262);
    ctx.fillStyle = "rgba(246,241,230,0.65)"; ctx.font = "18px system-ui, sans-serif";
    ctx.fillText(CUSTOM ? "Press E to return to the editor · R to retry" : "Press R to play again", VW / 2, 312);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- HUD refs ----
  const hudLevel = document.getElementById("hud-level");
  const hudName = document.getElementById("hud-name");
  const hudDeaths = document.getElementById("hud-deaths");
  const hudTime = document.getElementById("hud-time");
  const hudCoins = document.getElementById("hud-coins");
  const hudCoinsWrap = document.getElementById("hud-coins-wrap");
  const hudStars = document.getElementById("hud-stars");
  const hudStarsWrap = document.getElementById("hud-stars-wrap");

  // ---- responsive canvas ----
  function fit() {
    const wrap = canvas.parentElement;
    const scale = Math.min(wrap.clientWidth / VW, wrap.clientHeight / VH);
    canvas.style.width = VW * scale + "px";
    canvas.style.height = VH * scale + "px";
  }
  addEventListener("resize", fit);

  // ---- invisible platforms reveal on any contact ----
  function revealInvisible() {
    for (const r of L.invisible) {
      if (!r.seen && overlap(player.x - 2, player.y - 2, player.w + 4, player.h + 4, r.x, r.y, r.w, r.h)) r.seen = true;
    }
  }

  // ---- main loop (fixed timestep) ----
  let last = 0, acc = 0;
  const STEP = 1 / 120;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    while (acc >= STEP) { update(STEP); revealInvisible(); acc -= STEP; }
    render();
    requestAnimationFrame(frame);
  }

  // win-screen keys
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (won && k === "r") { won = false; levelIdx = 0; deaths = 0; totalTime = 0; starsGot = 0; checkpointPos = null; loadLevel(0); }
    if (won && CUSTOM && k === "e") location.href = "editor.html";
  });

  // debug hook (read-only-ish) for automated testing; harmless in normal play
  window.__ld = {
    player, keys,
    get level() { return levelIdx; },
    get won() { return won; },
    get door() { return L.door; },
    get L() { return L; },
    get entering() { return !!entering; },
    laserOn: (i) => laserState(L.lasers[i]).active,
    jumpTo(i) { checkpointPos = null; levelIdx = i; loadLevel(i); },
  };

  // boot
  canvas.width = VW; canvas.height = VH;
  loadLevel(0);
  fit();
  requestAnimationFrame(frame);
})();
