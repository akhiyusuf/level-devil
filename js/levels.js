// Level Devil clone — level data
// Virtual play area is 960 x 540. Ground top sits at y=500 (40px thick base).
// Physics budget for designers: jump height ~126px, flat jump distance ~195px.
//
// Behaviour buckets (all rects {x,y,w,h} unless noted):
//   solids      -> always collidable
//   oneways     -> land-through-from-below platforms
//   fakes       -> drawn like solids, ZERO collision                     [troll]
//   invisible   -> solid but not drawn until first touch                 [troll]
//   ice         -> solid + slippery (momentum)
//   conveyors   -> solid + belt push (belt px/s, +right / -left)
//   disappear   -> solid until stood on, vanishes after `delay`s         [troll]
//   collapse    -> solid until stepped, then drops out of the world      [troll]
//   appearing   -> nothing until `zone` entered, then becomes solid      [troll]
//   movers      -> platform ping-pongs (x,y)<->(x2,y2) at `speed`, carries player
//   gates       -> {id,...} solid wall while closed; opened by button/key
//   spikes      -> static deadly strip (dir 'up'|'down')
//   popspikes   -> hidden until `zone` entered, spring up & kill         [troll]
//   fallers     -> ceiling crusher slab, cyclic slam once `zone` entered
//   saws        -> deadly spinning disc {cx,cy,r}, optional path cx2/cy2 + speed
//   lasers      -> beam rect, deadly while on; cycle {on,off,phase} (on>=99 = always)
//   fires       -> {x,y,w} animated flame strip, deadly
//   chasers     -> spiked block slides toward player once `zone` entered [troll]
//   patrols     -> {x,y,minX,maxX,speed} walking enemy, deadly on touch
//   portals     -> {ax,ay,bx,by,w,h} touch one end, exit the other (oneway:true = a->b only)
//   gravZones   -> flip gravity on entry (re-arms after you leave)       [troll]
//   ctrlZones   -> toggle reversed controls on entry                     [troll]
//   jumpZones   -> jump velocity * mult while inside (visible:false = hidden troll)
//   buttons     -> {x,y,mode:'toggle'|'hold',targets:[gateIds]} pressure plate
//   keys        -> {x,y,id} collect to open gates with needKey:id
//   checkpoints -> {x,y,fake:true?} respawn flag; fake ones lie          [troll]
//   fakeExits   -> {x,y,action:'spikes'|'flee'} doors that lie; reveal hidden real door
//   coins/stars -> collectibles
//   door        -> the goal. runaway:true flees to `wall`. hidden:true until revealed
//   reverse     -> flips left/right controls for the whole level

const GROUND = 500;          // y of ground surface
const PW = 30, PH = 34;      // player size (for spawn math)
const DOOR_W = 44, DOOR_H = 64;
const onGround = () => GROUND - PH;                 // player y resting on ground
const doorY = (top = GROUND) => top - DOOR_H;       // door y resting on a surface

// ---- per-world palettes ----
const THEMES = {
  tan: {
    bg: "#d8c6a0", band: "#c6ae82", bandEdge: "#8f7048",
    brick: "#b04a2a", brickShade: "#8f3a20", spike: "#b04a2a",
    player: "#161616", door: "#dedbd3", doorEdge: "#8f8b81", doorDark: "#4a463e",
    coin: "#8f3a20", ice: "#cfe6ea", iceShade: "#9fc4cc", metal: "#4a4440",
    laser: "#e5231a", portal: "#6d3fb0", key: "#8f3a20", star: "#c98a1e",
    fire: ["#e05a1a", "#f0a01e"], enemy: "#2a1c14", flag: "#8f3a20",
    hintText: "rgba(74,50,28,0.9)", hintPill: "rgba(216,198,160,0.82)",
  },
  yellow: {
    bg: "#f2d418", band: "#d9bb0c", bandEdge: "#a68d04",
    brick: "#cc4125", brickShade: "#a32f18", spike: "#cc4125",
    player: "#141414", door: "#eae7de", doorEdge: "#9c988c", doorDark: "#45423a",
    coin: "#a32f18", ice: "#e8f4f6", iceShade: "#b5d8de", metal: "#403a34",
    laser: "#e5231a", portal: "#5c34a8", key: "#a32f18", star: "#8a5a10",
    fire: ["#d84a12", "#f09010"], enemy: "#221812", flag: "#a32f18",
    hintText: "rgba(70,55,4,0.9)", hintPill: "rgba(242,212,24,0.85)",
  },
  dark: {
    bg: "#262336", band: "#1b1930", bandEdge: "#100e1e",
    brick: "#5b4a63", brickShade: "#453a4d", spike: "#d84a35", // spikes must pop on the dark bg
    player: "#ececec", door: "#e8d87a", doorEdge: "#a89740", doorDark: "#5c5222",
    coin: "#e8d87a", ice: "#b8d4e8", iceShade: "#87a8c4", metal: "#8a8494",
    laser: "#ff3b2e", portal: "#9a6ae0", key: "#e8d87a", star: "#f2c14e",
    fire: ["#ff5a1a", "#ffa01e"], enemy: "#c94b3a", flag: "#e8d87a",
    hintText: "rgba(232,230,240,0.92)", hintPill: "rgba(20,18,34,0.72)",
  },
};

const WORLDS = [

// ============================== WORLD 1 — THE ROOM (tan) ==============================
{ name: "The Room", theme: "tan", levels: [

  // 1-1 honest warm-up. Learn run + jump. One gap.
  {
    name: "Warm Up",
    hint: "Reach the door. Arrows / WASD to move, Space to jump.",
    spawn: { x: 50, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 430, h: 40 },
      { x: 560, y: GROUND, w: 400, h: 40 },
    ],
    coins: [{ x: 470, y: 445 }, { x: 495, y: 420 }, { x: 520, y: 445 }], // arc over the gap
  },

  // 1-2 Trust Issues. Floor looks whole; the middle is a lie.
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

  // 1-3 Disappearing Act.
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
    coins: [{ x: 295, y: 445 }, { x: 445, y: 405 }, { x: 595, y: 445 }],
  },

  // 1-4 Rise Up. Flat run, spike ambush.
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

  // 1-5 Falling Sky. Crushers hang from the ceiling.
  {
    name: "Falling Sky",
    hint: "Look up. Or don't.",
    spawn: { x: 40, y: onGround() },
    door: { x: 890, y: doorY() },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }, { x: 0, y: 0, w: 960, h: 20 }],
    fallers: [
      { x: 300, y: 20, w: 70, h: 70, deadly: true, zone: { x: 190, y: 0, w: 120, h: 540 } },
      { x: 520, y: 20, w: 70, h: 70, deadly: true, zone: { x: 410, y: 0, w: 120, h: 540 } },
      { x: 720, y: 20, w: 70, h: 70, deadly: true, zone: { x: 610, y: 0, w: 120, h: 540 } },
    ],
  },

  // 1-6 Cave In.
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
    coins: [{ x: 295, y: 435 }, { x: 475, y: 395 }, { x: 655, y: 435 }],
    spikes: [{ x: 180, y: 526, w: 600, h: 14, dir: "up" }],
  },

  // 1-7 Cold Feet. Runaway door.
  {
    name: "Cold Feet",
    hint: "Corner it.",
    spawn: { x: 40, y: onGround() },
    door: { x: 300, y: doorY(), runaway: true, wall: 900, speed: 300, trigger: 170 },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }],
  },

  // 1-8 Wrong Way. Reversed controls.
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

  // 1-9 Press. Ceiling slabs slam the corridor.
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

  // 1-10 world finale.
  {
    name: "Finale",
    hint: "You know the tricks now. Prove it.",
    spawn: { x: 30, y: onGround() },
    door: { x: 866, y: doorY(), runaway: true, wall: 924, speed: 260, trigger: 150 },
    solids: [
      { x: 0,   y: GROUND, w: 160, h: 40 },
      { x: 460, y: GROUND, w: 160, h: 40 },
      { x: 860, y: GROUND, w: 100, h: 40 },
    ],
    fakes: [{ x: 160, y: GROUND, w: 80, h: 40 }],
    disappear: [
      { x: 300, y: 450, w: 90, h: 22, delay: 0.22 },
      { x: 700, y: 450, w: 90, h: 22, delay: 0.22 },
    ],
    popspikes: [
      { x: 590, y: GROUND, w: 60, h: 40, dir: "up", zone: { x: 460, y: 380, w: 110, h: 160 } },
    ],
    fallers: [
      { x: 740, y: 20, w: 70, h: 70, deadly: true, zone: { x: 630, y: 0, w: 120, h: 540 } },
    ],
    coins: [{ x: 345, y: 425 }, { x: 540, y: 430 }, { x: 745, y: 425 }],
    spikes: [{ x: 240, y: 526, w: 620, h: 14, dir: "up" }],
    solidsExtra: [{ x: 0, y: 0, w: 960, h: 20 }], // ceiling anchor for the crusher
  },
]},

// ============================== WORLD 2 — THE SUN (yellow) ==============================
{ name: "The Sun", theme: "yellow", levels: [

  // 2-1 moving platforms intro
  {
    name: "Moving On",
    hint: "Ride them. Mind the timing.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 180, h: 40 },
      { x: 800, y: GROUND, w: 160, h: 40 },
    ],
    movers: [
      { x: 220, y: 460, w: 90, h: 16, x2: 420, y2: 460, speed: 120 },
      { x: 540, y: 420, w: 90, h: 16, x2: 690, y2: 460, speed: 110 },
    ],
    spikes: [{ x: 180, y: 526, w: 620, h: 14, dir: "up" }],
    coins: [{ x: 330, y: 430 }, { x: 610, y: 390 }, { x: 755, y: 430 }],
  },

  // 2-2 ice + gaps: momentum trolls you into the pits
  {
    name: "Cold Shoulder",
    hint: "Slippery when smug.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 140, h: 40 },
      { x: 820, y: GROUND, w: 140, h: 40 },
    ],
    ice: [
      { x: 140, y: GROUND, w: 260, h: 40 },
      { x: 480, y: GROUND, w: 260, h: 40 },
    ],
    spikes: [
      { x: 400, y: 526, w: 80, h: 14, dir: "up" },
      { x: 740, y: 526, w: 80, h: 14, dir: "up" },
    ],
    popspikes: [
      { x: 690, y: GROUND, w: 50, h: 40, dir: "up", zone: { x: 600, y: 380, w: 100, h: 160 } },
    ],
    coins: [{ x: 435, y: 450 }, { x: 775, y: 450 }],
  },

  // 2-3 pressure plate opens the gate... and wakes something up
  {
    name: "Button Masher",
    hint: "Buttons never come free.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0, y: GROUND, w: 960, h: 40 },
      { x: 560, y: 390, w: 120, h: 20 },   // button pedestal
    ],
    gates: [{ id: "g1", x: 800, y: 372, w: 24, h: 128 }],
    buttons: [{ x: 600, y: 390, mode: "toggle", targets: ["g1"] }],
    chasers: [
      { x: 10, y: 452, w: 34, h: 48, speed: 165, zone: { x: 560, y: 290, w: 120, h: 120 } },
    ],
    coins: [{ x: 300, y: 460 }, { x: 620, y: 350 }, { x: 750, y: 460 }],
  },

  // 2-4 conveyor against you + saws on patrol
  {
    name: "Sawdust",
    hint: "The floor disagrees with your plans.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 140, h: 40 },
      { x: 780, y: GROUND, w: 180, h: 40 },
    ],
    conveyors: [{ x: 140, y: GROUND, w: 640, h: 40, belt: -140 }],
    saws: [
      { cx: 320, cy: 470, r: 26, cx2: 320, cy2: 360, speed: 100 },
      { cx: 560, cy: 330, r: 26, cx2: 560, cy2: 430, speed: 120 }, // looks lethal, never reaches you [troll]
    ],
    coins: [{ x: 440, y: 440 }, { x: 680, y: 440 }],
  },

  // 2-5 vertical lasers cycle; the horizontal one never does. walk, don't jump.
  {
    name: "Lasers, Obviously",
    hint: "Sometimes the floor is the safest place.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }],
    lasers: [
      { x: 300, y: 70, w: 8, h: 430, on: 0.7, off: 1.1, phase: 0 },
      { x: 520, y: 70, w: 8, h: 430, on: 0.7, off: 1.1, phase: 0.6 },
      { x: 740, y: 70, w: 8, h: 430, on: 0.7, off: 1.1, phase: 1.2 },
      { x: 260, y: 416, w: 520, h: 6, on: 99, off: 0.01, phase: 0 }, // always on: jumping = death
    ],
    coins: [{ x: 410, y: 480 }, { x: 630, y: 480 }],
  },

  // 2-6 two identical doors. the near one lies.
  {
    name: "Two Doors",
    hint: "Pick a door. Any door.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY(), hidden: true },
    fakeExits: [{ x: 520, y: doorY(), action: "spikes" }],
    solids: [
      { x: 0,   y: GROUND, w: 640, h: 40 },
      { x: 770, y: GROUND, w: 190, h: 40 },
    ],
    fakes: [{ x: 640, y: GROUND, w: 60, h: 40 }],
    spikes: [{ x: 640, y: 526, w: 130, h: 14, dir: "up" }],
    coins: [{ x: 400, y: 460 }, { x: 700, y: 420 }],
  },

  // 2-7 gravity flip: walk the ceiling
  {
    name: "Up Is Down",
    hint: "The arrows are not a suggestion.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0, y: GROUND, w: 960, h: 40 },
      { x: 0, y: 46, w: 960, h: 20 },      // ceiling walkway
    ],
    spikes: [
      { x: 340, y: 486, w: 280, h: 14, dir: "up" },   // floor spikes force the flip
      { x: 700, y: 66, w: 180, h: 14, dir: "down" },  // ceiling spikes punish overstaying
    ],
    gravZones: [
      { x: 250, y: 380, w: 60, h: 120 },
      { x: 630, y: 60, w: 60, h: 160 },   // overlaps the ceiling walkway
    ],
    coins: [{ x: 400, y: 110 }, { x: 490, y: 110 }, { x: 580, y: 110 }],
  },

  // 2-8 invisible staircase over spikes; last step appears late
  {
    name: "Trust Fall 2",
    hint: "The path exists. Probably.",
    spawn: { x: 40, y: onGround() },
    door: { x: 892, y: doorY(340) },
    solids: [
      { x: 0,   y: GROUND, w: 150, h: 40 },
      { x: 880, y: 340, w: 80, h: 20 },
    ],
    spikes: [{ x: 150, y: 526, w: 730, h: 14, dir: "up" }],
    invisible: [
      { x: 200, y: 470, w: 140, h: 16 },
      { x: 460, y: 438, w: 140, h: 16 },
      { x: 720, y: 406, w: 140, h: 16 },
    ],
    stars: [{ x: 930, y: 270 }],
    coins: [{ x: 270, y: 440 }, { x: 530, y: 408 }, { x: 790, y: 376 }],
  },
]},

// ============================== WORLD 3 — THE DARK (dark) ==============================
{ name: "The Dark", theme: "dark", levels: [

  // 3-1 patrol enemies; the high road is safer. mostly.
  {
    name: "Night Shift",
    hint: "They don't sleep.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }],
    patrols: [
      { x: 300, y: 478, minX: 240, maxX: 460, speed: 90 },
      { x: 620, y: 478, minX: 560, maxX: 780, speed: 120 },
    ],
    oneways: [
      { x: 260, y: 420, w: 120, h: 14 },
      { x: 500, y: 390, w: 120, h: 14 },
      { x: 700, y: 420, w: 120, h: 14 },
    ],
    popspikes: [
      { x: 830, y: GROUND, w: 50, h: 40, dir: "up", zone: { x: 750, y: 380, w: 90, h: 160 } },
    ],
    coins: [{ x: 320, y: 390 }, { x: 560, y: 360 }, { x: 760, y: 390 }],
  },

  // 3-2 portals. one is helpful. one has opinions.
  {
    name: "Portal Problems",
    hint: "Not all holes lead forward.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 300, h: 40 },
      { x: 660, y: GROUND, w: 300, h: 40 },
    ],
    spikes: [{ x: 300, y: 526, w: 360, h: 14, dir: "up" }],
    portals: [
      { ax: 240, ay: 436, bx: 700, by: 300, w: 34, h: 64, oneway: true },  // the lift
      { ax: 800, ay: 436, bx: 60,  by: 436, w: 34, h: 64, oneway: true },  // the troll: jump over it
    ],
    coins: [{ x: 730, y: 270 }, { x: 500, y: 480 }],
  },

  // 3-3 key quest with a fake checkpoint
  {
    name: "Keymaster",
    hint: "Checkpoints are a social construct.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0, y: GROUND, w: 960, h: 40 },
      { x: 560, y: 390, w: 90, h: 16 },    // key pedestal
    ],
    gates: [{ id: "lk", x: 770, y: 372, w: 24, h: 128, needKey: "k1" }],
    keys: [{ x: 600, y: 350, id: "k1" }],
    chasers: [
      { x: 920, y: 452, w: 34, h: 48, speed: 150, zone: { x: 520, y: 250, w: 180, h: 250 } },
    ],
    checkpoints: [
      { x: 300, y: GROUND, fake: true },
      { x: 690, y: GROUND },
    ],
    coins: [{ x: 470, y: 400 }, { x: 605, y: 260 }],
  },

  // 3-4 alternating belts, saws in the seams, weak knees in the middle
  {
    name: "Assembly Line",
    hint: "Keep up.",
    spawn: { x: 40, y: onGround() },
    door: { x: 880, y: doorY() },
    solids: [
      { x: 0,   y: GROUND, w: 140, h: 40 },
      { x: 820, y: GROUND, w: 140, h: 40 },
    ],
    conveyors: [
      { x: 140, y: GROUND, w: 220, h: 40, belt: -160 },
      { x: 420, y: GROUND, w: 220, h: 40, belt: 160 },
      { x: 700, y: GROUND, w: 120, h: 40, belt: -160 },
    ],
    spikes: [
      { x: 360, y: 526, w: 60, h: 14, dir: "up" },
      { x: 640, y: 526, w: 60, h: 14, dir: "up" },
    ],
    saws: [{ cx: 530, cy: 300, r: 24, cx2: 530, cy2: 430, speed: 130 }],
    jumpZones: [{ x: 420, y: 300, w: 220, h: 200, mult: 0.65, visible: true }],
    coins: [{ x: 250, y: 460 }, { x: 530, y: 470 }, { x: 760, y: 460 }],
  },

  // 3-5 crushers + lasers, checkpoint in the eye of the storm
  {
    name: "The Gauntlet",
    hint: "Half way is a real place.",
    spawn: { x: 40, y: onGround() },
    door: { x: 890, y: doorY() },
    solids: [
      { x: 0, y: GROUND, w: 960, h: 40 },
      { x: 0, y: 46, w: 960, h: 20 },
    ],
    fallers: [
      { x: 240, y: 66, w: 90, h: 110, deadly: true, zone: { x: 140, y: 0, w: 100, h: 540 } },
      { x: 560, y: 66, w: 90, h: 110, deadly: true, zone: { x: 460, y: 0, w: 100, h: 540 } },
    ],
    lasers: [
      { x: 430, y: 70, w: 8, h: 430, on: 0.7, off: 1.0, phase: 0.3 },
      { x: 760, y: 70, w: 8, h: 430, on: 0.7, off: 1.0, phase: 0.8 },
    ],
    checkpoints: [{ x: 500, y: GROUND }],
    coins: [{ x: 380, y: 460 }, { x: 700, y: 460 }],
  },

  // 3-6 grand finale: the exit lies, the floor burns, something chases you home
  {
    name: "Devil's Den",
    hint: "The way out is behind you.",
    spawn: { x: 40, y: onGround() },
    door: { x: 120, y: doorY(), hidden: true },
    fakeExits: [{ x: 760, y: doorY(), action: "flee" }],
    solids: [{ x: 0, y: GROUND, w: 960, h: 40 }],
    fires: [
      { x: 280, y: 474, w: 70 },
      { x: 650, y: 474, w: 70 },
    ],
    popspikes: [
      { x: 470, y: GROUND, w: 60, h: 40, dir: "up", zone: { x: 380, y: 380, w: 90, h: 160 } },
    ],
    chasers: [
      { x: 930, y: 452, w: 34, h: 48, speed: 175, zone: { x: 700, y: 300, w: 160, h: 240 } },
    ],
    stars: [{ x: 415, y: 400 }],
    coins: [{ x: 230, y: 460 }, { x: 600, y: 460 }, { x: 840, y: 430 }],
  },
]},
];

// flatten worlds -> LEVELS, stamping theme + world labels on each level
const LEVELS = [];
WORLDS.forEach((w, wi) => w.levels.forEach((l, li) => {
  l.theme = w.theme; l.world = wi + 1; l.wname = w.name; l.wlevel = li + 1;
  if (l.solidsExtra) { l.solids = l.solids.concat(l.solidsExtra); delete l.solidsExtra; }
  LEVELS.push(l);
}));

if (typeof module !== "undefined") module.exports = { LEVELS, WORLDS, THEMES };
