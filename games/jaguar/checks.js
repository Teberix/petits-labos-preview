// Dev-only (never precached): Le Petit Jaguar's worst-case screens for tools/check-layout.mjs
// and its offline interaction for tools/check-offline.mjs. See tools/check-kit.mjs.
// The board carries its maze (data-cols, data-papa, each cell's data-walls), so a check
// finds its way without looking at the art. Moves = taps on the next cell (one tap = one step).

const store = (page, fn, arg) => page.evaluate(([src, a]) => {
  const data = JSON.parse(localStorage.getItem('petits-labos'));
  new Function('p', 'a', src)(data.profiles[0], a);
  localStorage.setItem('petits-labos', JSON.stringify(data));
}, [fn, arg]);

async function setSkill(page, skill) {
  await page.waitForSelector('.profile-tile');
  await store(page, 'p.fixedMap = false; p.skills ??= {}; if (a === null) delete p.skills.jaguar; else p.skills.jaguar = { skill: a };', skill);
  await page.reload();
}

const savedSkill = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('petits-labos')).profiles[0].skills?.jaguar?.skill);
const savedStars = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('petits-labos')).profiles[0].rewards.stars);

async function openPath(page, kit) {
  await kit.openGame(page, 'jaguar');
  await page.locator('.path-play').waitFor({ timeout: 30_000 });
  await kit.settle(page);
}

async function waitBoard(page, kit, round = null) {
  await page.waitForFunction((r) => {
    const b = document.querySelector('.jg-board');
    return b && !b.dataset.busy && b.offsetWidth > 0 && (r === null || b.dataset.round === String(r));
  }, round, { timeout: 30_000 });
  await kit.settle(page);
}

async function openLevel(page, kit, id) {
  await page.waitForSelector('.profile-tile');
  await store(page, 'p.fixedMap = true; p.unlockAll = true;', null);
  await page.reload();
  await kit.openGame(page, 'jaguar');
  await page.locator('.jg-level-btn').first().waitFor({ timeout: 30_000 });
  await kit.tap(page, page.locator('.jg-level-btn').nth(id - 1));
  await waitBoard(page, kit);
}

// The maze on screen + BFS distances from `from` (papa's cell is blocked unless it is the goal).
const mazeState = (page) => page.evaluate(() => {
  const b = document.querySelector('.jg-board');
  const walls = [...document.querySelectorAll('.jg-cell')].map((el) => Number(el.dataset.walls));
  return {
    cols: Number(b.dataset.cols), rows: Number(b.dataset.rows), papa: Number(b.dataset.papa), walls,
    at: Number(document.querySelector('.jg-jaguar').dataset.cell),
  };
});
function neighbours(m, i) {
  const c = i % m.cols, r = (i - c) / m.cols, out = [];
  if (!(m.walls[i] & 1) && r > 0) out.push(i - m.cols);
  if (!(m.walls[i] & 2) && c < m.cols - 1) out.push(i + 1);
  if (!(m.walls[i] & 4) && r < m.rows - 1) out.push(i + m.cols);
  if (!(m.walls[i] & 8) && c > 0) out.push(i - 1);
  return out;
}
function route(m, from, to) {
  const prev = new Map([[from, -1]]), queue = [from];
  while (queue.length) {
    const i = queue.shift();
    if (i === to) break;
    for (const n of neighbours(m, i)) {
      if (prev.has(n) || (n === m.papa && n !== to)) continue;
      prev.set(n, i);
      queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const path = [];
  for (let i = to; i !== from; i = prev.get(i)) path.unshift(i);
  return path;
}

// One tap on the centre of each next cell; waits for the jaguar to stand there.
async function walk(page, cells) {
  for (const cell of cells) {
    const box = await page.locator(`.jg-cell[data-cell="${cell}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction((c) => document.querySelector('.jg-jaguar')?.dataset.cell === String(c)
      || document.querySelector('.jg-board')?.dataset.busy, cell, { timeout: 10_000 });
    // Let the 70 ms slide end: going back, the sliding hit box still covers the next cell,
    // and a tap on the jaguar is not a step.
    await page.waitForTimeout(120);
  }
}

// Enters `count` dead ends (nearest first, never through papa), stays at the last one.
async function enterDeadEnds(page, count) {
  const m = await mazeState(page);
  const dead = m.walls.map((_, i) => i).filter((i) => i !== m.papa && i !== m.at && neighbours(m, i).length === 1);
  let at = m.at;
  for (let k = 0; k < count; k++) {
    const options = dead.map((d) => route(m, at, d)).filter(Boolean).sort((a, b) => a.length - b.length);
    if (!options.length) throw new Error(`only ${k} dead ends reachable, need ${count}`);
    const path = options[0];
    await walk(page, path);
    at = path[path.length - 1];
    dead.splice(dead.indexOf(at), 1);
  }
}

async function toPapa(page) {
  const m = await mazeState(page);
  await walk(page, route(m, m.at, m.papa));
}

// INSIDE-THE-EDGES: every cell and papa inside the board and the viewport; the jaguar's
// hit box inside the game area and the viewport.
async function inside(page) {
  const bad = await page.evaluate(() => {
    const e = 0.5, out = [];
    const within = (r, b) => r.left >= b.left - e && r.top >= b.top - e && r.right <= b.right + e && r.bottom <= b.bottom + e;
    const view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const board = document.querySelector('.jg-board').getBoundingClientRect();
    const area = document.querySelector('.jg-area').getBoundingClientRect();
    document.querySelectorAll('.jg-cell').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (!within(r, view) || !within(r, board)) out.push(`cell ${i}`);
    });
    const papa = document.querySelector('.jg-papa').getBoundingClientRect();
    if (!within(papa, view) || !within(papa, board)) out.push('papa');
    const jag = document.querySelector('.jg-jaguar').getBoundingClientRect();
    if (!within(jag, view) || !within(jag, area)) out.push('jaguar');
    return out;
  });
  if (bad.length) throw new Error(`outside: ${bad.join(', ')}`);
}

const paws = (page) => page.evaluate(() => document.querySelectorAll('.jg-cell.jg-paw').length);

// A ▶ from `skill`: 2 mazes, each with `deadEnds` dead ends entered → the skill must be `expected`.
async function playPath(page, kit, skill, deadEnds, expected, label) {
  await setSkill(page, skill);
  await openPath(page, kit);
  await kit.tap(page, page.locator('.path-play'));
  for (let r = 0; r < 2; r++) {
    await waitBoard(page, kit, r);
    if (deadEnds) await enterDeadEnds(page, deadEnds);
    await toPapa(page);
  }
  await page.locator('.path-play').waitFor({ timeout: 30_000 });
  const got = await savedSkill(page);
  if (got !== expected) throw new Error(`${label}: skill is ${got}, expected ${expected}`);
}

const boardCase = (id) => ({
  name: `step ${id} board`,
  async setup(page, kit) { await openLevel(page, kit, id); await inside(page); },
});

export default {
  touch: ['.jg-jaguar', '.jg-level-btn', '.jg-continue', '.path-play'],
  cells: '.jg-cell, .path-play', // (the path screen has no cells: its button stands in)
  minCell: 40, // touch-target exception: cells are not touch targets (games/jaguar/CLAUDE.md)

  worstCases: [
    { name: 'path screen', async setup(page, kit) { await openPath(page, kit); } },
    boardCase(1),
    boardCase(5),
    boardCase(8),
    {
      name: "step 4, 'clue' (3 dead ends: paw prints on the next 2 cells)",
      async setup(page, kit) {
        await openLevel(page, kit, 4);
        await enterDeadEnds(page, 3);
        const n = await paws(page);
        if (n < 1 || n > 2) throw new Error(`${n} paw prints, expected 1–2`);
        await inside(page);
      },
    },
    {
      name: "step 4, 'glow' (5 dead ends: paw prints on the whole path)",
      async setup(page, kit) {
        await openLevel(page, kit, 4);
        await enterDeadEnds(page, 5);
        const m = await mazeState(page);
        const want = route(m, m.at, m.papa).length - 1;
        const n = await paws(page);
        if (n !== want) throw new Error(`${n} paw prints, expected ${want} (the whole path)`);
        await inside(page);
      },
    },
    {
      once: true, // behaviour check: 1 size
      name: 'path a: clean ▶ from skill 1 → skill 2',
      async setup(page, kit) { await playPath(page, kit, null, 0, 2, 'clean ▶'); },
    },
    {
      once: true, // behaviour check: 1 size
      name: "path b: 3 dead ends per maze from skill 4 (clue threshold 3) → skill stays 4",
      async setup(page, kit) { await playPath(page, kit, 4, 3, 4, 'step 4 clue'); },
    },
    {
      once: true, // behaviour check: 1 size
      name: "path c: 3 dead ends per maze from skill 6 (clue threshold 4) → skill 7",
      async setup(page, kit) { await playPath(page, kit, 6, 3, 7, 'step 6 none'); },
    },
  ],

  // Offline: ▶ from a fresh path → one step-1 maze walked to papa → one more star.
  async offline(page, kit) {
    await setSkill(page, null);
    await openPath(page, kit);
    const before = await savedStars(page);
    await kit.tap(page, page.locator('.path-play'));
    await waitBoard(page, kit, 0);
    await toPapa(page);
    await page.waitForFunction((s) =>
      JSON.parse(localStorage.getItem('petits-labos')).profiles[0].rewards.stars === s + 1,
    before, { timeout: 10_000 });
  },
};
