// Level Devil clone — game core. Physics/logic/camera/shell; all drawing lives in js/render.js (LDR).
(() => {
  "use strict";

  const VW = 960, VH = 540, S = 3, BW = 320, BH = 180;
  const GRAV = 2400, MOVE = 300, JUMP = 780, MAXFALL = 1400;
  const ICE_ACC = 700, ICE_FRICTION = 260;
  const ENTER_DUR = 0.6;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const buf = document.createElement("canvas");
  buf.width = BW; buf.height = BH;
  const bctx = buf.getContext("2d");

  const sfx = (n) => { if (window.SFX) SFX.play(n); };

  // ---- theme ----
  let C = THEMES.tan;

  // ---- character animation state ----
  const anim = { time: 0, stride: 0, facing: 1, landPose: 0, wasGround: false };

  // ---- input ----
  const keys = { left: false, right: false, jump: false };
  const setKey = (e, down) => {
    if (mode !== "play") return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = down;
    else if (k === "arrowright" || k === "d") keys.right = down;
    else if (k === "arrowup" || k === "w" || k === " ") keys.jump = down;
    else if (down && k === "r" && !paused) { resetLevel(); return; }
    else if (down && k === "escape") { togglePause(); return; }
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

  // ---- shell / screens ----
  let mode = "menu";              // 'menu' | 'play'
  let paused = false;
  let CUSTOM = false, SHARED = false, customRaw = null;
  const $ = (id) => document.getElementById(id);
  const screens = ["screen-title", "screen-levels", "screen-settings", "gamewrap", "overlay-pause", "overlay-complete"];
  function show(...ids) {
    for (const s of screens) { const el = $(s); if (el) el.style.display = ids.includes(s) ? "" : "none"; }
  }

  // ---- progress ----
  const progress = (() => { try { return JSON.parse(localStorage.getItem("ld_progress") || "{}"); } catch (_) { return {}; } })();
  progress.done = progress.done || {}; progress.stars = progress.stars || {};
  const saveProgress = () => localStorage.setItem("ld_progress", JSON.stringify(progress));

  // ---- state ----
  let levelIdx = 0, deaths = 0, totalTime = 0, levelTime = 0, won = false;
  let starsBanked = 0;                                     // stars from finished levels; current level counted live
  const starCount = () => starsBanked + (L ? L.stars.filter((s) => s.got).length : 0);
  // per-attempt troll reveals: persist across deaths, reset on fresh level entry (never stamped on source data)
  let attempt = { fakeDone: false, doorShown: false };
  const newAttempt = () => { attempt = { fakeDone: false, doorShown: false }; };
  let L = null, entering = null, checkpointPos = null;
  const keysHeld = new Set();
  const player = { x: 0, y: 0, w: 30, h: 34, vx: 0, vy: 0, onGround: false, alive: true, wasJump: false,
                   carrier: null, surf: { ice: false, belt: 0 }, portalCD: 0 };
  let particles = [];
  let respawnTimer = 0;
  const cam = { x: 0, y: 0 };

  const overlap = (ax, ay, aw, ah, bx_, by_, bw, bh) =>
    ax < bx_ + bw && ax + aw > bx_ && ay < by_ + bh && ay + ah > by_;
  const pOver = (r, pad = 0) => overlap(player.x + pad, player.y + pad, player.w - pad * 2, player.h - pad * 2, r.x, r.y, r.w, r.h);
  const inZone = (z) => overlap(player.x, player.y, player.w, player.h, z.x, z.y, z.w, z.h);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadLevel(i) {
    const src = LEVELS[i];
    C = THEMES[src.theme] || THEMES.tan;
    L = LDR.buildRuntime(src);
    if (attempt.doorShown) L.door.hidden = false;
    if (attempt.fakeDone) for (const f of L.fakeExits) { f.triggered = true; if (f.action === "flee") f.gone = true; }
    const sp = checkpointPos || src.spawn;
    player.x = sp.x; player.y = sp.y;
    player.vx = player.vy = 0; player.onGround = false; player.alive = true;
    player.carrier = null; player.surf = { ice: false, belt: 0 }; player.portalCD = 0;
    keysHeld.clear();
    if (checkpointPos && checkpointPos.keys) {           // restore checkpoint context
      L.grav = checkpointPos.grav ?? L.grav;
      L.reverse = checkpointPos.reverse ?? L.reverse;
      for (const id of checkpointPos.keys) keysHeld.add(id);
      for (const k of L.keys) if (keysHeld.has(k.id)) k.got = true;
      for (const g of L.gates) if (checkpointPos.gates.includes(g.id)) g.opened = true;
    }
    particles = [];
    respawnTimer = 0;
    entering = null;
    levelTime = 0;
    snapCam();
  }

  function resetLevel() { loadLevel(levelIdx); }

  function markDone() {
    if (!CUSTOM) {
      progress.done[levelIdx] = progress.done[levelIdx] || {};
      const rec = progress.done[levelIdx];
      if (rec.time == null || levelTime < rec.time) rec.time = Math.round(levelTime * 10) / 10;
      if (L.stars.some((s) => s.got)) progress.stars[levelIdx] = true;
      saveProgress();
    }
  }

  function nextLevel() {
    sfx("complete");
    markDone();
    for (const s of L.stars) if (s.got) { starsBanked++; s.got = false; }   // bank once; got cleared so starCount stays exact
    checkpointPos = null;
    newAttempt();
    if (CUSTOM) { completeCustom(); return; }
    if (levelIdx + 1 >= LEVELS.length) { won = true; return; }
    levelIdx++; loadLevel(levelIdx);
  }

  function completeCustom() {
    won = true;
    // verify handshake for the editor's test-play
    if (customRaw && !SHARED) {
      try { localStorage.setItem("ld_verify", JSON.stringify({ hash: LDS.hash(customRaw), ts: Date.now() })); } catch (_) {}
    }
    const box = $("overlay-complete");
    if (box) {
      $("comp-title").textContent = SHARED ? "Level Clear!" : "Verified! ✓";
      $("comp-stats").textContent = `${deaths} deaths · ${totalTime.toFixed(1)}s` + (starCount() ? ` · ★${starCount()}` : "");
      $("comp-sub").textContent = SHARED ? "Beat the devil at someone else's game." : "This level is now shareable from the editor.";
      show("gamewrap", "overlay-complete");
    }
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
    sfx("death");
    burst(player.x + player.w / 2, player.y + player.h / 2 - 4, 26, [C.brickShade, C.brick, C.bg, C.player]);
  }

  function solidRects(withMovers = true) {
    const out = L.solids.slice();
    for (const r of L.invisible) out.push(r);
    for (const r of L.ice) out.push(r);
    for (const r of L.conveyors) out.push(r);
    for (const d of L.disappear) if (!d.gone) out.push(d);
    for (const c of L.collapse) if (!c.falling) out.push(c);
    for (const a of L.appearing) if (a.on) out.push(a);
    if (withMovers) for (const m of L.movers) out.push(m);
    for (const g of L.gates) if (!g.opened) out.push(g);
    return out;
  }

  // ---- camera ----
  function camTarget() {
    let zx = 0, zy = 0, zw = L.w, zh = L.h;
    const pcx = player.x + player.w / 2, pcy = player.y + player.h / 2;
    for (const z of L.camZones) {
      if (pcx >= z.x && pcx < z.x + z.w && pcy >= z.y && pcy < z.y + z.h) { zx = z.x; zy = z.y; zw = z.w; zh = z.h; break; }
    }
    let tx = zw <= VW ? zx + (zw - VW) / 2 : clamp(pcx - VW / 2, zx, zx + zw - VW);
    let ty = zh <= VH ? zy + (zh - VH) / 2 : clamp(pcy - VH / 2, zy, zy + zh - VH);
    tx = clamp(tx, 0, Math.max(0, L.w - VW));
    ty = clamp(ty, 0, Math.max(0, L.h - VH));
    return { tx, ty };
  }
  function snapCam() { const t = camTarget(); cam.x = t.tx; cam.y = t.ty; }
  function updateCam(dt) {
    const t = camTarget();
    const k = Math.min(1, dt * 7);
    cam.x += (t.tx - cam.x) * k;
    cam.y += (t.ty - cam.y) * k;
  }

  // ---- update ----
  function update(dt) {
    if (mode !== "play" || paused || won) return;
    totalTime += dt; levelTime += dt;
    anim.time += dt;
    if (anim.landPose > 0) anim.landPose -= dt;
    if (player.portalCD > 0) player.portalCD -= dt;

    for (const p of particles) { p.life -= dt; p.vy += GRAV * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter((p) => p.life > 0);

    if (!player.alive) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) resetLevel();
      return;
    }

    updateTraps(dt);

    if (entering) {
      entering.t += dt;
      const cx = L.door.x + L.door.w / 2 - player.w / 2;
      player.x += Math.sign(cx - player.x) * Math.min(Math.abs(cx - player.x), 160 * dt);
      anim.stride += 8 * dt;
      updateCam(dt);
      if (entering.t >= ENTER_DUR) nextLevel();
      return;
    }

    const gd = L.grav;

    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (L.reverse) dir = -dir;
    if (player.surf.ice && player.onGround) {
      const target = dir * MOVE;
      const acc = dir !== 0 ? ICE_ACC : ICE_FRICTION;
      const dv = target - player.vx;
      player.vx += Math.sign(dv) * Math.min(Math.abs(dv), acc * dt);
    } else {
      player.vx = dir * MOVE;
    }

    let jm = 1;
    for (const z of L.jumpZones) if (inZone(z)) jm = z.mult;
    if (keys.jump && player.onGround && !player.wasJump) {
      player.vy = -JUMP * jm * gd; player.onGround = false;
      sfx("jump");
      burst(player.x + player.w / 2, player.y + (gd > 0 ? player.h : 0), 4, [C.brickShade], 90);
    }
    player.wasJump = keys.jump;

    player.vy += GRAV * gd * dt;
    player.vy = Math.max(-MAXFALL, Math.min(player.vy, MAXFALL));

    const statics = solidRects(false);
    // shove player by a mover's delta, resolved against static geometry; pinched = crushed
    const shove = (m, dx, dy) => {
      player.x += dx; player.y += dy;
      let bumped = false;
      for (const r of statics) if (pOver(r)) {
        bumped = true;
        if (dx > 0) player.x = r.x - player.w; else if (dx < 0) player.x = r.x + r.w;
        if (dy > 0) player.y = r.y - player.h; else if (dy < 0) player.y = r.y + r.h;
      }
      if (bumped && pOver(m, 8)) die();
    };
    for (const m of L.movers) {
      const px = m.x, py = m.y;
      if (m.wait > 0) { m.wait -= dt; m.dx = m.dy = 0; continue; }      // pausing at a path end
      const dxs = m.x2 - (m.ox ?? (m.ox = m.x)), dys = m.y2 - (m.oy ?? (m.oy = m.y));
      const len = Math.hypot(dxs, dys) || 1;
      m.t += (m.fwd ? 1 : -1) * (m.speed * dt) / len;
      if (m.t >= 1) { m.t = 1; m.fwd = false; m.wait = m.pause ?? 0; }
      else if (m.t <= 0) { m.t = 0; m.fwd = true; m.wait = m.pause ?? 0; }
      m.x = m.ox + dxs * m.t; m.y = m.oy + dys * m.t;
      m.dx = m.x - px; m.dy = m.y - py;
      if (player.carrier === m || pOver(m)) shove(m, m.dx, m.dy);
    }
    player.carrier = null;

    const solids = solidRects();

    const effVx = player.vx + (player.onGround ? player.surf.belt : 0);
    player.x += effVx * dt;
    for (const r of solids) {
      if (pOver(r)) {
        if (effVx > 0) player.x = r.x - player.w;
        else if (effVx < 0) player.x = r.x + r.w;
        if (effVx !== 0 && !player.surf.ice) player.vx = 0;
      }
    }

    const prevY = player.y;
    player.y += player.vy * dt;
    player.onGround = false;
    player.surf = { ice: false, belt: 0 };
    for (const r of solids) {
      if (pOver(r)) {
        if (player.vy * gd > 0) {
          player.y = gd > 0 ? r.y - player.h : r.y + r.h;
          player.onGround = true;
          player.surf.ice = !!r.ice;
          player.surf.belt = r.belt || 0;
          if (r.mover) player.carrier = r;
          markStepped(r);
          player.vy = 0;
        } else if (player.vy * gd < 0) {
          player.y = gd > 0 ? r.y + r.h : r.y - player.h;
          player.vy = 0;
        }
      }
    }
    for (const r of solids) if (pOver(r, 8)) { die(); break; }   // crushed

    if (player.vy * gd >= 0) {                            // falling in current gravity's "down"
      for (const r of L.oneways) {
        if (player.x >= r.x + r.w || player.x + player.w <= r.x) continue;
        if (gd > 0) {
          const feetPrev = prevY + player.h, feetNow = player.y + player.h;
          if (feetPrev <= r.y + 1 && feetNow >= r.y) { player.y = r.y - player.h; player.vy = 0; player.onGround = true; }
        } else {                                          // inverted: land head-first on the underside
          if (prevY >= r.y + r.h - 1 && player.y <= r.y + r.h) { player.y = r.y + r.h; player.vy = 0; player.onGround = true; }
        }
      }
    }

    if (player.x < 0) player.x = 0;
    if (player.x + player.w > L.w) player.x = L.w - player.w;

    if (Math.abs(player.vx) > 5) anim.facing = player.vx > 0 ? 1 : -1;
    if (player.onGround && Math.abs(player.vx) > 5) anim.stride += Math.abs(player.vx) * dt / 24;
    if (player.onGround && !anim.wasGround) {
      anim.landPose = 0.1;
      sfx("land");
      burst(player.x + player.w / 2, player.y + (gd > 0 ? player.h : 0), 3, [C.brickShade], 70);
    }
    anim.wasGround = player.onGround;

    updateDoor(dt);
    updateZones();
    collect();
    revealInvisible();
    updateCam(dt);

    if (player.y > L.h + 40 || player.y + player.h < -60) die();
    if (player.alive && touchingHazard()) die();

    const d = L.door;
    if (!d.hidden && player.alive && player.onGround &&
        overlap(player.x + 4, player.y + 4, player.w - 8, player.h - 8, d.x + 6, d.y, d.w - 12, d.h)) {
      entering = { t: 0 };
      sfx("door");
    }

    for (const f of L.fakeExits) {
      if (f.gone) continue;
      if (!f.triggered && player.onGround &&
          overlap(player.x + 4, player.y + 4, player.w - 8, player.h - 8, f.x + 6, f.y, f.w - 12, f.h)) {
        f.triggered = true;
        attempt.fakeDone = attempt.doorShown = true;
        L.door.hidden = false;
        sfx("error");
        burst(f.x + f.w / 2, f.y + f.h / 2, 18, [C.brick, C.brickShade, C.doorDark]);
        if (f.action === "flee") f.gone = true;
      }
      if (f.triggered && f.action === "spikes" && pOver(f, 4)) die();
    }
  }

  function markStepped(r) {
    if ("touched" in r && !r.touched) { r.touched = true; r.t = 0; }
  }

  function updateZones() {
    for (const z of L.gravZones) {
      const inside = inZone(z);
      if (inside && z.armed) { z.armed = false; L.grav = -L.grav; player.vy = 0; sfx("portal"); }
      if (!inside) z.armed = true;
    }
    for (const z of L.ctrlZones) {
      const inside = inZone(z);
      if (inside && z.armed) { z.armed = false; L.reverse = !L.reverse; sfx("error"); }
      if (!inside) z.armed = true;
    }
    if (player.portalCD <= 0) {
      for (const p of L.portals) {
        const A = { x: p.ax, y: p.ay, w: p.w, h: p.h }, B = { x: p.bx, y: p.by, w: p.w, h: p.h };
        let dest = null;
        if (pOver(A)) dest = B; else if (!p.oneway && pOver(B)) dest = A;
        if (dest) {
          player.x = dest.x + (p.w - player.w) / 2; player.y = dest.y + p.h - player.h;
          player.vy = 0; player.portalCD = 0.7;
          sfx("portal");
          burst(player.x + player.w / 2, player.y + player.h / 2, 10, [C.portal], 160);
          snapCam();
          break;
        }
      }
    }
    for (const b of L.buttons) {
      const plate = { x: b.x, y: b.y - 8, w: b.w, h: 8 };
      b.pressed = pOver(plate);
      const rising = b.pressed && !b.was;
      b.was = b.pressed;
      if (rising) sfx("button");
      for (const g of L.gates) {
        if (!b.targets.includes(g.id)) continue;
        const was = g.opened;
        if (b.mode === "hold") g.opened = b.pressed;
        else if (rising) g.opened = !g.opened;
        if (g.opened !== was) sfx("gate");
      }
    }
    for (const g of L.gates) if (g.needKey && keysHeld.has(g.needKey) && !g.opened) { g.opened = true; sfx("gate"); }
    for (const c of L.checkpoints) {
      if (!c.hit && overlap(player.x, player.y, player.w, player.h, c.x - 10, c.y - 60, 40, 60)) {
        c.hit = true;
        sfx("checkpoint");
        if (!c.fake) checkpointPos = { x: c.x, y: c.y - player.h, grav: L.grav, reverse: L.reverse,
                                       keys: [...keysHeld], gates: L.gates.filter((g) => g.opened).map((g) => g.id) };
      }
    }
  }

  function collect() {
    for (const c of L.coins) {
      if (!c.got && overlap(player.x, player.y, player.w, player.h, c.x - 9, c.y - 9, 18, 18)) {
        c.got = true; sfx("coin");
        burst(c.x, c.y, 8, [C.coin], 140);
      }
    }
    for (const s of L.stars) {
      if (!s.got && overlap(player.x, player.y, player.w, player.h, s.x - 12, s.y - 12, 24, 24)) {
        s.got = true; sfx("star");
        burst(s.x, s.y, 14, [C.star, C.coin], 200);
      }
    }
    for (const k of L.keys) {
      if (!k.got && overlap(player.x, player.y, player.w, player.h, k.x - 12, k.y - 10, 24, 20)) {
        k.got = true; keysHeld.add(k.id); sfx("key");
        burst(k.x, k.y, 10, [C.key], 150);
      }
    }
  }

  function updateTraps(dt) {
    for (const d of L.disappear) {
      if (d.touched && !d.gone) {
        d.t += dt;
        if (d.t >= d.delay) { d.alpha -= dt * 4; if (d.alpha <= 0) { d.alpha = 0; d.gone = true; d.rt = 0; } }
      } else if (d.gone && (d.respawn ?? 0) > 0) {
        d.rt += dt;
        if (d.rt >= d.respawn && !pOver(d)) { d.touched = false; d.t = 0; d.gone = false; d.alpha = 1; }  // never respawn inside the player
      }
    }
    for (const c of L.collapse) {
      if (c.touched) {
        c.t += dt;
        if (c.t >= c.delay) { c.falling = true; c.vy = Math.min(c.vy + GRAV * dt, MAXFALL); c.y += c.vy * dt; }
      }
    }
    for (const a of L.appearing) {
      if (a.on) continue;
      if (inZone(a.zone)) a.trig = true;
      if (a.trig && !pOver(a)) { a.on = true; sfx("appear"); burst(a.x + a.w / 2, a.y, 8, [C.brickShade], 120); }  // never solidify inside the player
    }
    for (const s of L.popspikes) {
      if (!s.active && inZone(s.zone)) { if (s.prog <= 0) sfx("pop"); s.active = true; }
      if (s.retract && s.active && !inZone(s.zone)) s.active = false;   // re-arms when the player leaves
      const spd = s.rise ?? 8;
      if (s.active) s.prog = Math.min(1, s.prog + dt * spd);
      else if (s.retract) s.prog = Math.max(0, s.prog - dt * spd);
    }
    for (const l of L.lasers) {
      const on = LDR.laserState(l, anim.time).active;
      if (on && !l.wasOn && l.x < cam.x + VW + 200 && l.x + l.w > cam.x - 200) sfx("laser");
      l.wasOn = on;
    }
    for (const f of L.fallers) {
      const restY = f.rest != null ? f.rest : 500 - f.h;
      const gap = f.gap ?? 0.7, hold = f.hold ?? 0.45, up = f.up ?? 640;
      switch (f.phase) {
        case "idle": if (inZone(f.zone)) { f.phase = "armed"; f.timer = gap; } break;
        case "armed": f.timer -= dt; if (f.timer <= 0) { f.phase = "down"; f.vy = 0; } break;
        case "down":
          f.vy = Math.min(f.vy + GRAV * dt, MAXFALL); f.y += f.vy * dt;
          if (f.y >= restY) { f.y = restY; f.phase = "hold"; f.timer = hold; sfx("slam"); }
          break;
        case "hold": f.timer -= dt; if (f.timer <= 0) f.phase = "up"; break;
        case "up": f.y -= up * dt; if (f.y <= f.y0) { f.y = f.y0; f.phase = "armed"; f.timer = gap; } break;
      }
    }
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
    for (const c of L.chasers) {
      if (!c.active && inZone(c.zone)) { c.active = true; sfx("error"); }
      if (c.active) {
        const target = player.x + player.w / 2 - c.w / 2;
        c.x += Math.sign(target - c.x) * Math.min(Math.abs(target - c.x), c.speed * dt);
      }
    }
    for (const p of L.patrols) {
      p.x += p.dir * p.speed * dt;
      if (p.x <= p.minX) { p.x = p.minX; p.dir = 1; }
      if (p.x + p.w >= p.maxX) { p.x = p.maxX - p.w; p.dir = -1; }
    }
  }

  function updateDoor(dt) {
    const d = L.door;
    if (!d.runaway || d.hidden) return;
    const pc = player.x + player.w / 2, dc = d.x + d.w / 2;
    if (Math.abs(pc - dc) < (d.trigger || 160) && d.x < (d.wall - d.w)) {
      d.x = Math.min(d.x + (d.speed || 280) * dt, d.wall - d.w);
    }
  }

  function touchingHazard() {
    const pad = 3;
    for (const s of L.spikes) if (pOver(s, pad)) return true;
    for (const s of L.popspikes) {
      if (s.prog > 0.15) {
        const hh = s.h * s.prog;
        const ry = s.dir === "down" ? s.y0 : s.y0 - hh;      // down = grows out of the ceiling
        if (overlap(player.x + pad, player.y + pad, player.w - 6, player.h - 6, s.x, ry, s.w, hh)) return true;
      }
    }
    for (const f of L.fallers) if (f.deadly && f.y > f.y0 + 4 &&
      overlap(player.x + pad, player.y + pad, player.w - 6, player.h - 6, f.x, f.y, f.w, f.h + 12)) return true;
    for (const s of L.saws) {
      const nx = Math.max(player.x + pad, Math.min(s.x, player.x + player.w - pad));
      const ny = Math.max(player.y + pad, Math.min(s.y, player.y + player.h - pad));
      if ((nx - s.x) ** 2 + (ny - s.y) ** 2 < (s.r - 2) ** 2) return true;
    }
    for (const l of L.lasers) if (LDR.laserState(l, anim.time).active && pOver(l, pad)) return true;
    for (const f of L.fires) if (overlap(player.x + pad, player.y + pad, player.w - 6, player.h - 6, f.x, f.y, f.w, f.h)) return true;
    for (const c of L.chasers) if (c.active && pOver(c, pad)) return true;
    for (const p of L.patrols) if (pOver(p, pad)) return true;
    return false;
  }

  function revealInvisible() {
    for (const r of L.invisible) {
      if (!r.seen && overlap(player.x - 2, player.y - 2, player.w + 4, player.h + 4, r.x, r.y, r.w, r.h)) r.seen = true;
    }
  }

  // ---- render ----
  function render() {
    if (mode !== "play") return;
    LDR.drawWorld(bctx, L, C, {
      time: anim.time, camX: cam.x, camY: cam.y,
      char: { player, anim, entering, enterDur: ENTER_DUR, grav: L.grav },
      particles,
    });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, VW, VH);

    if (L.hint && !won && levelTime < 6) {
      ctx.font = "16px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const tw = ctx.measureText(L.hint).width;
      ctx.fillStyle = C.hintPill;
      roundRect(VW / 2 - tw / 2 - 14, 24, tw + 28, 26, 13); ctx.fill();
      ctx.fillStyle = C.hintText; ctx.fillText(L.hint, VW / 2, 42);
    }

    if (won && !CUSTOM) drawWin();

    hudLevel.textContent = CUSTOM ? (SHARED ? "SHARED" : "TEST") : `${LEVELS[levelIdx].world}-${LEVELS[levelIdx].wlevel}`;
    hudName.textContent = won ? "Complete" : `${LEVELS[levelIdx].wname} · ${L.name}`;
    hudDeaths.textContent = deaths;
    hudTime.textContent = totalTime.toFixed(1) + "s";
    if (hudCoinsWrap) {
      if (L.coins.length) { hudCoinsWrap.style.display = ""; hudCoins.textContent = `${L.coins.filter((c) => c.got).length}/${L.coins.length}`; }
      else hudCoinsWrap.style.display = "none";
    }
    if (hudStarsWrap) {
      if (starCount() > 0 || L.stars.length) { hudStarsWrap.style.display = ""; hudStars.textContent = starCount(); }
      else hudStarsWrap.style.display = "none";
    }
  }

  function drawWin() {
    ctx.fillStyle = "rgba(20,14,8,0.9)"; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = C.door; ctx.textAlign = "center";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.fillText("YOU BEAT THE DEVIL", VW / 2, 210);
    ctx.fillStyle = "#f6f1e6"; ctx.font = "22px system-ui, sans-serif";
    ctx.fillText(`${deaths} deaths — ${totalTime.toFixed(1)}s${starCount() ? ` — ★${starCount()}` : ""}`, VW / 2, 262);
    ctx.fillStyle = "rgba(246,241,230,0.65)"; ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Press R to play again · Esc for menu", VW / 2, 312);
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
  const hudLevel = $("hud-level"), hudName = $("hud-name"), hudDeaths = $("hud-deaths"), hudTime = $("hud-time");
  const hudCoins = $("hud-coins"), hudCoinsWrap = $("hud-coins-wrap"), hudStars = $("hud-stars"), hudStarsWrap = $("hud-stars-wrap");

  function fit() {
    const wrap = canvas.parentElement;
    if (!wrap || !wrap.clientWidth) return;
    const scale = Math.min(wrap.clientWidth / VW, wrap.clientHeight / VH);
    canvas.style.width = VW * scale + "px";
    canvas.style.height = VH * scale + "px";
  }
  addEventListener("resize", fit);

  // ---- main loop ----
  let last = 0, acc = 0;
  const STEP = 1 / 120;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render();
    requestAnimationFrame(frame);
  }

  // ---- shell actions ----
  function startPlay(i) {
    mode = "play"; paused = false; won = false;
    levelIdx = i; deaths = 0; totalTime = 0; starsBanked = 0; checkpointPos = null;
    newAttempt();
    loadLevel(i);
    show("gamewrap");
    fit();
  }
  function togglePause() {
    if (mode !== "play" || won) return;
    paused = !paused;
    sfx("click");
    show("gamewrap", ...(paused ? ["overlay-pause"] : []));
  }
  function toMenu() {
    mode = "menu"; paused = false;
    keys.left = keys.right = keys.jump = false;
    if (CUSTOM && !SHARED) { location.href = "editor.html"; return; }
    buildLevelGrid();
    show("screen-title");
  }

  function buildLevelGrid() {
    const wrap = $("world-list");
    if (!wrap) return;
    wrap.innerHTML = "";
    WORLDS.forEach((w, wi) => {
      const sec = document.createElement("div"); sec.className = "world-sec theme-" + w.theme;
      const h = document.createElement("h3"); h.textContent = `World ${wi + 1} · ${w.name}`; sec.appendChild(h);
      const grid = document.createElement("div"); grid.className = "lv-grid";
      w.levels.forEach((lv) => {
        const idx = LEVELS.indexOf(lv);
        const b = document.createElement("button");
        const rec = progress.done[idx];
        b.className = "lv-btn" + (rec ? " done" : "");
        b.innerHTML = `<b>${wi + 1}-${lv.wlevel}</b><span>${lv.name}</span>` +
          (rec ? `<em>✓ ${rec.time}s${progress.stars[idx] ? " ★" : ""}</em>` : `<em>&nbsp;</em>`);
        b.onclick = () => { sfx("click"); startPlay(idx); };
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      wrap.appendChild(sec);
    });
  }

  function wireShell() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = () => { sfx("click"); fn(); }; };
    on("btn-play", () => { buildLevelGrid(); show("screen-levels"); });
    on("btn-create", () => { location.href = "editor.html"; });
    on("btn-settings", () => show("screen-settings"));
    on("btn-levels-back", () => show("screen-title"));
    on("btn-settings-back", () => show("screen-title"));
    on("btn-pause", togglePause);
    on("btn-resume", togglePause);
    on("btn-p-restart", () => { paused = false; resetLevel(); show("gamewrap"); });
    on("btn-p-levels", () => { mode = "menu"; paused = false; buildLevelGrid(); show("screen-levels"); });
    on("btn-p-quit", toMenu);
    on("btn-comp-again", () => { won = false; deaths = 0; totalTime = 0; starsBanked = 0; newAttempt(); loadLevel(0); show("gamewrap"); });
    on("btn-comp-menu", toMenu);
    // play-a-shared-code box on the title screen
    const go = $("btn-code-go");
    if (go) go.onclick = async () => {
      sfx("click");
      const code = ($("code-input").value || "").trim();
      if (!code) return;
      try {
        const lvl = await LDS.decode(code.includes("#lvl=") ? code.split("#lvl=")[1] : code);
        playShared(lvl, code);
      } catch (err) { sfx("error"); alert("That code didn't decode — check you copied the whole thing."); }
    };
    // volume
    const vol = $("set-volume"), mute = $("set-mute");
    if (vol && window.SFX) {
      vol.value = SFX.volume * 100;
      mute.checked = SFX.muted;
      vol.oninput = () => { SFX.setVolume(vol.value / 100); };
      vol.onchange = () => sfx("coin");
      mute.onchange = () => { SFX.setMuted(mute.checked); sfx("coin"); };
    }
  }

  function playShared(lvl, raw) {
    lvl.theme = lvl.theme || "tan"; lvl.world = 0; lvl.wlevel = 0; lvl.wname = lvl.author ? `by ${lvl.author}` : "Shared";
    LEVELS.length = 0; LEVELS.push(lvl);
    CUSTOM = true; SHARED = true; customRaw = raw;
    startPlay(0);
  }

  // win-screen keys
  addEventListener("keydown", (e) => {
    if (mode !== "play" || !won || CUSTOM) return;
    const k = e.key.toLowerCase();
    if (k === "r") { won = false; levelIdx = 0; deaths = 0; totalTime = 0; starsBanked = 0; checkpointPos = null; newAttempt(); loadLevel(0); }
    if (k === "escape") { won = false; toMenu(); }
  });

  // ---- debug hook ----
  window.__ld = {
    player, keys,
    get level() { return levelIdx; },
    get won() { return won; },
    get door() { return L && L.door; },
    get L() { return L; },
    get cam() { return cam; },
    get entering() { return !!entering; },
    laserOn: (i) => LDR.laserState(L.lasers[i], anim.time).active,
    jumpTo(i) { checkpointPos = null; won = false; levelIdx = i; newAttempt(); starsBanked = 0; if (mode !== "play") { startPlay(i); } else { loadLevel(i); } },
  };

  // ---- boot ----
  canvas.width = VW; canvas.height = VH;
  wireShell();

  (async () => {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const params = new URLSearchParams(location.search);
    if (hash.get("lvl")) {
      try {
        const raw = hash.get("lvl");
        const lvl = await LDS.decode(raw);
        playShared(lvl, raw);
        requestAnimationFrame(frame);
        return;
      } catch (err) { console.warn("bad share code", err); }
    }
    if (params.get("custom")) {
      try {
        const rawStr = localStorage.getItem("ld_custom_level");
        const j = JSON.parse(rawStr || "null");
        if (j) {
          j.theme = j.theme || "tan"; j.world = 0; j.wlevel = 0; j.wname = "Custom";
          LEVELS.length = 0; LEVELS.push(j);
          CUSTOM = true; SHARED = false; customRaw = rawStr;
          startPlay(0);
          requestAnimationFrame(frame);
          return;
        }
      } catch (_) {}
    }
    buildLevelGrid();
    show("screen-title");
    loadLevel(0); // warm runtime so debug hook works pre-play
    requestAnimationFrame(frame);
  })();
})();
