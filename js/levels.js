// Level Devil clone — level data
// Virtual play area is 960 x 540. Ground top sits at y=500 (40px thick base).
// Every rect: {x,y,w,h}. Traps are grouped by behaviour so the engine can
// treat each honestly-drawn-but-lying surface differently.
//
// Behaviour buckets:
//   solids      -> always collidable
//   fakes       -> drawn like solids, ZERO collision (you fall through)  [troll]
//   disappear   -> solid until you stand on it, then vanishes after `delay`s
//   collapse    -> solid until stepped, then drops out of the world
//   spikes      -> static deadly hazard (dir: 'up'|'down'|'left'|'right')
//   popspikes   -> hidden until player enters `zone`, then spring up & kill
//   fallers     -> block/spike that drops from ceiling when `zone` entered
//   door        -> the goal. runaway:true makes it flee to `wall` x when neared
//   reverse     -> flips left/right controls for the whole level
//
// Design: level 1 is honest to build trust, then the game betrays it.

const GROUND = 500;          // y of ground surface
const PW = 30, PH = 34;      // player size (for spawn math)
const DOOR_W = 44, DOOR_H = 64;
const onGround = () => GROUND - PH;                 // player y resting on ground
const doorY = (top = GROUND) => top - DOOR_H;       // door y resting on a surface

const LEVELS = [
  // 1 — honest warm-up. Learn run + jump. One gap.
  {
    name: "Warm Up",
    hint: "Reach the door. Arrows / WASD to move, Space to jump.",
    spawn: { x: 50, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 430, h: 40 },
      { x: 560, y: GROUND, w: 400, h: 40 },
    ],
  },

  // 2 — Trust Issues. Floor looks whole; the middle is a lie.
  {
    name: "Trust Issues",
    hint: "It looks solid...",
    spawn: { x: 50, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 405, h: 40 },
      { x: 555, y: GROUND, w: 405, h: 40 },
    ],
    fakes: [
      { x: 405, y: GROUND, w: 150, h: 40 }, // draws as floor, drops you into the pit
    ],
  },

  // 3 — Disappearing Act. Stepping stones that erase themselves.
  {
    name: "Disappearing Act",
    hint: "Don't stand still. Keep moving.",
    spawn: { x: 40, y: onGround() },
    door: { x: 890, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 200, h: 40 },
      { x: 760, y: GROUND, w: 200, h: 40 },
    ],
    disappear: [
      { x: 250, y: 470, w: 90, h: 22, delay: 0.25 },
      { x: 400, y: 430, w: 90, h: 22, delay: 0.25 },
      { x: 550, y: 470, w: 90, h: 22, delay: 0.25 },
      { x: 660, y: 500, w: 90, h: 22, delay: 0.25 },
    ],
  },

  // 4 — Rise Up. Flat run, but spikes ambush from the floor.
  {
    name: "Rise Up",
    hint: "The floor bites back.",
    spawn: { x: 40, y: onGround() },
    door: { x: 890, y: doorY() },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }],
    popspikes: [
      { x: 300, y: GROUND, w: 60, h: 40, dir: "up", zone: { x: 210, y: 380, w: 120, h: 160 } },
      { x: 520, y: GROUND, w: 60, h: 40, dir: "up", zone: { x: 430, y: 380, w: 120, h: 160 } },
      { x: 700, y: GROUND, w: 60, h: 40, dir: "up", zone: { x: 620, y: 380, w: 110, h: 160 } },
    ],
  },

  // 5 — Falling Sky. Spiked blocks drop where you're about to step.
  {
    name: "Falling Sky",
    hint: "Look up. Or don't.",
    spawn: { x: 40, y: onGround() },
    door: { x: 890, y: doorY() },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }],
    fallers: [
      { x: 300, y: -70, w: 70, h: 70, deadly: true, zone: { x: 190, y: 0, w: 120, h: 540 } },
      { x: 520, y: -70, w: 70, h: 70, deadly: true, zone: { x: 410, y: 0, w: 120, h: 540 } },
      { x: 720, y: -70, w: 70, h: 70, deadly: true, zone: { x: 610, y: 0, w: 120, h: 540 } },
    ],
  },

  // 6 — Cave In. Platforms crumble a beat after you land.
  {
    name: "Cave In",
    hint: "Nothing here lasts.",
    spawn: { x: 40, y: onGround() },
    door: { x: 890, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 180, h: 40 },
      { x: 780, y: GROUND, w: 180, h: 40 },
    ],
    collapse: [
      { x: 240, y: 460, w: 110, h: 22, delay: 0.18 },
      { x: 420, y: 420, w: 110, h: 22, delay: 0.18 },
      { x: 600, y: 460, w: 110, h: 22, delay: 0.18 },
    ],
    spikes: [{ x: 180, y: 526, w: 600, h: 14, dir: "up" }], // pit floor punishes falls
  },

  // 7 — Cold Feet. The door runs from you until it hits the wall.
  {
    name: "Cold Feet",
    hint: "Corner it.",
    spawn: { x: 40, y: onGround() },
    door: { x: 300, y: doorY(), runaway: true, wall: 880, speed: 300, trigger: 170 },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }, { x: 936, y: 0, w: 24, h: 540 }],
  },

  // 8 — Wrong Way. Controls reversed, with a gap to punish panic.
  {
    name: "Wrong Way",
    hint: "Left is right. Right is left.",
    reverse: true,
    spawn: { x: 50, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 400, h: 40 },
      { x: 560, y: GROUND, w: 400, h: 40 },
    ],
    popspikes: [
      { x: 700, y: GROUND, w: 60, h: 40, dir: "up", zone: { x: 610, y: 380, w: 120, h: 160 } },
    ],
  },

  // 9 — Press. A ceiling slab slams down mid-corridor.
  {
    name: "Press",
    hint: "Time it. Then run.",
    spawn: { x: 40, y: onGround() },
    door: { x: 890, y: doorY() },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }, { x: 0, y: 0, w: 960, h: 20 }],
    fallers: [
      { x: 360, y: 20, w: 130, h: 150, deadly: true, zone: { x: 250, y: 0, w: 110, h: 540 }, rest: 350 },
      { x: 620, y: 20, w: 130, h: 150, deadly: true, zone: { x: 510, y: 0, w: 110, h: 540 }, rest: 350 },
    ],
  },

  // 10 — Finale. Everything the game taught you, all at once.
  {
    name: "Finale",
    hint: "You know the tricks now. Prove it.",
    spawn: { x: 30, y: onGround() },
    door: { x: 900, y: doorY(), runaway: true, wall: 916, speed: 260, trigger: 150 },
    solids: [
      { x: 0,   y: GROUND, w: 160, h: 40 },
      { x: 460, y: GROUND, w: 120, h: 40 },
      { x: 860, y: GROUND, w: 100, h: 40 },
      { x: 936, y: 0, w: 24, h: 540 },
    ],
    fakes: [{ x: 160, y: GROUND, w: 80, h: 40 }],           // false first step
    disappear: [
      { x: 300, y: 450, w: 90, h: 22, delay: 0.22 },
      { x: 660, y: 450, w: 90, h: 22, delay: 0.22 },
    ],
    popspikes: [
      { x: 490, y: GROUND, w: 60, h: 40, dir: "up", zone: { x: 400, y: 380, w: 120, h: 160 } },
    ],
    fallers: [
      { x: 740, y: -70, w: 70, h: 70, deadly: true, zone: { x: 630, y: 0, w: 120, h: 540 } },
    ],
    spikes: [{ x: 240, y: 526, w: 620, h: 14, dir: "up" }],
  },
];

if (typeof module !== "undefined") module.exports = { LEVELS };
