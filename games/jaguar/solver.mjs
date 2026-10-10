// "Le Petit Jaguar" level solver — dev-only (never precached, never loaded by the app).
// The mazes are made at play time from the level's parameters (maze.js makeMaze), so the
// gate (tools/check-levels.mjs) checks them by sampling:
//   solve(level)             a level is solvable when makeMaze finds mazes for it;
//                            minMoves = the median shortest path (cells) of 50 seeded mazes
//                            (difficulty table only)
//   sampleRound(level, rng)  one maze exactly as the game makes it (the last key is kept
//                            per level between seeds). It re-checks every rule FROM THE
//                            WALLS, not from makeMaze's own fields, and throws (the gate
//                            names the level and the seed) on any broken rule.
//                            answers is always 1: the maze has one task (reach papa).
import {
  makeMaze, bfs, openNeighbours, openingCount, centreBox, isOuterRing, mazeKey,
  MAX_COLS, MAX_ROWS, FAR_RATIO,
} from './maze.js';

// A small seeded rng (mulberry32) for solve().
function seeded(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkLevel(level) {
  const { cols, rows, deadEnds, path, hints } = level;
  if (cols * rows > MAX_COLS * MAX_ROWS) throw new Error(`level ${level.id}: ${cols}×${rows} is bigger than ${MAX_COLS}×${MAX_ROWS}`);
  if (deadEnds[0] > deadEnds[1]) throw new Error(`level ${level.id}: deadEnds min > max`);
  if (path[0] > path[1]) throw new Error(`level ${level.id}: path min > max`);
  for (const key of ['deadEnds', 'walk']) {
    if (hints[key][0] > hints[key][1]) throw new Error(`level ${level.id}: hints.${key} clue > glow`);
  }
}

export function solve(level) {
  checkLevel(level);
  const lengths = [];
  let last = null;
  for (let seed = 1; seed <= 50; seed++) {
    const maze = makeMaze(level, seeded(seed), last); // throws after 500 tries
    last = maze.key;
    lengths.push(maze.path.length);
  }
  lengths.sort((a, b) => a - b);
  return { solvable: true, minMoves: lengths[lengths.length >> 1] };
}

const lastKeys = new Map(); // level id → key of the previous sample

export function sampleRound(level, rng) {
  const maze = makeMaze(level, rng, lastKeys.get(level.id) ?? null);
  const { cols, rows, start, papa } = maze;
  const cells = cols * rows;
  const fail = (why) => { throw new Error(`${why} (key ${maze.key})`); };

  if (lastKeys.get(level.id) === maze.key) fail('same maze twice in a row');
  lastKeys.set(level.id, maze.key);
  if (maze.key !== mazeKey(maze.walls, start, papa)) fail('key does not match the maze');

  // Connected: every cell reachable from the start.
  const { dist } = bfs(maze, start);
  if (dist.includes(-1)) fail('a cell is not reachable from the start');
  if (start === papa) fail('start = papa');
  if (dist[papa] === -1) fail('papa is not reachable');

  // Walls must agree on both sides of every edge.
  for (let i = 0; i < cells; i++) {
    for (const j of openNeighbours(maze, i)) {
      if (!openNeighbours(maze, j).includes(i)) fail(`one-sided opening ${i}-${j}`);
    }
  }

  const pathLen = dist[papa] + 1;
  if (pathLen < level.path[0] || pathLen > level.path[1]) fail(`path ${pathLen} out of [${level.path}]`);

  let deadEnds = 0, openings = 0;
  for (let i = 0; i < cells; i++) {
    const n = openingCount(maze, i);
    openings += n;
    if (n === 1 && i !== start && i !== papa) deadEnds++;
  }
  if (deadEnds < level.deadEnds[0] || deadEnds > level.deadEnds[1]) fail(`dead ends ${deadEnds} out of [${level.deadEnds}]`);

  // Each opening is counted from both cells, so edges = openings / 2.
  const loops = openings / 2 - (cells - 1);
  if (loops !== level.loops) fail(`loops ${loops} ≠ ${level.loops}`);

  if (level.papa === 'far') {
    if (dist[papa] < FAR_RATIO * Math.max(...dist)) fail('papa is not far');
  } else {
    const b = centreBox(cols, rows), c = papa % cols, r = (papa - c) / cols;
    if (c < b.c0 || c > b.c1 || r < b.r0 || r > b.r1) fail('papa is not in the centre box');
    if (!isOuterRing(cols, rows, start)) fail('the jaguar is not on the outer ring');
  }
  return { answers: 1 };
}
