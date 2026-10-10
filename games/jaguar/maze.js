// Le Petit Jaguar — maze generator (pure: no DOM, no Math.random of its own).
//
// A maze is stored as short side × long side (portrait: cols × rows). In landscape the
// game turns the GRID (swaps cols and rows in the layout), never the art.
// Cell index = row * cols + col. `walls[i]` is a bit mask of the sides of cell i that
// have a wall: N = 1, E = 2, S = 4, W = 8. A wall is always stored on both cells.
//
// makeMaze(level, rng, lastKey) → { cols, rows, walls, start, papa, path, deadEnds, key }
//   path     the shortest route start → papa, as cell indexes (both ends included)
//   deadEnds cells with ONE opening, not the start and not papa
//   key      the walls + start + papa as a string (the game passes the last key back,
//            so the same maze never comes twice in a row)

export const ROUNDS_PER_PLAY = 2; // game constant, not level data (owner, 2026-10-11)
export const MAX_COLS = 6;
export const MAX_ROWS = 12;
export const MAX_TRIES = 500;
const MIN_LOOP_GAP = 4;    // a loop joins 2 cells at least 4 steps apart in the tree
export const FAR_RATIO = 0.9; // far papa: BFS distance ≥ 90 % of the max distance

export const N = 1, E = 2, S = 4, W = 8;
const SIDES = [
  { bit: N, opp: S, dc: 0, dr: -1 },
  { bit: E, opp: W, dc: 1, dr: 0 },
  { bit: S, opp: N, dc: 0, dr: 1 },
  { bit: W, opp: E, dc: -1, dr: 0 },
];

// The neighbours of cell i that are reachable through an opening: [cell, ...].
export function openNeighbours(maze, i) {
  const { cols, rows, walls } = maze;
  const c = i % cols, r = (i - c) / cols;
  const out = [];
  for (const s of SIDES) {
    if (walls[i] & s.bit) continue;
    const nc = c + s.dc, nr = r + s.dr;
    if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) out.push(nr * cols + nc);
  }
  return out;
}

// Number of openings of cell i (the outer border is a wall, so it is never an opening).
export function openingCount(maze, i) {
  return openNeighbours(maze, i).length;
}

// BFS from `from` through the openings → distance per cell (-1 = not reachable) and the
// parent per cell (to rebuild a route).
export function bfs(maze, from) {
  const n = maze.cols * maze.rows;
  const dist = new Array(n).fill(-1);
  const parent = new Array(n).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const next of openNeighbours(maze, cell)) {
      if (dist[next] !== -1) continue;
      dist[next] = dist[cell] + 1;
      parent[next] = cell;
      queue.push(next);
    }
  }
  return { dist, parent };
}

// The shortest route from `fromCell` to papa, both ends included. With loops it is the
// shortest of the routes. Used by the hints (from the jaguar's current cell).
export function shortestPath(maze, fromCell) {
  const { dist, parent } = bfs(maze, fromCell);
  if (dist[maze.papa] === -1) return [];
  const route = [];
  for (let c = maze.papa; c !== -1; c = parent[c]) route.push(c);
  return route.reverse();
}

// The "centre box": the middle third of the columns and of the rows, at least 1 cell.
// → { c0, c1, r0, r1 } (inclusive).
export function centreBox(cols, rows) {
  const span = (n) => {
    const a = Math.floor(n / 3), b = Math.ceil((2 * n) / 3) - 1;
    return b >= a ? [a, b] : [Math.floor((n - 1) / 2), Math.floor((n - 1) / 2)];
  };
  const [c0, c1] = span(cols), [r0, r1] = span(rows);
  return { c0, c1, r0, r1 };
}

export function isOuterRing(cols, rows, i) {
  const c = i % cols, r = (i - c) / cols;
  return c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// Step 1: a perfect maze (one route between any 2 cells) by the "growing tree" method.
// bias 0 = always the newest cell (long winding corridors, few dead ends);
// bias 1 = always a random cell (short dead ends everywhere).
function growTree(cols, rows, bias, rng) {
  const walls = new Array(cols * rows).fill(N | E | S | W);
  const seen = new Array(cols * rows).fill(false);
  const first = Math.floor(rng() * cols * rows);
  seen[first] = true;
  const list = [first];
  while (list.length) {
    const at = rng() < bias ? Math.floor(rng() * list.length) : list.length - 1;
    const cell = list[at];
    const c = cell % cols, r = (cell - c) / cols;
    const free = SIDES.filter((s) => {
      const nc = c + s.dc, nr = r + s.dr;
      return nc >= 0 && nc < cols && nr >= 0 && nr < rows && !seen[nr * cols + nc];
    });
    if (!free.length) { list.splice(at, 1); continue; }
    const s = pick(free, rng);
    const next = (r + s.dr) * cols + (c + s.dc);
    walls[cell] &= ~s.bit;
    walls[next] &= ~s.opp;
    seen[next] = true;
    list.push(next);
  }
  return walls;
}

// Step 2: open `count` more walls. Only walls between 2 cells ≥ MIN_LOOP_GAP steps apart
// in the tree, so each loop is a real second route (not a 2×2 square). false = not enough.
function addLoops(maze, count, rng) {
  if (count === 0) return true;
  const { cols, rows, walls } = maze;
  const candidates = [];
  for (let i = 0; i < cols * rows; i++) {
    const { dist } = bfs(maze, i);
    const c = i % cols;
    // Only E and S, so each wall is listed once.
    if (c + 1 < cols && walls[i] & E && dist[i + 1] >= MIN_LOOP_GAP) candidates.push([i, E, i + 1, W]);
    if (i + cols < cols * rows && walls[i] & S && dist[i + cols] >= MIN_LOOP_GAP) candidates.push([i, S, i + cols, N]);
  }
  if (candidates.length < count) return false;
  for (let k = 0; k < count; k++) {
    const [a, abit, b, bbit] = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
    walls[a] &= ~abit;
    walls[b] &= ~bbit;
  }
  return true;
}

// Step 3: where the jaguar (start) and papa stand.
function placeStartAndPapa(maze, rule, rng) {
  const { cols, rows } = maze;
  if (rule === 'far') {
    const start = pick([0, cols - 1, (rows - 1) * cols, rows * cols - 1], rng);
    const { dist } = bfs(maze, start);
    const max = Math.max(...dist);
    const far = [];
    dist.forEach((d, i) => { if (i !== start && d >= FAR_RATIO * max) far.push(i); });
    return { start, papa: pick(far, rng) };
  }
  // middle: papa in the centre box, the jaguar on the outer ring.
  const box = centreBox(cols, rows);
  const centre = [], ring = [];
  for (let i = 0; i < cols * rows; i++) {
    const c = i % cols, r = (i - c) / cols;
    if (c >= box.c0 && c <= box.c1 && r >= box.r0 && r <= box.r1) centre.push(i);
    if (isOuterRing(cols, rows, i)) ring.push(i);
  }
  return { start: pick(ring, rng), papa: pick(centre, rng) };
}

export function mazeKey(walls, start, papa) {
  return `${walls.join('.')}|${start}|${papa}`;
}

const inRange = (v, [min, max]) => v >= min && v <= max;

// One try. Returns the maze, or null when the loops did not fit.
function tryMaze(level, rng) {
  const { cols, rows } = level;
  const maze = { cols, rows, walls: growTree(cols, rows, level.bias, rng) };
  if (!addLoops(maze, level.loops, rng)) return null;
  Object.assign(maze, placeStartAndPapa(maze, level.papa, rng));
  maze.path = shortestPath(maze, maze.start);
  maze.deadEnds = [];
  for (let i = 0; i < cols * rows; i++) {
    if (i !== maze.start && i !== maze.papa && openingCount(maze, i) === 1) maze.deadEnds.push(i);
  }
  maze.key = mazeKey(maze.walls, maze.start, maze.papa);
  return maze;
}

// The maze for one round. Rejects mazes whose dead ends or path are out of the level's
// ranges, or that equal `lastKey`; throws after MAX_TRIES.
export function makeMaze(level, rng, lastKey = null) {
  for (let t = 0; t < MAX_TRIES; t++) {
    const maze = tryMaze(level, rng);
    if (!maze) continue;
    if (!inRange(maze.deadEnds.length, level.deadEnds)) continue;
    if (!inRange(maze.path.length, level.path)) continue;
    if (maze.key === lastKey) continue;
    return maze;
  }
  throw new Error(`jaguar level ${level.id}: no maze after ${MAX_TRIES} tries`);
}
