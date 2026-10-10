// Le Petit Jaguar — solo mode (step J2). Walk the little jaguar through the maze to papa.
//
// Home: the path (ctx.path, new engine) — ▶ plays ROUNDS_PER_PLAY mazes at the level the
// engine picked. Fixed level map when ctx.path is null (parent switch "Carte des niveaux").
// One maze = one round = one star. Hints (hints.js): 'clue' = paw prints on the next 2
// cells of the shortest path; 'glow' = paw prints on the whole path. The 1st dead end:
// a sniff and papa's call, no hint. The round's outcome = the strongest hint shown.
//
// Landscape turns the GRID (cols ↔ rows in the layout), never the art: maze cells stay
// logical (row * cols + col); toVisual / toCell convert.
import { h } from '../../js/dom.js';
import { addStrings } from '../../js/i18n.js';
import { speak } from '../../js/audio.js';
import { outcomeOf } from '../../js/progress.js';
import { makeMaze, shortestPath, openNeighbours, ROUNDS_PER_PLAY, N, E, S, W } from './maze.js';
import { createHintTracker } from './hints.js';
import { createDrag } from './drag.js';
import { JAGUAR_SVG, PAPA_SVG } from './art.js';
import STRINGS from './strings.js';
import data from './levels.json' with { type: 'json' };

const LEVELS = data.levels;
const PAD = 8;        // board padding (px), = .jg-area padding in jaguar.css
const MIN_CELL = 40;  // floor (owner, J2: 6 rows must fit 640×360); the gate checks it (minCell)
const MAX_CELL = 96;
const HIT = 64;       // the jaguar's hit box: ≥ 64 px even on 40 px cells
const HUG_MS = 1100;  // = the jg-hug animation in jaguar.css

const PAW_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="#B8741A">
  <ellipse cx="50" cy="64" rx="20" ry="17"/><circle cx="24" cy="40" r="9"/><circle cx="41" cy="26" r="9"/>
  <circle cx="59" cy="26" r="9"/><circle cx="76" cy="40" r="9"/></g></svg>`;
const NEXT_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function loadStylesheet() {
  if (document.querySelector('link[data-game="jaguar"]')) return;
  document.head.append(h('link', {
    rel: 'stylesheet', href: new URL('./jaguar.css', import.meta.url).href, 'data-game': 'jaguar',
  }));
}

function createGame(container, ctx) {
  const { t, sfx } = ctx;
  const timers = new Set();
  let destroyed = false;
  let resizeObserver = null;
  let drag = null;
  let play = null;  // { level, index (round), mazeKey }
  let round = null; // { maze, tracker, area, board, cells, jaguar, papa, at, paws, busy, turned, cell }

  const remark = (text) => speak(text, ctx.lang);

  // setTimeout cancelled when the game closes (never requestAnimationFrame).
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }

  function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // forces the browser to notice, so the animation replays
    el.classList.add(className);
  }

  function stopInputs() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    drag?.stop();
    drag = null;
  }

  // ---------- Home: path or fixed level map ----------

  const progress = () => ({ completed: [], ...ctx.load() });

  function home() {
    if (ctx.path) showPath();
    else showLevels();
  }

  function showPath() {
    stopInputs();
    ctx.path.show(container, {
      levels: LEVELS,
      onPlay: (level) => { sfx.pop(); playLevel(level); },
      roundsPerPlay: ROUNDS_PER_PLAY,
    });
    ctx.speak(t('jaguar.path'));
  }

  function isUnlocked(index) {
    if (ctx.profile.unlockAll) return true;
    return index === 0 || progress().completed.includes(LEVELS[index - 1].id);
  }

  function showLevels() {
    stopInputs();
    const { completed } = progress();
    const buttons = LEVELS.map((level, index) => {
      const unlocked = isUnlocked(index);
      const button = h('button', {
        class: `jg-level-btn${unlocked ? '' : ' locked'}${completed.includes(level.id) ? ' done' : ''}`,
        type: 'button',
        'aria-label': t('jaguar.level', { n: level.id }),
        onclick: () => {
          if (!unlocked) { sfx.boing(); restartAnimation(button, 'jg-wiggle'); return; }
          sfx.pop();
          playLevel(level);
        },
      }, h('span', { class: 'jg-level-num' }, String(level.id)));
      return button;
    });
    container.replaceChildren(h('div', { class: 'jg-levels' }, buttons));
    ctx.speak(t('jaguar.chooseLevel'));
  }

  function levelDone() {
    stopInputs();
    const p = progress();
    if (!p.completed.includes(play.level.id)) p.completed.push(play.level.id);
    ctx.save(p);
    sfx.fanfare();
    container.replaceChildren(h('div', { class: 'jg-done' },
      h('div', { class: 'jg-done-art', html: PAPA_SVG }),
      h('button', {
        class: 'jg-continue', type: 'button', 'aria-label': t('jaguar.continue'),
        html: NEXT_SVG, onclick: () => { sfx.pop(); showLevels(); },
      }),
    ));
    ctx.speak(t('jaguar.levelDone'));
  }

  // ---------- A maze (one round) ----------

  function playLevel(level) {
    play = { level, index: 0, mazeKey: null };
    startRound();
  }

  function startRound() {
    stopInputs();
    const maze = makeMaze(play.level, Math.random, play.mazeKey);
    play.mazeKey = maze.key;
    const n = maze.cols * maze.rows;
    const cells = [];
    for (let i = 0; i < n; i++) {
      cells.push(h('div', { class: 'jg-cell', 'data-cell': String(i), 'data-walls': String(maze.walls[i]) },
        h('span', { class: 'jg-paw-art', html: PAW_SVG })));
    }
    const papa = h('div', { class: 'jg-papa', html: PAPA_SVG });
    const art = h('div', { class: 'jg-jaguar-art', html: JAGUAR_SVG });
    const jaguar = h('div', { class: 'jg-jaguar', role: 'img', 'aria-label': t('jaguar.jaguar') }, art);
    const board = h('div', {
      class: 'jg-board', 'aria-label': t('jaguar.board'),
      'data-round': String(play.index), 'data-level': String(play.level.id),
      'data-cols': String(maze.cols), 'data-rows': String(maze.rows), 'data-papa': String(maze.papa),
    }, ...cells, papa, jaguar);
    const area = h('div', { class: 'jg-area' }, board);
    round = {
      maze, tracker: createHintTracker(maze, play.level.hints), area, board, cells, jaguar, art, papa,
      at: maze.start, paws: new Set(), busy: false, turned: false, cell: MIN_CELL, sniffed: false,
    };
    container.replaceChildren(area);
    layout();
    resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(area);
    drag = createDrag(board, {
      at: (e) => pointCell(e),
      jaguar: () => toVisual(round.at),
      onJaguar: (e) => e.target === jaguar || jaguar.contains(e.target),
      tryStep: (v) => tryStep(toCell(v)),
      bump,
      tapStep,
      busy: () => round.busy,
    });
  }

  // Logical cell ↔ visual {x, y}. Turned (landscape): x = row, y = cols − 1 − col.
  function toVisual(i) {
    const { cols } = round.maze;
    const c = i % cols, r = (i - c) / cols;
    return round.turned ? { x: r, y: cols - 1 - c } : { x: c, y: r };
  }
  function toCell({ x, y }) {
    const { cols, rows } = round.maze;
    const [c, r] = round.turned ? [cols - 1 - y, x] : [x, y];
    return c >= 0 && c < cols && r >= 0 && r < rows ? r * cols + c : -1;
  }
  function pointCell(e) {
    const b = round.board.getBoundingClientRect();
    return { x: Math.floor((e.clientX - b.left) / round.cell), y: Math.floor((e.clientY - b.top) / round.cell) };
  }

  // Cell size from the area's real size; landscape turns the grid.
  function layout() {
    const r = round;
    const w = r.area.clientWidth - 2 * PAD, hgt = r.area.clientHeight - 2 * PAD;
    if (w <= 0 || hgt <= 0) return;
    r.turned = w > hgt && r.maze.rows > r.maze.cols;
    const vc = r.turned ? r.maze.rows : r.maze.cols, vr = r.turned ? r.maze.cols : r.maze.rows;
    r.cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(w / vc, hgt / vr))));
    r.board.style.width = `${vc * r.cell}px`;
    r.board.style.height = `${vr * r.cell}px`;
    r.board.style.setProperty('--cell', `${r.cell}px`);
    // Walls: logical sides → visual sides.
    const side = r.turned ? { top: E, right: S, bottom: W, left: N } : { top: N, right: E, bottom: S, left: W };
    r.cells.forEach((el, i) => {
      const v = toVisual(i), wl = r.maze.walls[i];
      el.style.left = `${v.x * r.cell}px`;
      el.style.top = `${v.y * r.cell}px`;
      el.className = 'jg-cell';
      for (const [name, bit] of Object.entries(side)) if (wl & bit) el.classList.add(`jg-w-${name}`);
      if (r.paws.has(i)) el.classList.add('jg-paw');
    });
    place(r.papa, r.maze.papa, r.cell);
    placeJaguar();
  }

  function place(el, i, size) {
    const v = toVisual(i), c = round.cell;
    el.style.width = el.style.height = `${size}px`;
    el.style.left = `${v.x * c + (c - size) / 2}px`;
    el.style.top = `${v.y * c + (c - size) / 2}px`;
  }

  // The hit box (≥ 64 px) is kept inside the area; the art stays centred on the cell.
  function placeJaguar() {
    const r = round, c = r.cell, size = Math.max(HIT, c), v = toVisual(r.at);
    const bw = r.board.offsetWidth, bh = r.board.offsetHeight;
    const clamp = (val, max) => Math.min(Math.max(val, -PAD), max + PAD - size);
    const left = clamp(v.x * c + (c - size) / 2, bw), top = clamp(v.y * c + (c - size) / 2, bh);
    Object.assign(r.jaguar.style, { width: `${size}px`, height: `${size}px`, left: `${left}px`, top: `${top}px` });
    Object.assign(r.art.style, {
      width: `${c}px`, height: `${c}px`, left: `${v.x * c - left}px`, top: `${v.y * c - top}px`,
    });
    r.jaguar.dataset.cell = String(r.at);
  }

  function bump() {
    sfx.plop(); // soft "pof"; a bump is never counted
    restartAnimation(round.art, 'jg-bump');
  }

  // One tap = one step: the tap's main direction from the jaguar's centre; if walled and
  // the other direction is ≥ ⅓ of the main one and open, that one. Else a bump.
  function tapStep(e) {
    const r = round, b = r.board.getBoundingClientRect(), v = toVisual(r.at);
    const dx = e.clientX - (b.left + (v.x + 0.5) * r.cell), dy = e.clientY - (b.top + (v.y + 0.5) * r.cell);
    const horiz = { x: v.x + Math.sign(dx), y: v.y }, vert = { x: v.x, y: v.y + Math.sign(dy) };
    const [main, other, mainLen, otherLen] = Math.abs(dx) >= Math.abs(dy)
      ? [horiz, vert, Math.abs(dx), Math.abs(dy)] : [vert, horiz, Math.abs(dy), Math.abs(dx)];
    if (mainLen > 0 && tryStep(toCell(main))) return;
    if (otherLen > 0 && otherLen >= mainLen / 3 && tryStep(toCell(other))) return;
    bump();
  }

  // Moves the jaguar to cell `to` if it is an open neighbour. → true if it moved.
  function tryStep(to) {
    const r = round;
    if (r.busy || to < 0 || !openNeighbours(r.maze, r.at).includes(to)) return false;
    r.at = to;
    placeJaguar();
    if (r.paws.delete(to)) r.cells[to].classList.remove('jg-paw');
    if (to === r.maze.papa) { hug(); return true; }
    const { newDeadEnd, hint } = r.tracker.step(to);
    if (hint === 'glow') showPaws(Infinity, newDeadEnd || r.hint !== 'glow');
    else if (hint === 'clue' && (newDeadEnd || r.hint !== 'clue')) showPaws(2, true);
    else if (newDeadEnd && !r.sniffed) {
      // 1st dead end: a sniff and papa's call, no hint.
      r.sniffed = true;
      restartAnimation(r.art, 'jg-sniff');
      restartAnimation(r.papa, 'jg-call');
      sfx.chime();
      remark(t('jaguar.sniff'));
    }
    r.hint = hint;
    return true;
  }

  // Paw prints on the next `count` cells of the shortest path from the jaguar.
  function showPaws(count, say) {
    const r = round;
    for (const i of r.paws) r.cells[i].classList.remove('jg-paw');
    r.paws = new Set(shortestPath(r.maze, r.at).slice(1, 1 + count).filter((i) => i !== r.maze.papa));
    for (const i of r.paws) restartAnimation(r.cells[i], 'jg-paw');
    if (say) { sfx.bubbles(); remark(t(count === 2 ? 'jaguar.clue' : 'jaguar.glow')); }
  }

  // Papa reached: hug, 1 star, the path records the round, then the next maze.
  function hug() {
    const r = round;
    r.busy = true;
    r.board.dataset.busy = '1';
    for (const i of r.paws) r.cells[i].classList.remove('jg-paw');
    r.jaguar.classList.add('jg-hugging');
    r.papa.classList.add('jg-hug');
    sfx.fanfare();
    remark(t('jaguar.hug'));
    later(roundDone, HUG_MS);
  }

  async function roundDone() {
    stopInputs();
    const reward = ctx.rewards.star(round.papa);
    ctx.path?.record(play.level, outcomeOf(round.tracker.strongest()), LEVELS);
    if (reward) await ctx.rewards.showSticker(reward);
    if (destroyed) return;
    play.index++;
    if (play.index < ROUNDS_PER_PLAY) startRound();
    else if (ctx.path) showPath();
    else levelDone();
  }

  return {
    start: home,
    destroy() {
      destroyed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      stopInputs();
      container.replaceChildren();
    },
  };
}

let current = null;

export default {
  mount(container, ctx) {
    addStrings(STRINGS);
    loadStylesheet();
    current = createGame(container, ctx);
    current.start();
  },
  unmount() {
    current?.destroy();
    current = null;
  },
};
