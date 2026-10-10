// Unit tests for "Le Petit Jaguar" (maze rules + hint tracker + levels).
// Run: node --test tests/jaguar.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeMaze, shortestPath, bfs, openNeighbours, openingCount, centreBox, isOuterRing, FAR_RATIO, ROUNDS_PER_PLAY,
} from '../games/jaguar/maze.js';
import { createHintTracker, hintFor } from '../games/jaguar/hints.js';
import { sampleRound, solve } from '../games/jaguar/solver.mjs';
import meta from '../games/jaguar/meta.js';

const data = JSON.parse(readFileSync(new URL('../games/jaguar/levels.json', import.meta.url), 'utf8'));
const LEVELS = data.levels;
const SEEDS = 40;

function seeded(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('levels: 8 steps, meta matches, 2 rounds per play', () => {
  assert.equal(LEVELS.length, 8);
  assert.deepEqual(LEVELS.map((l) => l.difficulty), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(meta.steps, 8);
  assert.equal(meta.id, 'jaguar');
  assert.equal(meta.path, true);
  assert.equal(meta.scene, undefined);
  assert.equal(ROUNDS_PER_PLAY, 2);
});

test('maze: connected, exact loop count, ranges, papa rule — every level', () => {
  for (const level of LEVELS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const maze = makeMaze(level, seeded(seed));
      const where = `level ${level.id} seed ${seed}`;
      const cells = level.cols * level.rows;
      const { dist } = bfs(maze, maze.start);
      assert.ok(!dist.includes(-1), `${where}: connected`);
      let openings = 0;
      for (let i = 0; i < cells; i++) openings += openingCount(maze, i);
      assert.equal(openings / 2 - (cells - 1), level.loops, `${where}: loops`);
      assert.ok(maze.deadEnds.length >= level.deadEnds[0] && maze.deadEnds.length <= level.deadEnds[1], `${where}: dead ends`);
      assert.ok(maze.path.length >= level.path[0] && maze.path.length <= level.path[1], `${where}: path`);
      assert.equal(maze.path.length, dist[maze.papa] + 1, `${where}: path is the BFS path`);
      assert.notEqual(maze.start, maze.papa);
      if (level.papa === 'far') {
        assert.ok(dist[maze.papa] >= FAR_RATIO * Math.max(...dist), `${where}: papa far`);
      } else {
        const b = centreBox(level.cols, level.rows), c = maze.papa % level.cols, r = (maze.papa - c) / level.cols;
        assert.ok(c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1, `${where}: papa in the centre`);
        assert.ok(isOuterRing(level.cols, level.rows, maze.start), `${where}: jaguar on the ring`);
        // The pair is far: distance ≥ FAR_RATIO × the max over every (centre papa, ring cell).
        let pairMax = 0;
        for (let p = 0; p < cells; p++) {
          const pc = p % level.cols, pr = (p - pc) / level.cols;
          if (pc < b.c0 || pc > b.c1 || pr < b.r0 || pr > b.r1) continue;
          const d = bfs(maze, p).dist;
          for (let i = 0; i < cells; i++) if (isOuterRing(level.cols, level.rows, i)) pairMax = Math.max(pairMax, d[i]);
        }
        assert.ok(dist[maze.papa] >= FAR_RATIO * pairMax, `${where}: jaguar far from papa`);
      }
    }
  }
});

test('maze: path steps are real openings; shortestPath works from any cell', () => {
  const level = LEVELS[7];
  const maze = makeMaze(level, seeded(7));
  for (let k = 1; k < maze.path.length; k++) {
    assert.ok(openNeighbours(maze, maze.path[k - 1]).includes(maze.path[k]));
  }
  const from = maze.deadEnds[0];
  const route = shortestPath(maze, from);
  assert.equal(route[0], from);
  assert.equal(route.at(-1), maze.papa);
  assert.equal(shortestPath(maze, maze.papa).length, 1);
});

test('maze: never the same maze twice in a row', () => {
  // Level 1 is small: collisions are likely if lastKey is ignored.
  const level = LEVELS[0];
  let last = null;
  for (let seed = 1; seed <= 300; seed++) {
    const maze = makeMaze(level, seeded(seed % 3), last); // only 3 distinct seeds → repeats
    assert.notEqual(maze.key, last);
    last = maze.key;
  }
});

test('maze: a level with an impossible range throws', () => {
  assert.throws(() => makeMaze({ ...LEVELS[0], path: [99, 100] }, seeded(1)), /no maze/);
});

test('solver: every level solves; sampleRound passes for 200 seeds', () => {
  for (const level of LEVELS) {
    assert.equal(solve(level).solvable, true);
    for (let seed = 1; seed <= 200; seed++) assert.equal(sampleRound(level, seeded(seed)).answers, 1);
  }
});

test('hints: hintFor thresholds', () => {
  assert.equal(hintFor(1, [2, 3]), 'none');
  assert.equal(hintFor(2, [2, 3]), 'clue');
  assert.equal(hintFor(3, [2, 3]), 'glow');
  assert.equal(hintFor(2.9, [3, 5]), 'none');
});

// A tracker needs only maze.deadEnds and maze.path: a fake maze with many dead ends and
// a 10-move shortest path (11 cells), so the thresholds can be tested at every step.
const fakeMaze = { deadEnds: [100, 101, 102, 103, 104, 105, 106, 107], path: Array.from({ length: 11 }, (_, i) => i) };

test('hints (a): 1 dead end → none, even if hit twice', () => {
  const t = createHintTracker(fakeMaze, LEVELS[0].hints);
  assert.equal(t.step(100).hint, 'none');
  assert.equal(t.step(100).hint, 'none'); // the same dead end counts once
  assert.equal(t.strongest(), 'none');
});

test('hints (b): step-1 thresholds give clue at 2 dead ends, glow at 3', () => {
  const t = createHintTracker(fakeMaze, LEVELS[0].hints);
  assert.deepEqual(LEVELS[0].hints.deadEnds, [2, 3]);
  t.step(100);
  assert.equal(t.step(101).hint, 'clue');
  assert.equal(t.step(102).hint, 'glow');
  assert.equal(t.strongest(), 'glow');
});

test('hints (c): step-8 thresholds give none at 3 dead ends', () => {
  const hints = LEVELS[7].hints;
  assert.deepEqual(hints.deadEnds, [4, 7]);
  const t = createHintTracker(fakeMaze, hints);
  t.step(100); t.step(101);
  assert.equal(t.step(102).hint, 'none');
  assert.equal(t.step(103).hint, 'clue');
  t.step(104); t.step(105);
  assert.equal(t.step(106).hint, 'glow');
});

test('hints (d): a walk of 3× the shortest path with no dead end → clue; 5× → glow', () => {
  const t = createHintTracker(fakeMaze, LEVELS[7].hints);
  let hint;
  for (let k = 1; k <= 29; k++) { hint = t.step(k % 2).hint; }  // 29 moves < 3 × 10
  assert.equal(hint, 'none');
  assert.equal(t.step(0).hint, 'clue');                          // move 30 = 3 × 10
  for (let k = 31; k <= 49; k++) t.step(k % 2);
  assert.equal(t.current(), 'clue');
  assert.equal(t.step(1).hint, 'glow');                          // move 50 = 5 × 10
  assert.equal(t.deadEndsReached(), 0);
  assert.equal(t.strongest(), 'glow');
});

test('hints: the stronger of the two triggers wins', () => {
  const t = createHintTracker(fakeMaze, LEVELS[0].hints);
  for (let k = 0; k < 30; k++) t.step(k % 2);    // walk → clue
  assert.equal(t.current(), 'clue');
  t.step(100); t.step(101);                      // 2 dead ends → clue, 3 → glow
  assert.equal(t.step(102).hint, 'glow');
});
