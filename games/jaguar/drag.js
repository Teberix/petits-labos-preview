// Le Petit Jaguar — drag and tap on the board (proposal d). Game-local: the shared
// dragdrop.js makes a ghost copy, and the jaguar must never leave the maze.
//
// Works in VISUAL grid cells {x, y} (the grid may be turned in landscape); the game
// converts. A setTimeout queue walks the finger's trail, 1 cell per STEP_MS (never
// requestAnimationFrame).
//   opts.at(event)        → {x, y} visual cell under the pointer (may be off the grid)
//   opts.jaguar()         → {x, y} the jaguar's visual cell
//   opts.onJaguar(event)  → true when the pointer is in the jaguar's hit box
//   opts.tryStep({x, y})  → true if the jaguar moved there (open neighbour), else false
//   opts.bump()           the jaguar hits a wall
//   opts.tapStep(event)   one tap = one step (main-direction rule, in the game)
//   opts.busy()           true while the jaguar must not move (hug)
export const STEP_MS = 70;
const TAP_PX = 10;
const MAX_AFTER_UP = 3; // cells still walked after pointerup

const same = (a, b) => a.x === b.x && a.y === b.y;

// The 4-connected cells from a (excluded) to b (included): a fast finger leaves no hole.
export function lineCells(a, b) {
  const out = [];
  let { x, y } = a;
  while (x !== b.x || y !== b.y) {
    if (Math.abs(b.x - x) >= Math.abs(b.y - y)) x += Math.sign(b.x - x);
    else y += Math.sign(b.y - y);
    out.push({ x, y });
  }
  return out;
}

export function createDrag(board, opts) {
  let trail = [];       // visual cells still to walk
  let finger = null;    // the last cell the finger was on (drag only)
  let down = null;      // { id, x, y, onJaguar }
  let timer = null;
  let blocked = false;  // after a bump: wait for the finger to come back

  function walk() {
    timer = null;
    if (opts.busy()) { trail = []; return; }
    const next = trail.shift();
    if (!next) return;
    const at = opts.jaguar();
    if (!same(next, at)) {
      const near = Math.abs(next.x - at.x) + Math.abs(next.y - at.y) === 1;
      if (near && opts.tryStep(next)) blocked = false;
      else {
        // A wall, or the finger is ahead of a gap: stop here, drop the rest of the trail.
        if (near && !blocked) opts.bump();
        blocked = true;
        trail = [];
      }
    }
    schedule();
  }

  function schedule() {
    if (!timer && trail.length) timer = setTimeout(walk, STEP_MS);
  }

  function onDown(e) {
    if (down || opts.busy()) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, onJaguar: opts.onJaguar(e) };
    board.setPointerCapture?.(e.pointerId);
    if (down.onJaguar) { finger = opts.jaguar(); trail = []; blocked = false; }
  }

  function onMove(e) {
    if (!down || e.pointerId !== down.id || !down.onJaguar) return;
    const cell = opts.at(e);
    if (same(cell, finger)) return;
    const added = lineCells(finger, cell);
    finger = cell;
    if (blocked) {
      // Follow again only when the finger is back on a neighbour of the jaguar.
      const at = opts.jaguar();
      const back = added.findIndex((c) => Math.abs(c.x - at.x) + Math.abs(c.y - at.y) === 1);
      if (back < 0) return;
      trail = added.slice(back);
      blocked = false;
    } else trail.push(...added);
    schedule();
  }

  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (down.onJaguar) trail = trail.slice(0, MAX_AFTER_UP);
    else if (moved < TAP_PX && e.type === 'pointerup' && !opts.busy()) opts.tapStep(e);
    down = null;
    finger = null;
  }

  board.addEventListener('pointerdown', onDown);
  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerup', onUp);
  board.addEventListener('pointercancel', onUp); // pointercancel = pointerup

  return {
    stop() {
      clearTimeout(timer);
      timer = null;
      trail = [];
      board.removeEventListener('pointerdown', onDown);
      board.removeEventListener('pointermove', onMove);
      board.removeEventListener('pointerup', onUp);
      board.removeEventListener('pointercancel', onUp);
    },
  };
}
