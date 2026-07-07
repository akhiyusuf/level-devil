// Level Devil clone — engine. Vanilla JS, fixed-timestep physics, single-screen levels.
(() => {
  "use strict";

  const VW = 960, VH = 540;                 // virtual resolution
  const GRAV = 2400, MOVE = 300, JUMP = 780; // physics tuning (px, s)
  const MAXFALL = 1400;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---- theme colours (authentic Level Devil: warm sand room, terracotta bricks) ----
  const C = {
    bg: "#d8c6a0",           // warm sand background
    ceiling: "#c6ae82",      // darker top wall band
    ceilingEdge: "#8f7048",  // thin line under the ceiling band
    brick: "#b04a2a",        // terracotta platforms / ground / spikes
    brickShade: "#8f3a20",   // darker brick for undersides / coins / accents
    player: "#161616",       // black silhouette (faceless, like OG)
    door: "#dedbd3",         // pale-gray tombstone exit
    doorEdge: "#a29e94",     // door outline
    coin: "#8f3a20",         // dark-red coin dots
    particle: "#8f3a20",
    text: "#f6f1e6", hint: "rgba(74,50,28,0.6)",
  };

  // ---- character animation state ----
  const anim = { time: 0, stride: 0, facing: 1, squash: 0, wasGround: false };

  // ---- input ----
  const keys = { left: false, right: false, jump: false };
  const setKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = down;
    else if (k === "arrowright" || k === "d") keys.right = down;
    else if (k === "arrowup" || k === "w" || k === " ") keys.jump = down;
    else if (down && (k === "r")) resetLevel();
    else return;
    e.preventDefault();
  };
  addEventListener("keydown", (e) => setKey(e, true));
  addEventListener("keyup", (e) => setKey(e, false));
  // touch buttons
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

  // ---- state ----
  let levelIdx = 0, deaths = 0, totalTime = 0, won = false;
  let L = null;          // active level runtime copy
  const player = { x: 0, y: 0, w: 30, h: 34, vx: 0, vy: 0, onGround: false, alive: true, wasJump: false };
  let particles = [];
  let respawnTimer = 0;

  // AABB overlap
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  // Build a fresh mutable runtime for the current level (traps reset).
  function loadLevel(i) {
    const src = LEVELS[i];
    L = {
      name: src.name, hint: src.hint, reverse: !!src.reverse,
      spawn: { ...src.spawn },
      door: { ...src.door, w: 44, h: 64, homeX: src.door.x },
      solids: (src.solids || []).map((r) => ({ ...r })),
      fakes: (src.fakes || []).map((r) => ({ ...r })),
      disappear: (src.disappear || []).map((r) => ({ ...r, touched: false, t: 0, gone: false, alpha: 1 })),
      collapse: (src.collapse || []).map((r) => ({ ...r, x0: r.x, y0: r.y, touched: false, t: 0, falling: false, vy: 0 })),
      spikes: (src.spikes || []).map((r) => ({ ...r })),
      popspikes: (src.popspikes || []).map((r) => ({ ...r, y0: r.y, active: false, prog: 0 })),
      // cyclic crushers: idle -> armed(up window) -> down -> hold -> up -> armed ...
      fallers: (src.fallers || []).map((r) => ({ ...r, y0: r.y, phase: "idle", vy: 0, timer: 0 })),
      coins: (src.coins || []).map((c) => ({ ...c, got: false })),
    };
    player.x = src.spawn.x; player.y = src.spawn.y;
    player.vx = player.vy = 0; player.onGround = false; player.alive = true;
    particles = [];
    respawnTimer = 0;
  }

  function resetLevel() { loadLevel(levelIdx); }

  function nextLevel() {
    if (levelIdx + 1 >= LEVELS.length) { won = true; return; }
    levelIdx++; loadLevel(levelIdx);
  }

  function die() {
    if (!player.alive) return;
    player.alive = false;
    deaths++;
    respawnTimer = 0.45;
    // burst of particles
    for (let n = 0; n < 22; n++) {
      const a = (Math.PI * 2 * n) / 22 + Math.random();
      const s = 120 + Math.random() * 260;
      particles.push({ x: player.x + player.w / 2, y: player.y + player.h / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.6, r: 3 + Math.random() * 3 });
    }
  }

  // list of currently-solid rectangles (base + active traps)
  function solidRects() {
    const out = L.solids.slice();
    for (const d of L.disappear) if (!d.gone) out.push(d);
    for (const c of L.collapse) if (!c.falling) out.push(c);
    return out; // fallers are pure hazards, never solid
  }

  // ---- update ----
  function update(dt) {
    if (won) return;
    totalTime += dt;
    anim.time += dt;
    if (anim.squash > 0) anim.squash = Math.max(0, anim.squash - dt * 6); // splat relaxes

    // particles always animate
    for (const p of particles) { p.life -= dt; p.vy += GRAV * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter((p) => p.life > 0);

    if (!player.alive) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) resetLevel();
      return;
    }

    // horizontal intent (reversed levels swap it)
    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (L.reverse) dir = -dir;
    player.vx = dir * MOVE;

    // jump (edge-triggered)
    if (keys.jump && player.onGround && !player.wasJump) { player.vy = -JUMP; player.onGround = false; }
    player.wasJump = keys.jump;

    // gravity
    player.vy = Math.min(player.vy + GRAV * dt, MAXFALL);

    const solids = solidRects();

    // --- move X, resolve ---
    player.x += player.vx * dt;
    for (const r of solids) {
      if (overlap(player.x, player.y, player.w, player.h, r.x, r.y, r.w, r.h)) {
        if (player.vx > 0) player.x = r.x - player.w;
        else if (player.vx < 0) player.x = r.x + r.w;
        player.vx = 0;
      }
    }

    // --- move Y, resolve ---
    const impactVy = player.vy;          // remember fall speed for landing squash
    player.y += player.vy * dt;
    player.onGround = false;
    for (const r of solids) {
      if (overlap(player.x, player.y, player.w, player.h, r.x, r.y, r.w, r.h)) {
        if (player.vy > 0) {            // falling -> land on top
          player.y = r.y - player.h;
          player.onGround = true;
          markStepped(r);
        } else if (player.vy < 0) {     // rising -> bonk head
          player.y = r.y + r.h;
        }
        player.vy = 0;
      }
    }

    // keep inside side walls of arena
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > VW) player.x = VW - player.w;

    // --- animation drivers ---
    if (Math.abs(player.vx) > 5) anim.facing = player.vx > 0 ? 1 : -1;          // face travel dir
    if (player.onGround && Math.abs(player.vx) > 5) anim.stride += Math.abs(player.vx) * dt * 0.04; // step cadence ~ speed
    if (player.onGround && !anim.wasGround && impactVy > 250) anim.squash = Math.min(1, impactVy / 1100); // landed hard -> splat
    anim.wasGround = player.onGround;

    updateTraps(dt);
    updateDoor(dt);

    // collect coins (optional bonus -> little pop)
    for (const c of L.coins) {
      if (!c.got && overlap(player.x, player.y, player.w, player.h, c.x - 8, c.y - 8, 16, 16)) {
        c.got = true;
        for (let n = 0; n < 8; n++) { const a = (Math.PI * 2 * n) / 8; particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130 - 60, life: 0.4, r: 2.5 }); }
      }
    }

    // death: hazards or fell out the bottom
    if (player.y > VH + 40) die();
    if (player.alive && touchingHazard()) die();

    // reach door -> next level (require solid overlap with the door body)
    if (player.alive && overlap(player.x + 4, player.y + 4, player.w - 8, player.h - 8, L.door.x + 6, L.door.y, L.door.w - 12, L.door.h)) {
      nextLevel();
    }
  }

  function markStepped(r) {
    if ("touched" in r && !r.touched) { r.touched = true; r.t = 0; }
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
    // pop-up spikes: arm when player enters zone, then spring up
    for (const s of L.popspikes) {
      if (!s.active && overlap(player.x, player.y, player.w, player.h, s.zone.x, s.zone.y, s.zone.w, s.zone.h)) s.active = true;
      if (s.active && s.prog < 1) s.prog = Math.min(1, s.prog + dt * 8);
      s.y = s.y0 - s.h * s.prog;      // rise up out of the floor
    }
    // cyclic crushers: arm on zone entry, then drop/hold/retract forever (rage timing)
    for (const f of L.fallers) {
      const restY = f.rest != null ? f.rest : GROUND_TOP() - f.h;
      const gap = f.gap != null ? f.gap : 0.7, hold = f.hold != null ? f.hold : 0.45, up = f.up != null ? f.up : 640;
      switch (f.phase) {
        case "idle":
          if (overlap(player.x, player.y, player.w, player.h, f.zone.x, f.zone.y, f.zone.w, f.zone.h)) { f.phase = "armed"; f.timer = gap; }
          break;
        case "armed":                                   // up, safe window to slip under
          f.timer -= dt; if (f.timer <= 0) { f.phase = "down"; f.vy = 0; }
          break;
        case "down":
          f.vy = Math.min(f.vy + GRAV * dt, MAXFALL); f.y += f.vy * dt;
          if (f.y >= restY) { f.y = restY; f.phase = "hold"; f.timer = hold; }
          break;
        case "hold":
          f.timer -= dt; if (f.timer <= 0) f.phase = "up";
          break;
        case "up":
          f.y -= up * dt;
          if (f.y <= f.y0) { f.y = f.y0; f.phase = "armed"; f.timer = gap; }
          break;
      }
    }
  }

  function GROUND_TOP() { return 500; }

  function updateDoor(dt) {
    const d = L.door;
    if (!d.runaway) return;
    const pc = player.x + player.w / 2, dc = d.x + d.w / 2;
    if (Math.abs(pc - dc) < (d.trigger || 160) && d.x < (d.wall - d.w)) {
      d.x = Math.min(d.x + (d.speed || 280) * dt, d.wall - d.w);
    }
  }

  function touchingHazard() {
    // static spikes
    for (const s of L.spikes) if (overlap(player.x + 3, player.y + 3, player.w - 6, player.h - 6, s.x, s.y, s.w, s.h)) return true;
    // popped spikes (only deadly once risen enough)
    for (const s of L.popspikes) {
      if (s.prog > 0.15) {
        const hh = s.h * s.prog;
        if (overlap(player.x + 3, player.y + 3, player.w - 6, player.h - 6, s.x, s.y0 - hh, s.w, hh)) return true;
      }
    }
    // crushers: deadly only once they've descended from the resting spot
    for (const f of L.fallers) if (f.deadly && f.y > f.y0 + 4 && overlap(player.x + 3, player.y + 3, player.w - 6, player.h - 6, f.x, f.y, f.w, f.h)) return true;
    return false;
  }

  // ---- render ----
  // top-rounded ("tombstone") rect path; rad = w/2 gives a full semicircular top
  function archTop(x, y, w, h, rad) {
    rad = Math.min(rad, w / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  function drawSolid(r, fill) {
    ctx.fillStyle = fill || C.brick;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = C.brickShade;      // subtle darker underside -> a bit of depth
    ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
  }

  function drawSpikeStrip(x, y, w, h, dir) {
    ctx.fillStyle = C.brick;
    const n = Math.max(1, Math.round(w / 22));
    const tw = w / n;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sx = x + i * tw;
      if (dir === "up") { ctx.moveTo(sx, y + h); ctx.lineTo(sx + tw / 2, y); ctx.lineTo(sx + tw, y + h); }
      else if (dir === "down") { ctx.moveTo(sx, y); ctx.lineTo(sx + tw / 2, y + h); ctx.lineTo(sx + tw, y); }
    }
    ctx.closePath(); ctx.fill();
  }

  function render() {
    // background: flat sand + a darker top wall band (framed-room look)
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = C.ceiling; ctx.fillRect(0, 0, VW, 66);
    ctx.fillStyle = C.ceilingEdge; ctx.fillRect(0, 66, VW, 3);

    // exit: pale-gray tombstone arch (draw behind player)
    const d = L.door;
    archTop(d.x - 2, d.y - 2, d.w + 4, d.h + 4, (d.w + 4) / 2); ctx.fillStyle = C.doorEdge; ctx.fill();
    archTop(d.x, d.y, d.w, d.h, d.w / 2); ctx.fillStyle = C.door; ctx.fill();
    ctx.strokeStyle = C.doorEdge; ctx.lineWidth = 2;
    archTop(d.x + 5, d.y + 5, d.w - 10, d.h - 10, (d.w - 10) / 2); ctx.stroke(); // inner gravestone outline

    // fakes render exactly like solids (the lie)
    for (const r of L.fakes) drawSolid(r);
    // solids
    for (const r of L.solids) drawSolid(r);
    // disappearing (looks identical to solid until it fades -> the troll)
    for (const r of L.disappear) if (!r.gone) { ctx.globalAlpha = r.alpha; drawSolid(r); ctx.globalAlpha = 1; }
    // collapsing (darkens once it's been triggered)
    for (const r of L.collapse) drawSolid(r, r.touched ? C.brickShade : C.brick);
    // crushers (spiked brick slabs that drop from the ceiling)
    for (const f of L.fallers) if (f.phase !== "idle" || f.y > -60) {
      ctx.fillStyle = C.brick; ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = C.brickShade; ctx.fillRect(f.x, f.y + f.h - 3, f.w, 3);
      drawSpikeStrip(f.x, f.y + f.h - 16, f.w, 16, "down"); // teeth on the underside
    }
    // static spikes
    for (const s of L.spikes) drawSpikeStrip(s.x, s.y, s.w, s.h, s.dir || "up");
    // pop spikes
    for (const s of L.popspikes) if (s.prog > 0.02) drawSpikeStrip(s.x, s.y0 - s.h * s.prog, s.w, s.h * s.prog, "up");

    // coins (small dark-red dots)
    for (const c of L.coins) if (!c.got) {
      ctx.fillStyle = C.coin;
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)"; // tiny highlight -> reads as a bead
      ctx.beginPath(); ctx.arc(c.x - 1.5, c.y - 1.5, 2, 0, Math.PI * 2); ctx.fill();
    }

    // player
    if (player.alive) drawCharacter(player);

    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillStyle = C.particle;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;

    // hint text (first ~4s of a level)
    if (L.hint && totalTime >= 0) {
      ctx.fillStyle = C.hint;
      ctx.font = "16px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(L.hint, VW / 2, 40);
    }

    if (won) drawWin();

    // sync HUD
    hudLevel.textContent = `${levelIdx + 1} / ${LEVELS.length}`;
    hudName.textContent = won ? "Complete" : L.name;
    hudDeaths.textContent = deaths;
    hudTime.textContent = totalTime.toFixed(1) + "s";
    if (hudCoinsWrap) {                                   // only show coin stat on coin levels
      if (L.coins.length) { hudCoinsWrap.style.display = ""; hudCoins.textContent = `${L.coins.filter((c) => c.got).length}/${L.coins.length}`; }
      else hudCoinsWrap.style.display = "none";
    }
  }

  function drawWin() {
    ctx.fillStyle = "rgba(28,18,10,0.9)"; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = C.brick; ctx.textAlign = "center";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.fillText("YOU BEAT THE DEVIL", VW / 2, 220);
    ctx.fillStyle = C.text; ctx.font = "22px system-ui, sans-serif";
    ctx.fillText(`${deaths} deaths — ${totalTime.toFixed(1)}s`, VW / 2, 270);
    ctx.fillStyle = "rgba(246,241,230,0.65)"; ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Press R to play again", VW / 2, 320);
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

  // thick rounded limb segment (hip->foot or shoulder->hand), all one silhouette colour
  function limb(x1, y1, x2, y2, w) {
    ctx.strokeStyle = C.player; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // Procedural humanoid: strides when running, tucks on jump, sprawls on fall, breathes idle.
  function drawCharacter(pl) {
    const cx = pl.x + pl.w / 2, feetY = pl.y + pl.h;
    const grounded = pl.onGround, moving = Math.abs(pl.vx) > 5;

    // ground shadow -> grounds the character visually
    if (grounded) {
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      ctx.beginPath(); ctx.ellipse(cx, feetY - 1, pl.w * 0.55, 4, 0, 0, Math.PI * 2); ctx.fill();
    }

    // squash & stretch: land splat -> jump stretch -> idle breath
    let sx = 1, sy = 1;
    if (anim.squash > 0) { sx = 1 + 0.35 * anim.squash; sy = 1 - 0.35 * anim.squash; }
    else if (!grounded) { if (pl.vy < -60) { sx = 0.85; sy = 1.15; } else if (pl.vy > 240) { sx = 0.93; sy = 1.08; } }
    else if (!moving) { const b = Math.sin(anim.time * 3) * 0.03; sx = 1 - b; sy = 1 + b; }

    ctx.save();
    ctx.translate(cx, feetY); ctx.scale(anim.facing * sx, sy); ctx.translate(-cx, -feetY); // flip toward facing

    const hipY = feetY - 12, shoulderY = pl.y + 12, headY = pl.y + 6, headR = 7;
    const st = anim.stride;

    // legs (two, opposite phase). foot swings fwd/back + lifts mid-stride
    const foot = (ph) => {
      let fx, fy;
      if (grounded && moving) { fx = cx + Math.sin(ph) * 7; fy = feetY - Math.max(0, Math.cos(ph)) * 6; }
      else if (!grounded) { const s = Math.sin(ph) > 0 ? 1 : -1; if (pl.vy < -60) { fx = cx + s * 3; fy = feetY - 7; } else { fx = cx + s * 5; fy = feetY + 2; } }
      else { fx = cx + (Math.sin(ph) > 0 ? 5 : -5); fy = feetY; }
      limb(cx, hipY, fx, fy, 6);
    };
    foot(st); foot(st + Math.PI);

    // arms (two, opposite phase to legs)
    const arm = (ph) => {
      let hx, hy;
      if (grounded && moving) { hx = cx - Math.sin(ph) * 6; hy = shoulderY + 9 - Math.max(0, -Math.cos(ph)) * 3; }
      else if (!grounded) { const s = Math.sin(ph) > 0 ? 1 : -1; if (pl.vy < -60) { hx = cx + s * 8; hy = shoulderY - 4; } else { hx = cx + s * 10; hy = shoulderY + 5; } }
      else { hx = cx + (Math.sin(ph) > 0 ? 7 : -7); hy = shoulderY + 10; }
      limb(cx, shoulderY + 2, hx, hy, 5);
    };
    arm(st); arm(st + Math.PI);

    // torso + head (same colour -> one clean faceless silhouette, like the OG)
    ctx.fillStyle = C.player;
    roundRect(cx - 8, shoulderY, 16, hipY - shoulderY + 3, 5); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // ---- HUD refs ----
  const hudLevel = document.getElementById("hud-level");
  const hudName = document.getElementById("hud-name");
  const hudDeaths = document.getElementById("hud-deaths");
  const hudTime = document.getElementById("hud-time");
  const hudCoins = document.getElementById("hud-coins");
  const hudCoinsWrap = document.getElementById("hud-coins-wrap");

  // ---- responsive canvas ----
  function fit() {
    const wrap = canvas.parentElement;
    const scale = Math.min(wrap.clientWidth / VW, wrap.clientHeight / VH);
    canvas.style.width = VW * scale + "px";
    canvas.style.height = VH * scale + "px";
  }
  addEventListener("resize", fit);

  // ---- main loop (fixed timestep) ----
  let last = 0, acc = 0;
  const STEP = 1 / 120;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt > 0.1) dt = 0.1;           // clamp after tab-out
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render();
    requestAnimationFrame(frame);
  }

  // win reset
  addEventListener("keydown", (e) => {
    if (won && e.key.toLowerCase() === "r") { won = false; levelIdx = 0; deaths = 0; totalTime = 0; loadLevel(0); }
  });

  // debug hook (read-only-ish) for automated testing; harmless in normal play
  window.__ld = {
    player, keys,
    get level() { return levelIdx; },
    get won() { return won; },
    get door() { return L.door; },
    get L() { return L; },
    jumpTo(i) { levelIdx = i; loadLevel(i); },
  };

  // boot
  canvas.width = VW; canvas.height = VH;
  loadLevel(0);
  fit();
  requestAnimationFrame(frame);
})();
