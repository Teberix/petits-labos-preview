# Game 10 "Le Petit Jaguar" — build mailbox

## J1 — maze, levels, solver, hints (pure logic, no UI)

Read list: game-10-proposal.md (a, c, e, g); tools/templates/level-game/; games/train/solver.mjs;
games/memory/hints.js.

### Model

- Maze = `{ cols, rows, walls, start, papa, path, deadEnds, key }`. Cell = `row * cols + col`.
  `walls[i]` = bit mask of the walled sides (N 1, E 2, S 4, W 8).
- `makeMaze(level, rng, lastKey)`: growing tree (`bias`), then `loops` extra openings between
  cells ≥ 4 steps apart in the tree, then start and papa (`far` or `middle`), then rejection
  on dead ends, path and `lastKey` (max 500 tries).
- `ROUNDS_PER_PLAY = 2` is a constant in `maze.js`, not level data.
- Hint thresholds are level data (`hints`). Hint shown = stronger of the two triggers.

| level field | meaning |
|---|---|
| `cols`, `rows`, `bias`, `loops`, `papa` | maze parameters |
| `deadEnds`, `path` | measured ranges (10th–90th percentile, 200 seeds) |
| `hints.deadEnds` | [clue, glow] new dead ends in the round |
| `hints.walk` | [clue, glow] moves ÷ shortest path moves |

No stored-data change in J1. `profiles[p].skills.jaguar` appears with the J2 release.

### Usage

```js
const maze = makeMaze(level, Math.random, lastKey);
const tracker = createHintTracker(maze, level.hints);
const { newDeadEnd, hint } = tracker.step(cell); // one call per move
shortestPath(maze, cell);                        // route to papa for the paw prints
ctx.path.record(level, tracker.strongest());     // 'none' | 'clue' | 'glow'
```

`walk` counts moves, revisits included. A dead end counts once.

### Gate

```
node --test tests/jaguar.test.mjs            12 pass, 0 fail
node tools/gate.mjs --only unit,levels,privacy
  ✓ unit     242 passed, 0 failed
  jaguar: sampleRound — 200 seeded rounds per level checked
  ✓ privacy  256 files + commit messages scanned ...
  GATE PASSED (5s)
```

### Measured ranges (200 seeds, other parameters fixed)

| step | grid | bias | loops | papa | dead ends (p10–p90, min–max) | path cells (p10–p90, min–max) | hints.deadEnds |
|---|---|---|---|---|---|---|---|
| 1 | 3×4 | 0 | 0 | far | 1–2 (0–3) | 7–10 (6–12) | 2, 3 |
| 2 | 4×5 | 0.2 | 0 | far | 2–5 (0–6) | 10–16 (8–20) | 2, 3 |
| 3 | 4×6 | 0.3 | 0 | far | 3–6 (2–8) | 10–18 (9–21) | 2, 3 |
| 4 | 5×7 | 0.4 | 0 | far | 6–10 (4–12) | 13–21 (10–27) | 3, 5 |
| 5 | 5×8 | 0.5 | 1 | far | 6–11 (4–13) | 13–22 (11–27) | 3, 5 |
| 6 | 5×9 | 0.5 | 2 | middle | 7–12 (4–14) | 4–13 (2–25) | 4, 7 |
| 7 | 6×10 | 0.6 | 2 | middle | 11–16 (7–20) | 5–14 (3–29) | 4, 7 |
| 8 | 6×12 | 0.7 | 3 | middle | 14–19 (11–22) | 6–14 (4–24) | 4, 7 |

`hints.walk` = [3, 5] at every step. The `bias` values for steps 2–7 are my choice (the
proposal fixed only 0 and 0.7). The difficulty table from the gate (`minMoves` = median path
cells of 50 seeded mazes):

| id | difficulty | minMoves |
|---|---|---|
| 1 | 1 | 9 |
| 2 | 2 | 12 |
| 3 | 3 | 13 |
| 4 | 4 | 17 |
| 5 | 5 | 16 |
| 6 | 6 | 8 |
| 7 | 7 | 9 |
| 8 | 8 | 9 |

### Risks

1. **Middle papa makes short paths.** Steps 6–8 have a median path of 8–9 cells, below steps
   4–5 (16–17). The proposal estimated 8–16, 10–20, 12–26. The p10 minimum is 4–6 cells. The
   path length no longer rises with the step. The difficulty comes only from the grid size and
   the dead ends. Question: raise the `path` minimum at steps 6–8 (for example 8, 10, 12)?
2. **Step 5 path is shorter than step 4** (median 16 vs 17). The effect is small.
3. **Step-1 dead-end range 1–2:** thresholds [2, 3] mean glow needs 3 dead ends. The maze has
   at most 2. At step 1 only the `walk` trigger can give a glow (5× the path). This is
   intended by change 1, but it means no dead-end glow exists at steps 1–3 with max 2–6 dead ends.
4. **Dead-end counts of steps 6–8** (up to 12–19) against thresholds [4, 7]: the glow arrives
   after 7 of the dead ends. Playtest will show if this is late.
5. Loop candidates need two cells ≥ 4 apart in the tree. A tiny grid with `loops` > 0 would
   reject all tries. Not an issue for these 8 levels.
6. Not checked (no UI): touch feel, layout, voice, the landscape grid turn, the 44 px cells.
