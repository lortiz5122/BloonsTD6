# BTD6 Monkey Meadow — Level Recreation Spec

## Project Overview

Recreate the **Monkey Meadow** map from Bloons TD 6 as a playable browser-based tower defense game level using **HTML5 Canvas + vanilla JavaScript** (no frameworks). The goal is a fully functional single-level game that faithfully reproduces the map layout, Bloon movement, tower placement, and core gameplay loop.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Renderer | HTML5 Canvas 2D | Native, no dependencies, precise control |
| Language | Vanilla JavaScript (ES2022 modules) | No build step needed |
| Styling | Plain CSS | Minimal UI chrome |
| Entry point | `index.html` | Single file to open in browser |
| Structure | `index.html`, `game.js`, `style.css` | Flat — no bundler |

---

## File Structure

```
monkey-meadow/
├── index.html        ← Shell, canvas mount, UI panels
├── style.css         ← Layout, HUD, button styles
├── game.js           ← All game logic (ES modules)
└── README.md         ← How to run
```

---

## Canvas Setup

- Canvas resolution: **1280 × 720** (16:9, fixed)
- CSS scales canvas to fill browser window while preserving aspect ratio
- All game coordinates are in a **1280×720 logical space** — no tile grid
- Game loop: `requestAnimationFrame` with fixed delta-time accumulator (target 60 fps)

---

## Monkey Meadow — Path Definition

The path is a single continuous route. Bloons enter from the left edge and exit at the bottom edge. Coordinates below are in the 1280×720 logical space.

### Waypoints (in order)

```js
const PATH_WAYPOINTS = [
  { x: 0,    y: 320 },  // Entry — left edge, vertical center
  { x: 320,  y: 320 },  // First horizontal run (left → right)
  { x: 320,  y: 140 },  // First turn — sweep upward
  { x: 960,  y: 140 },  // Upper horizontal run (left → right)
  { x: 960,  y: 400 },  // Right side descent
  { x: 640,  y: 400 },  // Middle horizontal run (right → left)
  { x: 640,  y: 580 },  // Left descent
  { x: 320,  y: 580 },  // Lower horizontal run (right → left)
  { x: 320,  y: 720 },  // Exit — bottom edge
];
```

> **Note:** These waypoints approximate Monkey Meadow's rectangular double-loop. Adjust x/y values during implementation to fine-tune the path shape. The path should produce two enclosed grass islands: one in the upper-center and one in the lower-left interior of the loop.

### Path Rendering

- Path width: **80px** (logical units)
- Path color: `#b8986a` (stone/gravel tan)
- Path border/edge: `#8a6e48` (darker stone outline), 4px each side
- Draw path using `lineTo` with rounded joins (`lineJoin = 'round'`, `lineCap = 'round'`)
- Draw the filled path shape first (polygon formed by expanding waypoints ±40px perpendicular), then the center line for reference during development

### Path Polygon Math

```js
// Expand waypoints into a filled polygon by offsetting ±40px perpendicular to each segment
function buildPathPolygon(waypoints, halfWidth = 40) {
  const left = [], right = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len; // perpendicular normal
    left.push({ x: a.x + nx * halfWidth, y: a.y + ny * halfWidth });
    right.push({ x: a.x - nx * halfWidth, y: a.y - ny * halfWidth });
  }
  return [...left, ...right.reverse()]; // closed polygon
}
// Fill with ctx.fillStyle then ctx.fill(), then stroke both edges separately
```

---

## Map Visual Design

### Background

- Fill entire canvas: `#5a8a3c` (vibrant grass green)
- Top-right quadrant: overlay a lighter `#6fa84a` patch to simulate the rising slope

### Enclosed Grass Islands

Draw two filled rectangles/polygons of `#6fa84a` to represent the grass patches enclosed by the path:

- **Top island:** approximately `x: 340, y: 160, w: 600, h: 155`
- **Bottom-left island:** approximately `x: 0, y: 420, w: 310, h: 145`

### Flowers (Stamps)

Scatter decorative dots as flowers across open grass areas:

```js
// White flowers: 135 instances
// Yellow flowers: 18 instances
// Place randomly but seed with a fixed value so layout is deterministic
// Each flower: filled circle radius 3–5px
// White: '#f5f5f0', Yellow: '#f5d020'
// Avoid placing flowers on or within 50px of the path
```

Use a seeded pseudo-random number generator (simple LCG) so flower positions are identical on every run.

### Stone Props

Place 3 small gray ellipses (`#9a9a9a`) at fixed coordinates as the stone/pebble decorations:

```js
const STONES = [
  { x: 800, y: 300, rx: 18, ry: 12 },
  { x: 180, y: 500, rx: 14, ry: 9  },
  { x: 500, y: 650, rx: 10, ry: 7  },
];
```

### Corner Trees (Line-of-Sight Blockers)

Draw 4 tree clusters at map corners using layered filled circles (dark green):

```js
const TREE_CLUSTERS = [
  { cx: 60,   cy: 60   },  // Top-left
  { cx: 1220, cy: 60   },  // Top-right
  { cx: 1220, cy: 660  },  // Bottom-right
  // Bottom-left corner intentionally has NO trees (matches original)
];
// Each cluster: 3–5 overlapping circles, radius 35–55px, color '#2a5e1a'
// Darker inner circle '#1a3e0e' at cluster center
```

### Line-of-Sight (LoS) Blocking

Store tree cluster bounding circles in a `LOS_BLOCKERS` array. Towers inside or behind a LoS blocker relative to a Bloon cannot target that Bloon. Implement basic LoS check:

```js
function hasLineOfSight(tower, bloon, losBlockers) {
  // Cast a ray from tower center to bloon center
  // If ray intersects any LoS blocker circle → return false
}
```

---

## Bloon System

### Bloon Types (implement in this order)

| ID | Name | HP | Speed (px/s) | Color | Children on pop |
|---|---|---|---|---|---|
| `red` | Red Bloon | 1 | 180 | `#e03030` | none |
| `blue` | Blue Bloon | 1 | 220 | `#3060e0` | 1× red |
| `green` | Green Bloon | 1 | 260 | `#30b040` | 1× blue |
| `yellow` | Yellow Bloon | 1 | 360 | `#e0d020` | 1× green |
| `pink` | Pink Bloon | 1 | 440 | `#e060b0` | 1× yellow |
| `moab` | M.O.A.B. | 200 | 50 | `#3080d0` | 4× pink |

### Bloon Object Schema

```js
{
  id: string,          // Bloon type key
  hp: number,          // Remaining health
  speed: number,       // px per second
  waypointIndex: int,  // Current target waypoint index
  progress: float,     // 0.0–1.0 progress to next waypoint
  x: float,            // Current world x
  y: float,            // Current world y
  distanceTraveled: float, // Total path distance covered (for sorting)
  camo: bool,          // Camo property (default false for MVP)
}
```

### Movement

Each frame, advance Bloon along path:
1. Calculate remaining distance to move: `speed * deltaTime`
2. Move toward current waypoint; if waypoint reached, advance `waypointIndex`
3. If `waypointIndex >= waypoints.length`: Bloon has exited → subtract lives, remove Bloon
4. Update `distanceTraveled` for targeting priority

### Popping Logic

When a Bloon reaches 0 HP:
- Spawn child Bloons at same position with `waypointIndex` and `progress` inherited
- Award cash per pop (see Economy section)
- Remove parent Bloon from active list

### Child Bloon Spawn Edge Case

```
When a Bloon pops mid-segment, children inherit exact x, y, waypointIndex, and progress
Children use their own speed stat from that position forward — do not inherit parent speed
If a child would spawn outside the map bounds (edge case at exit waypoint), discard it silently
```

---

## Round System

### Round Definitions (implement rounds 1–20)

```js
const ROUNDS = [
  /* R1  */ [{ type: 'red',   count: 20, spacing: 0.5 }],
  /* R2  */ [{ type: 'red',   count: 30, spacing: 0.4 }],
  /* R3  */ [{ type: 'blue',  count: 15, spacing: 0.6 }],
  /* R4  */ [{ type: 'blue',  count: 25, spacing: 0.5 }],
  /* R5  */ [{ type: 'red',   count: 20, spacing: 0.3 },
             { type: 'blue',  count: 15, spacing: 0.4 }],
  /* R6  */ [{ type: 'green', count: 20, spacing: 0.6 }],
  /* R7  */ [{ type: 'green', count: 30, spacing: 0.5 }],
  /* R8  */ [{ type: 'blue',  count: 40, spacing: 0.3 }],
  /* R9  */ [{ type: 'green', count: 25, spacing: 0.4 },
             { type: 'blue',  count: 20, spacing: 0.5 }],
  /* R10 */ [{ type: 'yellow',count: 20, spacing: 0.5 }],
  /* R11 */ [{ type: 'yellow',count: 30, spacing: 0.4 }],
  /* R12 */ [{ type: 'green', count: 50, spacing: 0.2 }],
  /* R13 */ [{ type: 'yellow',count: 25, spacing: 0.3 },
             { type: 'green', count: 20, spacing: 0.4 }],
  /* R14 */ [{ type: 'pink',  count: 15, spacing: 0.6 }],
  /* R15 */ [{ type: 'pink',  count: 25, spacing: 0.4 }],
  /* R16 */ [{ type: 'yellow',count: 40, spacing: 0.2 },
             { type: 'pink',  count: 15, spacing: 0.4 }],
  /* R17 */ [{ type: 'pink',  count: 35, spacing: 0.3 }],
  /* R18 */ [{ type: 'pink',  count: 25, spacing: 0.3 },
             { type: 'yellow',count: 30, spacing: 0.3 }],
  /* R19 */ [{ type: 'pink',  count: 50, spacing: 0.2 }],
  /* R20 */ [{ type: 'moab',  count: 1,  spacing: 0   }],
];
```

`spacing` = seconds between each Bloon spawn in the group.

### Round State Machine

```
IDLE → [player presses Start] → SPAWNING → [all spawned, all cleared] → ROUND_COMPLETE → IDLE
                                         ↘ [lives reach 0] → GAME_OVER
```

After round 20 is cleared: `VICTORY` state.

---

## Tower System

### Towers to Implement (MVP — 3 types)

#### 1. Dart Monkey

| Property | Value |
|---|---|
| Cost | $200 |
| Hotkey | `Q` |
| Range | 180px |
| Attack speed | 1.0 attack/sec |
| Damage | 1 HP per dart |
| Projectile | Small circle, `#c0c0c0`, radius 4px |
| Targets | First, Last, Close, Strong |

#### 2. Tack Shooter

| Property | Value |
|---|---|
| Cost | $360 |
| Hotkey | `W` |
| Range | 120px |
| Attack speed | 0.9 attack/sec |
| Damage | 1 HP per tack |
| Projectile | 8 tacks fired in 360° arc simultaneously |
| Tack visual | Short line segments, `#808080`, length 12px |
| Targets | All Bloons in range at fire time |

#### 3. Bomb Shooter

| Property | Value |
|---|---|
| Cost | $650 |
| Hotkey | `E` |
| Range | 200px |
| Attack speed | 0.5 attack/sec |
| Damage | 1 HP, AoE radius 40px |
| Projectile | Black circle radius 6px, travels at 400px/s |
| Explosion | Expanding circle `#ff8800`, max radius 40px, 0.2s duration |
| Targets | First Bloon in range; explosion hits all Bloons in AoE |

### Tower Sprite Spec

```
Dart Monkey:  Brown circle (r=18px), two white dart lines extending from center at ±15°
Tack Shooter: Gray square (36×36px), 8 short lines (12px) radiating at 45° increments
Bomb Shooter: Dark gray circle (r=22px), red dot (r=5px) at center
All towers:   Draw a subtle black outline (2px stroke) around the base shape
When selected: Draw a 3px yellow outline around the tower base
```

### Tack Shooter Fire Direction

```
Tack fires 8 projectiles at fixed 45° increments: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
Directions are absolute (world-space), not aimed at any Bloon
Each tack travels at 600px/s and expires after traveling 120px (its effective range)
```

### Bomb Shooter Collision

```
Bomb travels as a point projectile at 400px/s toward its locked target position (not tracking)
Collision: each frame check if bomb center is within 12px of any active Bloon center
On collision OR on reaching target position (whichever first): detonate
Detonation: deal 1 HP to every Bloon whose center is within 40px of explosion point
Explosion visual: draw circle expanding from r=0 to r=40px over 0.2s, rgba(255,136,0,0.6)
```

### Tower Object Schema

```js
{
  type: string,
  x: float,
  y: float,
  range: float,
  attackSpeed: float,   // attacks per second
  attackCooldown: float,// current cooldown timer (seconds)
  targeting: string,    // 'first' | 'last' | 'close' | 'strong'
  totalPops: int,
}
```

### Placement Rules

- Tower footprint: circle of radius **30px**
- **Cannot place on path** — check if tower center is within `pathWidth/2 + 30` of any path segment
- **Cannot place on tree clusters / LoS blocker props** — check against prop bounding circles
- **Cannot overlap another tower** — check distance between tower centers > 60px
- While placing: show green circle if valid, red circle if invalid
- Click to confirm placement; press Escape or right-click to cancel

### Placement Validation Detail

```
Tower placement invalid if:
- Tower circle (r=30) overlaps path polygon (use point-in-polygon test on 8 sample points around tower circumference)
- Tower circle overlaps any tree cluster circle (cx, cy, r=65 for each cluster)
- Tower circle overlaps any existing tower (distance between centers < 62px)
- Player has insufficient cash (show red flash on cash display, do not place)
```

### Targeting Modes

- **First:** Target Bloon with highest `distanceTraveled`
- **Last:** Target Bloon with lowest `distanceTraveled`
- **Close:** Target Bloon nearest to tower center
- **Strong:** Target Bloon with highest max HP (type priority: moab > pink > yellow > green > blue > red)

Player cycles targeting mode by clicking the tower, then clicking the targeting button in the info panel.

---

## Economy

### Starting Cash

- Easy: $650
- Medium: $500 *(default)*
- Hard: $375

### Starting Lives

- Easy: 200
- Medium: 150 *(default)*
- Hard: 100

### Cash Per Pop

| Bloon | Cash |
|---|---|
| Red | $1 |
| Blue | $1 |
| Green | $1 |
| Yellow | $1 |
| Pink | $1 |
| MOAB | $1 per layer of HP removed |

### End-of-Round Bonus

```js
roundBonus = 100 + (currentRound * 10);
```

### Selling Towers

Sell value = **70% of purchase price**. Display sell button in tower info panel.

---

## HUD (Heads-Up Display)

Layout: canvas is left-aligned; a **240px right sidebar** contains all HUD elements.

### Sidebar Elements (top to bottom)

1. **Lives:** Heart icon + number, red text
2. **Cash:** Dollar icon + number, yellow/gold text
3. **Round:** "Round X / 20"
4. **Start Round button:** Green, disabled between rounds during delay
5. **Speed toggle:** `1×` / `2×` (doubles game speed)
6. **Tower buy panel:** 3 tower cards (Dart Monkey, Tack Shooter, Bomb Shooter) — each showing icon, name, cost
7. **Selected tower panel:** (shown when tower is selected) Name, total pops, targeting mode button, sell button

### Canvas Overlay Elements

- Range circle: semi-transparent white `rgba(255,255,255,0.15)`, shown on hover or selection
- Placement ghost: tower icon at cursor, colored by validity
- Bloon health bars: thin bar above each MOAB only (too cluttered for standard Bloons)
- Round start flash: brief `+$XXX` text at top center when round bonus is awarded

---

## Input Handling

| Action | Input |
|---|---|
| Select tower to buy | Click tower card in sidebar |
| Place tower | Left-click on valid canvas location |
| Cancel placement | Right-click or Escape |
| Select placed tower | Left-click on existing tower |
| Deselect tower | Click empty canvas area |
| Cycle targeting | Click targeting button in panel |
| Sell tower | Click Sell button in panel |
| Start round | Click Start button or press Space |
| Toggle speed | Click speed button or press Tab |
| Hotkey tower select | Q (Dart), W (Tack), E (Bomb) |

---

## Game States

```js
const STATE = {
  MENU:          'menu',          // Not used in MVP — start directly in IDLE
  IDLE:          'idle',          // Between rounds, placement allowed
  SPAWNING:      'spawning',      // Round active, Bloons entering
  ACTIVE:        'active',        // All spawned, Bloons still on map
  ROUND_OVER:    'round_over',    // Brief 1s pause before IDLE
  GAME_OVER:     'game_over',     // Lives reached 0
  VICTORY:       'victory',       // Round 20 cleared
};
```

---

## Rendering Order (per frame)

1. Clear canvas
2. Draw background (grass fill)
3. Draw enclosed grass islands
4. Draw flowers and stones (static, drawn once to offscreen canvas, blitted each frame)
5. Draw path (filled polygon + border)
6. Draw tree clusters (LoS blockers)
7. Draw tower range circles (selected/hovered towers only)
8. Draw tower sprites
9. Draw projectiles
10. Draw Bloons (sorted by `distanceTraveled` descending so frontmost Bloon renders on top)
11. Draw explosions / effects
12. Draw HUD overlay (lives, cash, round info)
13. Draw placement ghost (if placing)

---

## End Screens

### Game Over
- Darken canvas with rgba(0,0,0,0.6) overlay
- Center text: "GAME OVER" — white, 64px bold
- Subtext: "Survived to Round X" — white, 28px
- Button: "Try Again" — reloads page (location.reload())

### Victory
- Darken canvas with rgba(0,180,0,0.4) overlay
- Center text: "VICTORY!" — gold #ffd700, 64px bold
- Subtext: "Monkey Meadow cleared!" — white, 28px
- Button: "Play Again" — reloads page

### Both screens
- Button styled: padding 12px 32px, border-radius 8px, font-size 20px
- Render as DOM element overlaid on canvas (not drawn on canvas itself)
- Show 1.5 seconds after the triggering event, not immediately

---

## Seeded RNG (for flower placement)

```js
// Simple LCG — fixed seed ensures same flower layout every game
class SeededRNG {
  constructor(seed = 42) { this.state = seed; }
  next() {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }
  range(min, max) { return min + this.next() * (max - min); }
}
```

---

## Implementation Order for Claude Code

Build in this sequence to keep each step testable:

1. **`index.html` + `style.css`** — Canvas + sidebar shell, no logic
2. **Path rendering** — Draw Monkey Meadow path on canvas, verify shape
3. **Background + decorations** — Grass, flowers, trees, stones
4. **Bloon movement** — Single Red Bloon traversing path, exits correctly
5. **Round spawner** — Round 1 spawns 20 Reds in sequence
6. **Lives system** — Lives decrement on Bloon exit, Game Over at 0
7. **Tower placement** — Click to place Dart Monkey, validate against path/props
8. **Tower targeting + projectiles** — Dart Monkey fires, hits Bloon, pops it
9. **Economy** — Cash earned on pop, deducted on buy
10. **Remaining towers** — Tack Shooter, Bomb Shooter with AoE
11. **Rounds 1–20** — Full round table + round bonus + Victory state
12. **Targeting modes** — First/Last/Close/Strong selectable per tower
13. **Sell system** — Sell button, 70% refund
14. **Speed toggle** — 2× mode
15. **Polish** — LoS checks, MOAB HP bar, round start cash flash, sound (optional)

---

## Known Simplifications vs. Original BTD6

| Feature | Original | This Recreation |
|---|---|---|
| Graphics | 3D Unity renderer | 2D Canvas primitives |
| Towers | 25 tower types, 3 upgrade paths each | 3 towers, no upgrades (MVP) |
| Bloon types | 20+ types incl. Camo, Regrow, Fortified | 6 types (Red → MOAB) |
| Heroes | 14 heroes with leveling | Not implemented |
| Rounds | 100+ rounds | 20 rounds |
| Monkey Knowledge | 100+ meta-upgrades | Not implemented |
| Co-op | 4-player | Single-player only |
| Sound | Full soundtrack + SFX | Optional / out of scope |

---

## Running the Game

```bash
# No build step required
# Option 1: Open directly
open index.html

# Option 2: Local server (avoids CORS on ES modules)
python3 -m http.server 8080
# then open http://localhost:8080
```

---

## Success Criteria

- [ ] Monkey Meadow path renders recognizably (double-loop, two enclosed islands)
- [ ] Bloons traverse full path and exit correctly
- [ ] 20 rounds of increasing Bloon waves spawn correctly
- [ ] All 3 towers can be purchased, placed on valid land, and attack Bloons
- [ ] Lives decrement on leaks; Game Over triggers at 0 lives
- [ ] Cash earned/spent correctly; cannot place tower without sufficient cash
- [ ] Round 20 MOAB spawns; clearing it triggers Victory screen
- [ ] Game runs at stable 60fps with 50+ Bloons on screen simultaneously
