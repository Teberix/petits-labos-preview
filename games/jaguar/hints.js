// Le Petit Jaguar — hint tracker (pure). One tracker per round (maze).
//
// Two triggers; the hint shown is the STRONGER of the two. The thresholds are level data
// (level.hints), so they scale with the maze:
//   deadEnds [clue, glow]  new dead ends reached in this round (the same one counts once)
//   walk     [clue, glow]  moves made / shortest path length in moves. A second trigger,
//                          so a child who walks round loops and never hits a dead end
//                          still gets help.
// Reactions (UI, later): clue = paw prints on the next 2 cells of the shortest path from
// the jaguar; glow = paw prints on the whole shortest path.
// The round's outcome = the strongest hint shown = strongest() → ctx.path.record.

const RANK = { none: 0, clue: 1, glow: 2 };

// value: the count; [clue, glow]: the thresholds → 'none' | 'clue' | 'glow'.
export function hintFor(value, [clue, glow]) {
  if (value >= glow) return 'glow';
  if (value >= clue) return 'clue';
  return 'none';
}

const stronger = (a, b) => (RANK[a] >= RANK[b] ? a : b);

// maze: from makeMaze (needs deadEnds and path). hints: the level's `hints` field.
export function createHintTracker(maze, hints) {
  const deadEndSet = new Set(maze.deadEnds);
  const reached = new Set(); // dead ends reached so far
  const shortest = Math.max(1, maze.path.length - 1); // moves from start to papa
  let walked = 0;            // moves made (revisits count)
  let best = 'none';

  const current = () => stronger(
    hintFor(reached.size, hints.deadEnds),
    hintFor(walked / shortest, hints.walk),
  );

  return {
    // The jaguar has moved to `cell` (one call per move).
    // → { newDeadEnd, hint } — hint = what to show now.
    step(cell) {
      walked++;
      const newDeadEnd = deadEndSet.has(cell) && !reached.has(cell);
      if (newDeadEnd) reached.add(cell);
      const hint = current();
      best = stronger(best, hint);
      return { newDeadEnd, hint };
    },

    current,
    deadEndsReached() { return reached.size; },
    walkedCells() { return walked; },

    // 'none' | 'clue' | 'glow' — for ctx.path.record at the end of the round.
    strongest() { return best; },
  };
}
