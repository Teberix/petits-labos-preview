# Le Petit Jaguar — game notes (dev-only, never precached)

Mazes: the jaguar walks to papa. Trains planning a path and spatial reasoning.
Non-linguistic → app language (French by default). Game id: `jaguar`.
Titles: fr "Le Petit Jaguar" / es "El Pequeño Jaguar" / en "Little Jaguar".

## Status
IN PROGRESS — step J1 (pure logic + level data) built on 2026-10-11. No UI yet.
Design: `docs/mailbox/game-10-proposal.md` (a, c, e) with the owner's changes below.
Game 10 uses the new engine (`levels.json`, path screen, no `levels.js`). No scene.

## Levels
`levels.json`, checked by the gate against `levels.schema.json` and `solver.mjs`.
Progress is saved by level `id` — never renumber. Mazes are made at play time by
`maze.js` `makeMaze(level, rng, lastKey)`. `ROUNDS_PER_PLAY = 2` is a game constant (in
`maze.js`), not level data.

| step | grid (cols×rows) | loops | papa |
|---|---|---|---|
| 1–3 | 3×4, 4×5, 4×6 | 0 | far |
| 4–5 | 5×7, 5×8 | 0, 1 | far |
| 6–8 | 5×9, 6×10, 6×12 | 2, 2, 3 | middle |

`middle` (owner, J2): papa in the centre box; (papa, start) = a random pair among the
pairs with BFS distance ≥ `FAR_RATIO` × the max over every centre-box papa and outer-ring
cell. Path medians (200 seeds): step 5 = 16; steps 6/7/8 = 16/18/19.

`deadEnds` and `path` ranges are MEASURED: the 10th–90th percentile of 200 seeded mazes
per level, with the other parameters fixed. If you change `bias`, `loops` or the grid,
measure again.

## Rules (owner's decisions, 2026-10-11)
- Hint thresholds are LEVEL DATA (`hints`), scaled with the maze:
  `deadEnds` = [clue, glow] new dead ends in the round (steps 1–3: [2,3]; 4–5: [3,5];
  6–8: [4,7]); `walk` = [clue, glow] moves ÷ shortest path moves (all steps: [3,5]).
  The hint shown = the stronger of the two. Round outcome = the strongest hint shown
  (`none` | `clue` | `glow`) → `ctx.path.record`.
- Rewards: 1 star per maze. 2 mazes per ▶. Never a failure screen: the maze always ends
  with the hug.
- **Landscape turns the GRID** (cols and rows swap in the layout), never the art: the
  jaguar and papa always stand upright.
- **Touch-target exception:** maze cells may be 44 px (`minCell` 44). The jaguar's hit box
  stays ≥ 64 px (it may be larger than its cell).

## Files
- `maze.js` — pure: `makeMaze`, `shortestPath(maze, fromCell)`, BFS helpers. `walls[i]` =
  bit mask of the walled sides (N 1, E 2, S 4, W 8). Cell = `row * cols + col`.
- `hints.js` — pure: `createHintTracker(maze, level.hints)` → `step(cell)`, `current()`,
  `strongest()`.
- `levels.json`, `levels.schema.json`, `solver.mjs` — level data and gate checks.
- `meta.js` — hub entry. Tests: `tests/jaguar.test.mjs`.
- To come (J2+): `jaguar.js`, `strings.js`, `art.js`, `jaguar.css` (classes `jg-`),
  `checks.js`.

## Layout
J2 builds it. Portrait: cols × rows as stored. Landscape: swap cols and rows in the grid
layout only. Sizes: 360×640 and 640×360 set the smallest cell (44 px).

## Playtest history
None yet.
