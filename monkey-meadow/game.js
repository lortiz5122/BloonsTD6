// =============================================================
// Monkey Meadow — BTD6 Recreation
// Browser-based tower defense, HTML5 Canvas, vanilla JS (ES2022)
// =============================================================

const W = 1280, H = 720;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Seeded RNG for deterministic decorations ---
class SeededRNG {
  constructor(seed = 42) { this.state = seed >>> 0; }
  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }
  range(min, max) { return min + this.next() * (max - min); }
}

// =============================================================
// Path — Monkey Meadow double-loop
// =============================================================
const PATH_WAYPOINTS = [
  { x: 0,    y: 320 },
  { x: 320,  y: 320 },
  { x: 320,  y: 140 },
  { x: 960,  y: 140 },
  { x: 960,  y: 400 },
  { x: 640,  y: 400 },
  { x: 640,  y: 580 },
  { x: 320,  y: 580 },
  { x: 320,  y: 720 },
];
const PATH_WIDTH = 80;
const PATH_HALF = PATH_WIDTH / 2;

// Cumulative segment distances for targeting priority
const PATH_SEG_LEN = [];
let PATH_TOTAL = 0;
for (let i = 0; i < PATH_WAYPOINTS.length - 1; i++) {
  const a = PATH_WAYPOINTS[i], b = PATH_WAYPOINTS[i + 1];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  PATH_SEG_LEN.push(d);
  PATH_TOTAL += d;
}

function buildPathPolygon(waypoints, halfWidth = PATH_HALF) {
  const left = [], right = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    left.push({ x: a.x + nx * halfWidth, y: a.y + ny * halfWidth });
    right.push({ x: a.x - nx * halfWidth, y: a.y - ny * halfWidth });
    if (i === waypoints.length - 2) {
      left.push({ x: b.x + nx * halfWidth, y: b.y + ny * halfWidth });
      right.push({ x: b.x - nx * halfWidth, y: b.y - ny * halfWidth });
    }
  }
  return [...left, ...right.reverse()];
}
const PATH_POLYGON = buildPathPolygon(PATH_WAYPOINTS, PATH_HALF);

// Swept collision: does segment (ax,ay)→(bx,by) pass within radius of circle (cx,cy)?
function segmentCircleHit(ax, ay, bx, by, cx, cy, radius) {
  return distPointToSegment(cx, cy, ax, ay, bx, by) < radius;
}

// distance from point to segment
function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function nearPath(x, y, margin) {
  for (let i = 0; i < PATH_WAYPOINTS.length - 1; i++) {
    if (distPointToSegment(x, y, PATH_WAYPOINTS[i].x, PATH_WAYPOINTS[i].y,
        PATH_WAYPOINTS[i + 1].x, PATH_WAYPOINTS[i + 1].y) < margin) return true;
  }
  return false;
}

// =============================================================
// Decorations
// =============================================================
const TREE_CLUSTERS = [
  { cx: 60,   cy: 60,   r: 65 },
  { cx: 1220, cy: 60,   r: 65 },
  { cx: 1220, cy: 660,  r: 65 },
];
const STONES = [
  { x: 800, y: 300, rx: 18, ry: 12 },
  { x: 180, y: 500, rx: 14, ry: 9  },
  { x: 500, y: 650, rx: 10, ry: 7  },
];

// Offscreen canvas for static scene (background, path, trees, flowers)
const staticCanvas = document.createElement('canvas');
staticCanvas.width = W; staticCanvas.height = H;
const sctx = staticCanvas.getContext('2d');

function drawStatic() {
  // --- Grass gradient background ---
  const bg = sctx.createRadialGradient(W * 0.35, H * 0.3, 80, W * 0.5, H * 0.5, W);
  bg.addColorStop(0, '#7bba4a');
  bg.addColorStop(0.55, '#5a9a3c');
  bg.addColorStop(1, '#3c6e28');
  sctx.fillStyle = bg;
  sctx.fillRect(0, 0, W, H);

  // Lighter patch (slope)
  sctx.fillStyle = 'rgba(130, 200, 90, 0.35)';
  sctx.beginPath();
  sctx.ellipse(W * 0.75, 120, 360, 180, 0, 0, Math.PI * 2);
  sctx.fill();

  // --- Grass texture noise (seeded dots) ---
  const rng = new SeededRNG(42);
  for (let i = 0; i < 900; i++) {
    const x = rng.range(0, W), y = rng.range(0, H);
    if (nearPath(x, y, PATH_HALF + 4)) continue;
    sctx.fillStyle = `rgba(${rng.range(30,80)|0}, ${rng.range(120,170)|0}, ${rng.range(40,80)|0}, 0.35)`;
    const r = rng.range(2, 6);
    sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fill();
  }

  // --- Enclosed grass islands (slightly darker tone for depth) ---
  sctx.fillStyle = 'rgba(40, 110, 40, 0.25)';
  roundRect(sctx, 340, 160, 600, 155, 24); sctx.fill();
  roundRect(sctx, 0, 420, 310, 145, 24); sctx.fill();

  // --- Path: shadow, fill, border, cobblestone tiles ---
  // Shadow
  sctx.save();
  sctx.translate(0, 6);
  sctx.fillStyle = 'rgba(0,0,0,0.35)';
  drawPathShape(sctx); sctx.fill();
  sctx.restore();

  // Base fill (tan gravel)
  const pathGrad = sctx.createLinearGradient(0, 0, 0, H);
  pathGrad.addColorStop(0, '#c6a574');
  pathGrad.addColorStop(1, '#a88654');
  sctx.fillStyle = pathGrad;
  drawPathShape(sctx); sctx.fill();

  // Darker border stroke
  sctx.strokeStyle = '#6d4e28';
  sctx.lineWidth = 6;
  sctx.lineJoin = 'round';
  sctx.lineCap = 'round';
  drawPathShape(sctx); sctx.stroke();

  // Inner light stroke
  sctx.strokeStyle = 'rgba(255, 230, 180, 0.22)';
  sctx.lineWidth = 2;
  drawPathShape(sctx); sctx.stroke();

  // Cobblestone dots for texture
  const crng = new SeededRNG(1337);
  for (let d = 0; d < PATH_TOTAL; d += 14) {
    const p = pointAtDistance(d);
    if (!p) continue;
    const offset = crng.range(-30, 30);
    const perp = perpAt(p.segIndex);
    const px = p.x + perp.x * offset;
    const py = p.y + perp.y * offset;
    const rr = crng.range(2.5, 4.5);
    sctx.fillStyle = `rgba(${crng.range(80,120)|0}, ${crng.range(60,90)|0}, ${crng.range(40,60)|0}, 0.55)`;
    sctx.beginPath(); sctx.arc(px, py, rr, 0, Math.PI * 2); sctx.fill();
  }

  // --- Flowers ---
  const frng = new SeededRNG(7);
  let white = 0, yellow = 0;
  while (white < 135 || yellow < 18) {
    const x = frng.range(8, W - 8), y = frng.range(8, H - 8);
    if (nearPath(x, y, PATH_HALF + 20)) continue;
    // Avoid trees
    let blocked = false;
    for (const t of TREE_CLUSTERS) if (Math.hypot(x - t.cx, y - t.cy) < t.r + 4) { blocked = true; break; }
    if (blocked) continue;
    if (yellow < 18 && frng.next() < 0.12) {
      drawFlower(sctx, x, y, '#f5d020'); yellow++;
    } else if (white < 135) {
      drawFlower(sctx, x, y, '#f5f5f0'); white++;
    }
  }

  // --- Stones ---
  for (const s of STONES) {
    sctx.fillStyle = 'rgba(0,0,0,0.4)';
    sctx.beginPath(); sctx.ellipse(s.x, s.y + 3, s.rx, s.ry, 0, 0, Math.PI * 2); sctx.fill();
    const g = sctx.createRadialGradient(s.x - s.rx * 0.3, s.y - s.ry * 0.4, 1, s.x, s.y, s.rx);
    g.addColorStop(0, '#cacaca'); g.addColorStop(1, '#7a7a7a');
    sctx.fillStyle = g;
    sctx.beginPath(); sctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2); sctx.fill();
  }

  // --- Tree clusters ---
  for (const t of TREE_CLUSTERS) drawTreeCluster(sctx, t.cx, t.cy);
}

function drawFlower(g, x, y, color) {
  const r = 3 + Math.random() * 1.5;
  // petals
  g.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    g.beginPath(); g.arc(x + Math.cos(ang) * r * 0.7, y + Math.sin(ang) * r * 0.7, r * 0.7, 0, Math.PI * 2); g.fill();
  }
  // center
  g.fillStyle = '#d97a0a';
  g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill();
}

function drawTreeCluster(g, cx, cy) {
  // Shadow blob
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.ellipse(cx + 4, cy + 48, 60, 14, 0, 0, Math.PI * 2); g.fill();

  const circles = [
    { x: cx - 28, y: cy + 10, r: 38 },
    { x: cx + 22, y: cy + 8,  r: 42 },
    { x: cx + 2,  y: cy - 22, r: 46 },
    { x: cx - 12, y: cy + 28, r: 32 },
    { x: cx + 28, y: cy - 8,  r: 34 },
  ];
  // Dark base
  g.fillStyle = '#1e4a14';
  for (const c of circles) { g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fill(); }
  // Medium leaves
  g.fillStyle = '#2d6a1e';
  for (const c of circles) { g.beginPath(); g.arc(c.x - 3, c.y - 4, c.r * 0.82, 0, Math.PI * 2); g.fill(); }
  // Highlight
  g.fillStyle = '#4f9a38';
  for (const c of circles) { g.beginPath(); g.arc(c.x - 8, c.y - 10, c.r * 0.52, 0, Math.PI * 2); g.fill(); }
  // Specular
  g.fillStyle = 'rgba(180, 230, 120, 0.45)';
  for (const c of circles) { g.beginPath(); g.arc(c.x - 12, c.y - 16, c.r * 0.22, 0, Math.PI * 2); g.fill(); }
}

function drawPathShape(g) {
  g.beginPath();
  g.moveTo(PATH_POLYGON[0].x, PATH_POLYGON[0].y);
  for (let i = 1; i < PATH_POLYGON.length; i++) g.lineTo(PATH_POLYGON[i].x, PATH_POLYGON[i].y);
  g.closePath();
}

function pointAtDistance(d) {
  let acc = 0;
  for (let i = 0; i < PATH_SEG_LEN.length; i++) {
    if (acc + PATH_SEG_LEN[i] >= d) {
      const t = (d - acc) / PATH_SEG_LEN[i];
      const a = PATH_WAYPOINTS[i], b = PATH_WAYPOINTS[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, segIndex: i };
    }
    acc += PATH_SEG_LEN[i];
  }
  return null;
}

function segmentDirection(segIndex) {
  const a = PATH_WAYPOINTS[segIndex], b = PATH_WAYPOINTS[segIndex + 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return { dx: dx / len, dy: dy / len };
}

function bloonVelocity(b) {
  const segIndex = b.segIndex ?? 0;
  const dir = segmentDirection(segIndex);
  return { vx: dir.dx * b.speed, vy: dir.dy * b.speed };
}

// Predict future bloon position using current segment direction
function predictBloonPosition(b, t) {
  const v = bloonVelocity(b);
  return { x: b.x + v.vx * t, y: b.y + v.vy * t };
}
function perpAt(segIndex) {
  const a = PATH_WAYPOINTS[segIndex], b = PATH_WAYPOINTS[segIndex + 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return { x: -dy / len, y: dx / len };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

// =============================================================
// Bloons
// =============================================================
const BLOON_TYPES = {
  red:    { hp: 1,   speed: 180, color: '#e03030', rim: '#900a0a', children: [] },
  blue:   { hp: 1,   speed: 220, color: '#3060e0', rim: '#0a1a80', children: ['red'] },
  green:  { hp: 1,   speed: 260, color: '#30b040', rim: '#0a5020', children: ['blue'] },
  yellow: { hp: 1,   speed: 360, color: '#e0d020', rim: '#806a0a', children: ['green'] },
  pink:   { hp: 1,   speed: 440, color: '#f070c0', rim: '#a02060', children: ['yellow'] },
  moab:   { hp: 200, speed: 50,  color: '#3080d0', rim: '#0a3060', children: ['pink','pink','pink','pink'], moab: true },
};
const BLOON_STRENGTH = { red: 1, blue: 2, green: 3, yellow: 4, pink: 5, moab: 10 };

function createBloon(type, distanceTraveled = 0) {
  const t = BLOON_TYPES[type];
  const p = pointAtDistance(distanceTraveled) || { x: 0, y: 320, segIndex: 0 };
  return {
    type, hp: t.hp, maxHp: t.hp, speed: t.speed,
    distanceTraveled, x: p.x, y: p.y,
    wobble: Math.random() * Math.PI * 2,
    alive: true,
  };
}

// =============================================================
// Rounds
// =============================================================
const ROUNDS = [
  [{ type: 'red',   count: 20, spacing: 0.5 }],
  [{ type: 'red',   count: 30, spacing: 0.4 }],
  [{ type: 'blue',  count: 15, spacing: 0.6 }],
  [{ type: 'blue',  count: 25, spacing: 0.5 }],
  [{ type: 'red',   count: 20, spacing: 0.3 }, { type: 'blue', count: 15, spacing: 0.4 }],
  [{ type: 'green', count: 20, spacing: 0.6 }],
  [{ type: 'green', count: 30, spacing: 0.5 }],
  [{ type: 'blue',  count: 40, spacing: 0.3 }],
  [{ type: 'green', count: 25, spacing: 0.4 }, { type: 'blue', count: 20, spacing: 0.5 }],
  [{ type: 'yellow',count: 20, spacing: 0.5 }],
  [{ type: 'yellow',count: 30, spacing: 0.4 }],
  [{ type: 'green', count: 50, spacing: 0.2 }],
  [{ type: 'yellow',count: 25, spacing: 0.3 }, { type: 'green', count: 20, spacing: 0.4 }],
  [{ type: 'pink',  count: 15, spacing: 0.6 }],
  [{ type: 'pink',  count: 25, spacing: 0.4 }],
  [{ type: 'yellow',count: 40, spacing: 0.2 }, { type: 'pink', count: 15, spacing: 0.4 }],
  [{ type: 'pink',  count: 35, spacing: 0.3 }],
  [{ type: 'pink',  count: 25, spacing: 0.3 }, { type: 'yellow', count: 30, spacing: 0.3 }],
  [{ type: 'pink',  count: 50, spacing: 0.2 }],
  [{ type: 'moab',  count: 1,  spacing: 0   }],
];

// =============================================================
// Towers
// =============================================================
const TOWER_TYPES = {
  dart: { cost: 200, range: 180, attackSpeed: 1.0, damage: 1, name: 'Dart Monkey', hotkey: 'Q' },
  tack: { cost: 360, range: 120, attackSpeed: 0.9, damage: 1, name: 'Tack Shooter', hotkey: 'W' },
  bomb: { cost: 650, range: 200, attackSpeed: 0.5, damage: 1, name: 'Bomb Shooter', hotkey: 'E', aoe: 40 },
};
const BANDANA_COLORS = ['#e03030', '#30b040', '#3060e0', '#9030e0'];
const BANDANA_NAMES = ['Red', 'Green', 'Blue', 'Purple'];
const TARGETING_MODES = ['first', 'last', 'close', 'strong'];

function createTower(type, x, y) {
  const t = TOWER_TYPES[type];
  return {
    type, x, y, range: t.range,
    attackSpeed: t.attackSpeed, attackCooldown: 0,
    damage: t.damage, aoe: t.aoe || 0,
    targeting: 'first', totalPops: 0,
    cost: t.cost, bandana: 0, // index into BANDANA_COLORS (dart only)
    angle: -Math.PI / 2, // facing dir for rendering
  };
}

// =============================================================
// Game State
// =============================================================
const GS = {
  lives: 150, cash: 500, round: 0,
  state: 'idle', // idle | spawning | active | round_over | game_over | victory
  bloons: [], towers: [], projectiles: [], effects: [],
  selectedTowerType: null,
  selectedTower: null,
  placeGhost: null,
  spawnQueue: [],
  spawnTimer: 0,
  speed: 1,
  paused: true,   // paused while tutorial shown
  roundOverTimer: 0,
  endScreenTimer: 0,
  endScreenShown: false,
  hoverCanvas: { x: 0, y: 0, active: false },
  victoryAnim: null,
  bonusFlash: null,
};

// =============================================================
// Spawning
// =============================================================
function startRound() {
  if (GS.state !== 'idle') return;
  if (GS.round >= 20) return;
  GS.round++;
  const def = ROUNDS[GS.round - 1];
  GS.spawnQueue = [];
  let globalTime = 0;
  // Groups play sequentially; each group's bloons spaced within the group
  for (const grp of def) {
    for (let i = 0; i < grp.count; i++) {
      GS.spawnQueue.push({ type: grp.type, at: globalTime + i * grp.spacing });
    }
    globalTime += grp.count * grp.spacing + 0.5;
  }
  GS.spawnTimer = 0;
  GS.state = 'spawning';
  updateHUD();
}

// =============================================================
// Targeting / Combat
// =============================================================
function pickTarget(tower) {
  const inRange = [];
  for (const b of GS.bloons) {
    if (!b.alive) continue;
    if (Math.hypot(b.x - tower.x, b.y - tower.y) <= tower.range) inRange.push(b);
  }
  if (inRange.length === 0) return null;
  switch (tower.targeting) {
    case 'first': return inRange.reduce((a, b) => a.distanceTraveled > b.distanceTraveled ? a : b);
    case 'last':  return inRange.reduce((a, b) => a.distanceTraveled < b.distanceTraveled ? a : b);
    case 'close': return inRange.reduce((a, b) =>
      Math.hypot(a.x - tower.x, a.y - tower.y) < Math.hypot(b.x - tower.x, b.y - tower.y) ? a : b);
    case 'strong': return inRange.reduce((a, b) =>
      BLOON_STRENGTH[a.type] > BLOON_STRENGTH[b.type] ? a :
      BLOON_STRENGTH[a.type] < BLOON_STRENGTH[b.type] ? b :
      a.distanceTraveled > b.distanceTraveled ? a : b);
  }
  return inRange[0];
}

function fireTower(tower, dt) {
  tower.attackCooldown -= dt;
  if (tower.attackCooldown > 0) return;

  if (tower.type === 'dart') {
    const target = pickTarget(tower);
    if (!target) return;
    // Lead the target: predict where bloon will be when dart arrives
    const dartSpeed = 650;
    const dist = Math.hypot(target.x - tower.x, target.y - tower.y);
    const flightTime = dist / dartSpeed;
    const lead = predictBloonPosition(target, flightTime);
    const dx = lead.x - tower.x, dy = lead.y - tower.y;
    const ang = Math.atan2(dy, dx);
    tower.angle = ang;
    GS.projectiles.push({
      type: 'dart', x: tower.x, y: tower.y,
      vx: Math.cos(ang) * dartSpeed, vy: Math.sin(ang) * dartSpeed,
      damage: tower.damage, range: tower.range + 40, traveled: 0,
      ownerId: tower, angle: ang,
    });
    tower.attackCooldown = 1 / tower.attackSpeed;
  }
  else if (tower.type === 'tack') {
    // Need at least one bloon in range
    const target = pickTarget(tower);
    if (!target) return;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      GS.projectiles.push({
        type: 'tack', x: tower.x, y: tower.y,
        vx: Math.cos(ang) * 600, vy: Math.sin(ang) * 600,
        damage: tower.damage, range: 120, traveled: 0,
        ownerId: tower, angle: ang,
      });
    }
    tower.attackCooldown = 1 / tower.attackSpeed;
  }
  else if (tower.type === 'bomb') {
    const target = pickTarget(tower);
    if (!target) return;
    const bombSpeed = 400;
    const dist = Math.hypot(target.x - tower.x, target.y - tower.y);
    const flightTime = dist / bombSpeed;
    const lead = predictBloonPosition(target, flightTime);
    const dx = lead.x - tower.x, dy = lead.y - tower.y;
    const ang = Math.atan2(dy, dx);
    tower.angle = ang;
    GS.projectiles.push({
      type: 'bomb', x: tower.x, y: tower.y,
      vx: Math.cos(ang) * bombSpeed, vy: Math.sin(ang) * bombSpeed,
      damage: tower.damage, aoe: tower.aoe,
      targetX: lead.x, targetY: lead.y,
      ownerId: tower, angle: ang,
    });
    tower.attackCooldown = 1 / tower.attackSpeed;
  }
}

function damageBloon(b, dmg, owner) {
  if (!b.alive) return;
  const dealt = Math.min(b.hp, dmg);
  b.hp -= dealt;
  if (owner) { owner.totalPops += dealt; }
  GS.cash += dealt; // $1 per HP removed (same for MOABs)
  if (b.hp <= 0) {
    b.alive = false;
    popBloon(b);
  }
}

function popBloon(b) {
  const t = BLOON_TYPES[b.type];
  // Balloon Heart pop effect (Fortnite collab reaction emote cue)
  GS.effects.push({ kind: 'heart', x: b.x, y: b.y, t: 0 });
  // Small particle burst
  for (let i = 0; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 80;
    GS.effects.push({
      kind: 'particle', x: b.x, y: b.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      color: t.color, t: 0, life: 0.4,
    });
  }
  for (const childType of t.children) {
    const p = pointAtDistance(b.distanceTraveled);
    if (!p) continue;
    const child = createBloon(childType, b.distanceTraveled);
    GS.bloons.push(child);
  }
}

// =============================================================
// Input
// =============================================================
function canvasCoords(ev) {
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * W;
  const y = ((ev.clientY - r.top) / r.height) * H;
  return { x, y };
}

canvas.addEventListener('mousemove', (ev) => {
  const { x, y } = canvasCoords(ev);
  GS.hoverCanvas = { x, y, active: true };
  if (GS.selectedTowerType) {
    GS.placeGhost = { x, y, valid: isValidPlacement(x, y, GS.selectedTowerType) };
  }
});
canvas.addEventListener('mouseleave', () => {
  GS.hoverCanvas.active = false;
  GS.placeGhost = null;
});

canvas.addEventListener('mousedown', (ev) => {
  ev.preventDefault();
  const { x, y } = canvasCoords(ev);

  if (ev.button === 2) { // right click cancels placement
    GS.selectedTowerType = null;
    GS.placeGhost = null;
    updateTowerCardSelection();
    return;
  }
  if (ev.button !== 0) return;

  // Placement mode
  if (GS.selectedTowerType) {
    const type = GS.selectedTowerType;
    const cost = TOWER_TYPES[type].cost;
    if (GS.cash < cost) {
      flashCash();
      GS.selectedTowerType = null;
      GS.placeGhost = null;
      updateTowerCardSelection();
      return;
    }
    if (!isValidPlacement(x, y, type)) return;
    const tower = createTower(type, x, y);
    GS.towers.push(tower);
    GS.cash -= cost;
    GS.selectedTowerType = null;
    GS.placeGhost = null;
    GS.selectedTower = tower;
    updateTowerCardSelection();
    updateHUD();
    return;
  }

  // Select existing tower
  let clicked = null;
  for (const t of GS.towers) {
    if (Math.hypot(x - t.x, y - t.y) < 30) { clicked = t; break; }
  }
  GS.selectedTower = clicked;
  updateHUD();
});

canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

document.addEventListener('keydown', (ev) => {
  const key = ev.key.toLowerCase();

  // Tutorial skip
  if (!document.getElementById('tutorial').classList.contains('hidden')) {
    if (key === 'escape' || key === ' ' || key === 'enter') {
      hideTutorial();
      ev.preventDefault();
      return;
    }
  }

  // End screen
  if (!document.getElementById('endScreen').classList.contains('hidden')) {
    if (key === 'enter' || key === ' ') { location.reload(); }
    return;
  }

  if (key === 'q') { trySelectTowerType('dart'); }
  else if (key === 'w') { trySelectTowerType('tack'); }
  else if (key === 'e') { trySelectTowerType('bomb'); }
  else if (key === 'escape') {
    GS.selectedTowerType = null;
    GS.placeGhost = null;
    GS.selectedTower = null;
    updateTowerCardSelection();
    updateHUD();
  }
  else if (key === ' ') { ev.preventDefault(); if (GS.state === 'idle') startRound(); }
  else if (key === 'tab') { ev.preventDefault(); toggleSpeed(); }
});

function isValidPlacement(x, y, type) {
  if (x < 20 || x > W - 20 || y < 20 || y > H - 20) return false;
  // 8-sample point-in-path check
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const sx = x + Math.cos(ang) * 30;
    const sy = y + Math.sin(ang) * 30;
    if (nearPath(sx, sy, PATH_HALF - 2)) return false;
  }
  if (nearPath(x, y, PATH_HALF + 10)) return false;
  for (const t of TREE_CLUSTERS) if (Math.hypot(x - t.cx, y - t.cy) < t.r + 6) return false;
  for (const t of GS.towers) if (Math.hypot(x - t.x, y - t.y) < 62) return false;
  return true;
}

function trySelectTowerType(type) {
  if (GS.state === 'game_over' || GS.state === 'victory') return;
  if (GS.cash < TOWER_TYPES[type].cost) { flashCash(); return; }
  GS.selectedTowerType = type;
  GS.selectedTower = null;
  updateTowerCardSelection();
  updateHUD();
}

function flashCash() {
  const el = document.getElementById('cashStat');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// =============================================================
// HUD
// =============================================================
const livesEl = document.getElementById('livesValue');
const cashEl = document.getElementById('cashValue');
const roundEl = document.getElementById('roundValue');
const startBtn = document.getElementById('startBtn');
const speedBtn = document.getElementById('speedBtn');
const selPanel = document.getElementById('selectedPanel');
const selNameEl = document.getElementById('selName');
const selPopsEl = document.getElementById('selPops');
const selRangeEl = document.getElementById('selRange');
const targetBtn = document.getElementById('targetBtn');
const styleBtn = document.getElementById('styleBtn');
const sellBtn = document.getElementById('sellBtn');

function updateHUD() {
  livesEl.textContent = GS.lives;
  cashEl.textContent = Math.floor(GS.cash);
  roundEl.textContent = GS.round;

  // Tower cards
  for (const card of document.querySelectorAll('.tower-card')) {
    const type = card.dataset.tower;
    const cost = TOWER_TYPES[type].cost;
    card.classList.toggle('unaffordable', GS.cash < cost);
  }

  startBtn.disabled = GS.state !== 'idle' || GS.round >= 20;
  startBtn.textContent = GS.round >= 20 ? 'All Rounds Done' :
    (GS.state === 'idle' ? `Start Round ${GS.round + 1}` : 'Round in progress…');

  // Selected tower panel
  if (GS.selectedTower) {
    const t = GS.selectedTower;
    const info = TOWER_TYPES[t.type];
    selPanel.classList.remove('hidden');
    selNameEl.textContent = info.name;
    selPopsEl.textContent = t.totalPops;
    selRangeEl.textContent = Math.round(t.range);
    targetBtn.textContent = `Targeting: ${cap(t.targeting)}`;
    if (t.type === 'dart') {
      styleBtn.classList.remove('hidden');
      styleBtn.textContent = `Bandana: ${BANDANA_NAMES[t.bandana]}`;
      styleBtn.style.background = `linear-gradient(180deg, ${BANDANA_COLORS[t.bandana]}, rgba(0,0,0,0.4))`;
    } else {
      styleBtn.classList.add('hidden');
    }
    sellBtn.textContent = `Sell ($${Math.floor(t.cost * 0.7)})`;
  } else {
    selPanel.classList.add('hidden');
  }
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

startBtn.addEventListener('click', () => { if (GS.state === 'idle') startRound(); });
speedBtn.addEventListener('click', () => toggleSpeed());
function toggleSpeed() {
  GS.speed = GS.speed === 1 ? 2 : 1;
  speedBtn.textContent = `${GS.speed}× (Tab)`;
}

for (const card of document.querySelectorAll('.tower-card')) {
  card.addEventListener('click', () => { trySelectTowerType(card.dataset.tower); });
}
function updateTowerCardSelection() {
  for (const card of document.querySelectorAll('.tower-card')) {
    card.classList.toggle('selected', card.dataset.tower === GS.selectedTowerType);
  }
}

targetBtn.addEventListener('click', () => {
  if (!GS.selectedTower) return;
  const idx = TARGETING_MODES.indexOf(GS.selectedTower.targeting);
  GS.selectedTower.targeting = TARGETING_MODES[(idx + 1) % TARGETING_MODES.length];
  updateHUD();
});
styleBtn.addEventListener('click', () => {
  if (!GS.selectedTower || GS.selectedTower.type !== 'dart') return;
  GS.selectedTower.bandana = (GS.selectedTower.bandana + 1) % BANDANA_COLORS.length;
  updateHUD();
});
sellBtn.addEventListener('click', () => {
  if (!GS.selectedTower) return;
  GS.cash += Math.floor(GS.selectedTower.cost * 0.7);
  GS.towers = GS.towers.filter(t => t !== GS.selectedTower);
  GS.selectedTower = null;
  updateHUD();
});

// =============================================================
// Tutorial
// =============================================================
const tutorialEl = document.getElementById('tutorial');
document.getElementById('tutorialStart').addEventListener('click', hideTutorial);
function hideTutorial() {
  tutorialEl.classList.add('hidden');
  GS.paused = false;
}

// =============================================================
// End Screen
// =============================================================
const endScreen = document.getElementById('endScreen');
const endTitle = document.getElementById('endTitle');
const endSub = document.getElementById('endSubtitle');
const endBtn = document.getElementById('endButton');
endBtn.addEventListener('click', () => location.reload());
function showEndScreen() {
  if (GS.endScreenShown) return;
  GS.endScreenShown = true;
  const card = endScreen.querySelector('.end-card');
  if (GS.state === 'victory') {
    card.classList.add('victory');
    card.classList.remove('gameover');
    endTitle.textContent = 'VICTORY!';
    endSub.textContent = 'Monkey Meadow cleared!';
    endBtn.textContent = 'Play Again';
  } else {
    card.classList.add('gameover');
    card.classList.remove('victory');
    endTitle.textContent = 'GAME OVER';
    endSub.textContent = `Survived to Round ${GS.round}`;
    endBtn.textContent = 'Try Again';
  }
  endScreen.classList.remove('hidden');
}

// =============================================================
// Game Loop
// =============================================================
let lastTime = performance.now();
function loop(now) {
  const rawDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  const dt = GS.paused ? 0 : rawDt * GS.speed;

  if (!GS.paused) update(dt);
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  // --- Spawning ---
  if (GS.state === 'spawning') {
    GS.spawnTimer += dt;
    while (GS.spawnQueue.length && GS.spawnQueue[0].at <= GS.spawnTimer) {
      const ev = GS.spawnQueue.shift();
      GS.bloons.push(createBloon(ev.type, 0));
    }
    if (GS.spawnQueue.length === 0) GS.state = 'active';
  }

  // --- Bloons move along path ---
  for (const b of GS.bloons) {
    if (!b.alive) continue;
    b.distanceTraveled += b.speed * dt;
    b.wobble += dt * 3;
    if (b.distanceTraveled >= PATH_TOTAL) {
      // Exit: subtract lives = remaining HP (or 1 for standard)
      const life = BLOON_TYPES[b.type].moab ? b.hp : 1;
      GS.lives -= life;
      b.alive = false;
      if (GS.lives <= 0) {
        GS.lives = 0;
        GS.state = 'game_over';
        GS.endScreenTimer = 0;
      }
    } else {
      const p = pointAtDistance(b.distanceTraveled);
      b.x = p.x; b.y = p.y; b.segIndex = p.segIndex;
    }
  }
  GS.bloons = GS.bloons.filter(b => b.alive);

  // --- Towers fire ---
  for (const t of GS.towers) fireTower(t, dt);

  // --- Projectiles ---
  for (const p of GS.projectiles) {
    const prevX = p.x, prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled = (p.traveled || 0) + Math.hypot(p.vx, p.vy) * dt;

    if (p.type === 'bomb') {
      const reachedTarget = Math.hypot(p.x - p.targetX, p.y - p.targetY) < 14;
      let hit = null;
      for (const b of GS.bloons) {
        if (!b.alive) continue;
        if (segmentCircleHit(prevX, prevY, p.x, p.y, b.x, b.y, 20)) { hit = b; break; }
      }
      if (hit || reachedTarget) {
        for (const b of GS.bloons) {
          if (!b.alive) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) <= p.aoe + 18) damageBloon(b, p.damage, p.ownerId);
        }
        GS.effects.push({ kind: 'explosion', x: p.x, y: p.y, r: 0, maxR: p.aoe, t: 0, life: 0.25 });
        p.dead = true;
      }
      if (p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) p.dead = true;
    } else if (p.type === 'dart') {
      if (p.traveled > p.range) { p.dead = true; continue; }
      for (const b of GS.bloons) {
        if (!b.alive) continue;
        if (segmentCircleHit(prevX, prevY, p.x, p.y, b.x, b.y, 22)) {
          damageBloon(b, p.damage, p.ownerId);
          p.dead = true;
          break;
        }
      }
    } else if (p.type === 'tack') {
      if (p.traveled > p.range) { p.dead = true; continue; }
      for (const b of GS.bloons) {
        if (!b.alive) continue;
        if (segmentCircleHit(prevX, prevY, p.x, p.y, b.x, b.y, 20)) {
          damageBloon(b, p.damage, p.ownerId);
          p.dead = true;
          break;
        }
      }
    }
  }
  GS.projectiles = GS.projectiles.filter(p => !p.dead);

  // --- Effects ---
  for (const e of GS.effects) {
    e.t += dt;
    if (e.kind === 'particle') {
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vx *= 0.9; e.vy *= 0.9;
    }
    if (e.kind === 'explosion') { e.r = e.maxR * (e.t / e.life); }
  }
  GS.effects = GS.effects.filter(e => {
    if (e.kind === 'heart') return e.t < 0.5;
    if (e.kind === 'particle') return e.t < e.life;
    if (e.kind === 'explosion') return e.t < e.life;
    if (e.kind === 'bonus') return e.t < 1.6;
    if (e.kind === 'balloonPopper') return e.t < 4;
    return true;
  });

  // --- Round over / Game over / Victory ---
  if (GS.state === 'active' && GS.bloons.length === 0) {
    GS.state = 'round_over';
    GS.roundOverTimer = 0;
    const bonus = 100 + GS.round * 10;
    GS.cash += bonus;
    GS.effects.push({ kind: 'bonus', text: `+$${bonus}`, t: 0 });
    if (GS.round >= 20) {
      GS.state = 'victory';
      GS.endScreenTimer = 0;
      triggerBalloonPopper();
    }
  }
  if (GS.state === 'round_over') {
    GS.roundOverTimer += dt;
    if (GS.roundOverTimer > 1.0) GS.state = 'idle';
  }

  if (GS.state === 'game_over' || GS.state === 'victory') {
    GS.endScreenTimer += dt;
    if (GS.endScreenTimer > 1.5 && !GS.endScreenShown) showEndScreen();
  }

  updateHUD();
}

function triggerBalloonPopper() {
  GS.effects.push({ kind: 'balloonPopper', t: 0 });
}

// =============================================================
// Rendering
// =============================================================
function render() {
  // Static scene
  ctx.drawImage(staticCanvas, 0, 0);

  // Range circle preview for selected/hovered
  if (GS.selectedTower) drawRangeCircle(GS.selectedTower.x, GS.selectedTower.y, GS.selectedTower.range, 'rgba(255,255,255,0.18)');

  if (GS.selectedTowerType && GS.placeGhost) {
    drawRangeCircle(GS.placeGhost.x, GS.placeGhost.y, TOWER_TYPES[GS.selectedTowerType].range,
      GS.placeGhost.valid ? 'rgba(80,255,80,0.18)' : 'rgba(255,60,60,0.25)');
  }

  // Towers
  for (const t of GS.towers) drawTower(ctx, t, t === GS.selectedTower);

  // Projectiles
  for (const p of GS.projectiles) drawProjectile(ctx, p);

  // Bloons — sort by distanceTraveled desc so frontmost is on top
  const sorted = GS.bloons.slice().sort((a, b) => b.distanceTraveled - a.distanceTraveled);
  for (const b of sorted) drawBloon(ctx, b);

  // Effects
  for (const e of GS.effects) drawEffect(ctx, e);

  // Place ghost icon
  if (GS.selectedTowerType && GS.placeGhost) drawGhost(ctx, GS.selectedTowerType, GS.placeGhost);

  // Wave progress / state banner
  drawStatusBanner(ctx);

  // Bonus flash
  const bonus = GS.effects.find(e => e.kind === 'bonus');
  if (bonus) drawBonusFlash(ctx, bonus);

  // Balloon popper victory animation
  const bp = GS.effects.find(e => e.kind === 'balloonPopper');
  if (bp) drawBalloonPopper(ctx, bp);
}

function drawRangeCircle(x, y, r, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawBloon(g, b) {
  const t = BLOON_TYPES[b.type];
  const wob = Math.sin(b.wobble) * 2;

  if (t.moab) {
    // --- MOAB: blimp shape ---
    g.save();
    g.translate(b.x, b.y + wob);
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(3, 40, 52, 10, 0, 0, Math.PI * 2); g.fill();
    // body gradient
    const mg = g.createRadialGradient(-8, -12, 2, 0, 0, 60);
    mg.addColorStop(0, '#6aa8e8');
    mg.addColorStop(0.5, '#3080d0');
    mg.addColorStop(1, '#0a3a70');
    g.fillStyle = mg;
    g.beginPath(); g.ellipse(0, 0, 55, 32, 0, 0, Math.PI * 2); g.fill();
    // darker rim
    g.strokeStyle = t.rim; g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, 0, 55, 32, 0, 0, Math.PI * 2); g.stroke();
    // highlight
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(-20, -14, 18, 8, -0.3, 0, Math.PI * 2); g.fill();
    // fins
    g.fillStyle = '#1a4a80';
    g.beginPath(); g.moveTo(40, -10); g.lineTo(58, -22); g.lineTo(50, -4); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(40, 10); g.lineTo(58, 22); g.lineTo(50, 4); g.closePath(); g.fill();
    // nose
    g.fillStyle = '#c8d8e8';
    g.beginPath(); g.arc(-48, 0, 7, 0, Math.PI * 2); g.fill();
    // MOAB text
    g.fillStyle = '#ffe680';
    g.font = 'bold 14px "Trebuchet MS"';
    g.textAlign = 'center';
    g.fillText('M.O.A.B.', 0, 4);
    g.restore();

    // HP bar
    const pct = b.hp / b.maxHp;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(b.x - 40, b.y - 44, 80, 6);
    g.fillStyle = pct > 0.5 ? '#4bc84a' : pct > 0.25 ? '#ffb428' : '#e04a4a';
    g.fillRect(b.x - 38, b.y - 43, 76 * pct, 4);
  } else {
    // --- Standard Bloon ---
    const r = 18;
    g.save();
    g.translate(b.x, b.y + wob);

    // shadow
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(2, 26, r * 0.9, 4, 0, 0, Math.PI * 2); g.fill();

    // string
    g.strokeStyle = 'rgba(30,30,30,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, r - 1); g.quadraticCurveTo(3, r + 10, 0, r + 22); g.stroke();

    // body (radial gradient for 3D)
    const bg = g.createRadialGradient(-6, -8, 2, 0, 0, r * 1.2);
    bg.addColorStop(0, lighten(t.color, 0.55));
    bg.addColorStop(0.55, t.color);
    bg.addColorStop(1, darken(t.color, 0.35));
    g.fillStyle = bg;
    g.beginPath(); g.ellipse(0, 0, r - 1, r + 1, 0, 0, Math.PI * 2); g.fill();

    // rim
    g.strokeStyle = t.rim; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(0, 0, r - 1, r + 1, 0, 0, Math.PI * 2); g.stroke();

    // highlight
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.ellipse(-6, -8, 5, 8, -0.3, 0, Math.PI * 2); g.fill();

    // knot
    g.fillStyle = t.rim;
    g.beginPath(); g.moveTo(-3, r - 1); g.lineTo(3, r - 1); g.lineTo(0, r + 4); g.closePath(); g.fill();

    g.restore();
  }
}

function drawTower(g, t, selected) {
  const cfg = TOWER_TYPES[t.type];
  g.save();
  g.translate(t.x, t.y);

  // Ground shadow
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.ellipse(3, 26, 22, 6, 0, 0, Math.PI * 2); g.fill();

  // Base pad (dirt circle)
  const padG = g.createRadialGradient(-4, -4, 2, 0, 0, 28);
  padG.addColorStop(0, '#8b6a3a'); padG.addColorStop(1, '#3a2a16');
  g.fillStyle = padG;
  g.beginPath(); g.arc(0, 0, 28, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1c10'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 28, 0, Math.PI * 2); g.stroke();

  // Selection ring
  if (selected) {
    g.strokeStyle = '#ffd94a'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 32, 0, Math.PI * 2); g.stroke();
  }

  if (t.type === 'dart') {
    drawDartMonkey(g, t);
  } else if (t.type === 'tack') {
    drawTackShooter(g, t);
  } else if (t.type === 'bomb') {
    drawBombShooter(g, t);
  }

  g.restore();
}

function drawDartMonkey(g, t) {
  const angle = t.angle || 0;

  // Body (brown, facing toward angle)
  g.save();
  g.rotate(angle);

  // Body (circle)
  const bodyG = g.createRadialGradient(-5, -6, 2, 0, 0, 20);
  bodyG.addColorStop(0, '#d4a070');
  bodyG.addColorStop(0.7, '#a0703a');
  bodyG.addColorStop(1, '#5a3a1a');
  g.fillStyle = bodyG;
  g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1a08'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.stroke();

  // Face (lighter belly oval)
  g.fillStyle = '#f2d8b0';
  g.beginPath(); g.ellipse(6, 0, 11, 9, 0, 0, Math.PI * 2); g.fill();

  // Eyes (two white dots)
  g.fillStyle = 'white';
  g.beginPath(); g.arc(4, -5, 3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(4, 5, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'black';
  g.beginPath(); g.arc(5, -5, 1.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(5, 5, 1.4, 0, Math.PI * 2); g.fill();

  // Ears
  g.fillStyle = '#a0703a';
  g.beginPath(); g.arc(-12, -12, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(-12, 12, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8c098';
  g.beginPath(); g.arc(-12, -12, 2.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(-12, 12, 2.5, 0, Math.PI * 2); g.fill();

  // Bandana (Fortnite collab edit styles)
  const bandanaColor = BANDANA_COLORS[t.bandana];
  g.fillStyle = bandanaColor;
  g.beginPath();
  g.moveTo(-14, -6); g.quadraticCurveTo(0, -22, 14, -6);
  g.lineTo(12, -2); g.quadraticCurveTo(0, -14, -12, -2);
  g.closePath();
  g.fill();
  g.strokeStyle = darken(bandanaColor, 0.4); g.lineWidth = 1;
  g.stroke();
  // Bandana knot
  g.fillStyle = bandanaColor;
  g.beginPath(); g.arc(-14, -10, 3, 0, Math.PI * 2); g.fill();

  // Dart (white shaft + tip) extending forward
  g.strokeStyle = 'white'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(12, -2); g.lineTo(26, -2); g.stroke();
  g.beginPath(); g.moveTo(12, 2); g.lineTo(26, 2); g.stroke();
  g.fillStyle = '#2a2a2a';
  g.beginPath(); g.moveTo(26, -3); g.lineTo(30, 0); g.lineTo(26, 3); g.closePath(); g.fill();
  g.fillStyle = bandanaColor;
  g.beginPath(); g.moveTo(10, -4); g.lineTo(14, 0); g.lineTo(10, 4); g.closePath(); g.fill();

  g.restore();
}

function drawTackShooter(g, t) {
  // Rotating base square
  g.save();
  g.rotate((performance.now() / 2000) % (Math.PI * 2));

  // 8 spokes
  for (let i = 0; i < 8; i++) {
    g.save();
    g.rotate((i / 8) * Math.PI * 2);
    g.fillStyle = '#3a2a18';
    g.fillRect(4, -1.5, 14, 3);
    g.fillStyle = '#c8c8c8';
    g.beginPath(); g.moveTo(18, 0); g.lineTo(22, -3); g.lineTo(22, 3); g.closePath(); g.fill();
    g.restore();
  }

  // Center square (gray gun body)
  const sqG = g.createRadialGradient(-4, -4, 2, 0, 0, 20);
  sqG.addColorStop(0, '#b0b0b0'); sqG.addColorStop(1, '#505050');
  g.fillStyle = sqG;
  g.fillRect(-14, -14, 28, 28);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 2;
  g.strokeRect(-14, -14, 28, 28);

  // Center bolt
  g.fillStyle = '#ffd94a';
  g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#806a0a'; g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.stroke();

  g.restore();
}

function drawBombShooter(g, t) {
  const angle = t.angle || 0;
  g.save();
  g.rotate(angle);

  // Cannon base
  const bg = g.createRadialGradient(-5, -5, 2, 0, 0, 22);
  bg.addColorStop(0, '#606060'); bg.addColorStop(1, '#1a1a1a');
  g.fillStyle = bg;
  g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.stroke();

  // Barrel
  g.fillStyle = '#2a2a2a';
  g.fillRect(0, -6, 24, 12);
  g.strokeStyle = '#000'; g.lineWidth = 2;
  g.strokeRect(0, -6, 24, 12);
  // Barrel rim
  g.fillStyle = '#0a0a0a';
  g.beginPath(); g.arc(24, 0, 6, -Math.PI / 2, Math.PI / 2); g.fill();

  // Fuse sparkle
  g.fillStyle = '#ff8800';
  g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe680';
  g.beginPath(); g.arc(0, 0, 2.5, 0, Math.PI * 2); g.fill();

  g.restore();
}

function drawProjectile(g, p) {
  if (p.type === 'dart') {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.angle);
    g.strokeStyle = '#eeeeee'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke();
    g.fillStyle = '#2a2a2a';
    g.beginPath(); g.moveTo(6, -2); g.lineTo(10, 0); g.lineTo(6, 2); g.closePath(); g.fill();
    g.restore();
  } else if (p.type === 'tack') {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.angle);
    g.strokeStyle = '#c0c0c0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke();
    g.restore();
  } else if (p.type === 'bomb') {
    g.fillStyle = '#000';
    g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff8800';
    g.beginPath(); g.arc(p.x - 3, p.y - 3, 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe680';
    g.beginPath(); g.arc(p.x - 3, p.y - 3, 1, 0, Math.PI * 2); g.fill();
  }
}

function drawEffect(g, e) {
  if (e.kind === 'particle') {
    const a = Math.max(0, 1 - e.t / e.life);
    g.fillStyle = withAlpha(e.color, a);
    g.beginPath(); g.arc(e.x, e.y, 3, 0, Math.PI * 2); g.fill();
  } else if (e.kind === 'explosion') {
    const a = Math.max(0, 1 - e.t / e.life);
    const gg = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
    gg.addColorStop(0, `rgba(255,220,120,${0.85 * a})`);
    gg.addColorStop(0.5, `rgba(255,136,0,${0.7 * a})`);
    gg.addColorStop(1, `rgba(180,60,0,0)`);
    g.fillStyle = gg;
    g.beginPath(); g.arc(e.x, e.y, e.r, 0, Math.PI * 2); g.fill();
  } else if (e.kind === 'heart') {
    const a = Math.max(0, 1 - e.t / 0.5);
    const y = e.y - e.t * 40;
    g.save();
    g.globalAlpha = a;
    drawHeart(g, e.x, y, 6);
    g.restore();
  }
}

function drawHeart(g, cx, cy, size) {
  g.fillStyle = '#ff4a80';
  g.beginPath();
  g.moveTo(cx, cy + size);
  g.bezierCurveTo(cx - size * 1.6, cy - size * 0.2, cx - size * 0.8, cy - size * 1.6, cx, cy - size * 0.5);
  g.bezierCurveTo(cx + size * 0.8, cy - size * 1.6, cx + size * 1.6, cy - size * 0.2, cx, cy + size);
  g.fill();
  g.strokeStyle = '#a01040'; g.lineWidth = 1; g.stroke();
  // tiny highlight dot
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.arc(cx - size * 0.4, cy - size * 0.5, size * 0.25, 0, Math.PI * 2); g.fill();
}

function drawGhost(g, type, ghost) {
  const dummy = createTower(type, ghost.x, ghost.y);
  g.save();
  g.globalAlpha = 0.75;
  drawTower(g, dummy, false);
  g.restore();
  if (!ghost.valid) {
    g.strokeStyle = '#ff3030'; g.lineWidth = 3;
    g.beginPath(); g.arc(ghost.x, ghost.y, 30, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(ghost.x - 20, ghost.y - 20); g.lineTo(ghost.x + 20, ghost.y + 20); g.stroke();
  }
}

function drawStatusBanner(g) {
  // Highest priority: placement hint when a tower type is selected
  if (GS.selectedTowerType) {
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 180);
    g.save();
    g.globalAlpha = pulse;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(W / 2 - 280, 16, 560, 52);
    g.strokeStyle = '#4bc84a'; g.lineWidth = 3;
    g.strokeRect(W / 2 - 280, 16, 560, 52);
    g.fillStyle = '#b7ffa0'; g.font = 'bold 22px "Trebuchet MS"';
    g.textAlign = 'center';
    g.fillText('CLICK A GRASS AREA TO PLACE YOUR TOWER', W / 2, 50);
    g.restore();
    return;
  }
  if (GS.state === 'idle' && GS.round === 0) {
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(W / 2 - 320, 16, 640, 72);
    g.strokeStyle = '#ffb428'; g.lineWidth = 2;
    g.strokeRect(W / 2 - 320, 16, 640, 72);
    g.fillStyle = '#ffe680'; g.font = 'bold 20px "Trebuchet MS"';
    g.textAlign = 'center';
    g.fillText('1. Pick a tower (Q/W/E)  →  2. Click grass to place  →  3. Press SPACE', W / 2, 44);
    g.fillStyle = '#c8e6a0'; g.font = 'italic 15px "Trebuchet MS"';
    g.fillText('Towers fire automatically — no aiming needed!', W / 2, 72);
    g.restore();
  } else if (GS.state === 'idle' && GS.round > 0) {
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(W / 2 - 200, 16, 400, 44);
    g.strokeStyle = '#ffb428'; g.lineWidth = 2;
    g.strokeRect(W / 2 - 200, 16, 400, 44);
    g.fillStyle = '#ffe680'; g.font = 'bold 20px "Trebuchet MS"';
    g.textAlign = 'center';
    g.fillText(`Press SPACE to start Round ${GS.round + 1}`, W / 2, 46);
    g.restore();
  } else if (GS.state === 'spawning' || GS.state === 'active') {
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(W / 2 - 100, 16, 200, 36);
    g.fillStyle = '#ffd94a'; g.font = 'bold 18px "Trebuchet MS"';
    g.textAlign = 'center';
    g.fillText(`ROUND ${GS.round}`, W / 2, 40);
    g.restore();
  }
}

function drawBonusFlash(g, e) {
  const a = e.t < 0.3 ? e.t / 0.3 : e.t > 1.2 ? Math.max(0, 1 - (e.t - 1.2) / 0.4) : 1;
  const y = 120 - e.t * 20;
  g.save();
  g.globalAlpha = a;
  g.fillStyle = '#ffd94a';
  g.strokeStyle = '#000'; g.lineWidth = 4;
  g.font = 'bold 42px "Trebuchet MS"';
  g.textAlign = 'center';
  g.strokeText(e.text, W / 2, y);
  g.fillText(e.text, W / 2, y);
  g.restore();
}

// --- Fortnite collab: Balloon Popper signature animation ---
function drawBalloonPopper(g, e) {
  // Darken
  g.fillStyle = `rgba(0,0,0,${Math.min(0.5, e.t * 0.5)})`;
  g.fillRect(0, 0, W, H);

  const colors = ['#e03030', '#3060e0', '#30b040', '#e0d020', '#f070c0'];
  const cx = W / 2, cy = H / 2;

  // 5 balloons in a row (popped sequentially)
  const popPerBalloon = 0.5; // seconds
  for (let i = 0; i < 5; i++) {
    const bx = cx - 120 + i * 60;
    const by = cy - 20;
    const popTime = 1 + i * popPerBalloon;
    if (e.t < popTime) {
      const bounce = Math.sin((e.t + i) * 6) * 4;
      // balloon
      g.save();
      g.translate(bx, by + bounce);
      const rg = g.createRadialGradient(-4, -6, 2, 0, 0, 24);
      rg.addColorStop(0, lighten(colors[i], 0.5));
      rg.addColorStop(1, darken(colors[i], 0.3));
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = darken(colors[i], 0.5); g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.ellipse(-5, -8, 4, 7, 0, 0, Math.PI * 2); g.fill();
      // string
      g.strokeStyle = '#444'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, 22); g.lineTo(-2, 50); g.stroke();
      g.restore();
    } else if (e.t < popTime + 0.4) {
      // pop burst
      const p = (e.t - popTime) / 0.4;
      g.save();
      g.globalAlpha = 1 - p;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        g.fillStyle = colors[i];
        g.beginPath(); g.arc(bx + Math.cos(ang) * p * 30, by + Math.sin(ang) * p * 30, 4, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
  }

  // Dart monkey on left throwing darts
  const monkeyX = cx - 200, monkeyY = cy - 20;
  g.save();
  g.translate(monkeyX, monkeyY);
  // body
  const bodyG = g.createRadialGradient(-5, -6, 2, 0, 0, 24);
  bodyG.addColorStop(0, '#d4a070'); bodyG.addColorStop(1, '#5a3a1a');
  g.fillStyle = bodyG;
  g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1a08'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke();
  // face
  g.fillStyle = '#f2d8b0';
  g.beginPath(); g.ellipse(6, 0, 13, 10, 0, 0, Math.PI * 2); g.fill();
  // eyes (happy squint)
  g.strokeStyle = 'black'; g.lineWidth = 2;
  g.beginPath(); g.arc(4, -5, 3, 0.3, Math.PI - 0.3); g.stroke();
  g.beginPath(); g.arc(4, 5, 3, 0.3, Math.PI - 0.3); g.stroke();
  // mouth (smile)
  g.beginPath(); g.arc(10, 0, 3, -Math.PI / 3, Math.PI / 3); g.stroke();
  // red bandana (hero look)
  g.fillStyle = '#e03030';
  g.beginPath();
  g.moveTo(-18, -8); g.quadraticCurveTo(0, -26, 18, -8);
  g.lineTo(14, -2); g.quadraticCurveTo(0, -16, -14, -2);
  g.closePath(); g.fill();
  g.restore();

  // Title text
  if (e.t > 2.5) {
    const a = Math.min(1, (e.t - 2.5) / 0.5);
    g.save();
    g.globalAlpha = a;
    g.fillStyle = '#ffd94a';
    g.strokeStyle = '#2a1a00'; g.lineWidth = 6;
    g.font = 'bold 52px "Trebuchet MS"';
    g.textAlign = 'center';
    g.strokeText('BALLOON POPPER!', W / 2, cy + 100);
    g.fillText('BALLOON POPPER!', W / 2, cy + 100);
    g.restore();
  }
}

// =============================================================
// Color helpers
// =============================================================
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
}
function lighten(hex, amt) {
  const c = hexToRgb(hex);
  return rgbToHex(c.r + (255 - c.r) * amt, c.g + (255 - c.g) * amt, c.b + (255 - c.b) * amt);
}
function darken(hex, amt) {
  const c = hexToRgb(hex);
  return rgbToHex(c.r * (1 - amt), c.g * (1 - amt), c.b * (1 - amt));
}
function withAlpha(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

// =============================================================
// Init
// =============================================================
drawStatic();
updateHUD();
requestAnimationFrame(loop);
