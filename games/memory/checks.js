// Dev-only (never precached): Duo Mémoire's worst-case screens for tools/check-layout.mjs
// and its offline interaction for tools/check-offline.mjs. See tools/check-kit.mjs.
// Cards carry data-face, so a check knows the board without looking at the art.

const store = (page, fn, arg) => page.evaluate(([src, a]) => {
  const data = JSON.parse(localStorage.getItem('petits-labos'));
  new Function('p', 'a', src)(data.profiles[0], a);
  localStorage.setItem('petits-labos', JSON.stringify(data));
}, [fn, arg]);

// The saved path skill (null = fresh), then a reload (the app reads the save at start).
async function setSkill(page, skill) {
  await page.waitForSelector('.profile-tile');
  await store(page, 'p.fixedMap = false; p.skills ??= {}; if (a === null) delete p.skills.memory; else p.skills.memory = { skill: a };', skill);
  await page.reload();
}

const savedSkill = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('petits-labos')).profiles[0].skills?.memory?.skill);
const savedStars = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('petits-labos')).profiles[0].rewards.stars);

async function openPath(page, kit) {
  await kit.openGame(page, 'memory');
  await page.locator('.path-play').waitFor({ timeout: 30_000 });
  await kit.settle(page);
}

async function waitBoard(page, kit, round = null) {
  await page.waitForFunction((r) => {
    const b = document.querySelector('.mem-board');
    return b && getComputedStyle(b).display === 'grid' && (r === null || b.dataset.round === String(r));
  }, round, { timeout: 30_000 });
  await kit.settle(page);
}

// A level from the fixed map, every level unlocked (parent switches).
async function openLevel(page, kit, id) {
  await page.waitForSelector('.profile-tile');
  await store(page, 'p.fixedMap = true; p.unlockAll = true;', null);
  await page.reload();
  await kit.openGame(page, 'memory');
  await page.waitForFunction(() => {
    const map = document.querySelector('.mem-levels');
    return map && getComputedStyle(map).display === 'flex';
  }, null, { timeout: 30_000 });
  await kit.tap(page, page.locator('.mem-level-btn').nth(id - 1));
  await waitBoard(page, kit);
}

const faces = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.mem-card')].map((el) => el.dataset.face));
const card = (page, i) => page.locator(`.mem-card[data-index="${i}"]`);

// Two taps, then wait until the board takes taps again (a miss turns both cards back).
async function pair(page, kit, a, b) {
  await kit.tap(page, card(page, a));
  await kit.tap(page, card(page, b));
  await page.waitForFunction(() => {
    const b = document.querySelector('.mem-board');
    return !b || !b.dataset.busy;
  }, null, { timeout: 30_000 }); // the duo's last pair waits for 2 world-gift reveals (5 s each)
}

// Pairs: [[i, j], …] by face, in board order.
function pairsOf(list) {
  const byFace = new Map();
  list.forEach((f, i) => byFace.set(f, [...(byFace.get(f) ?? []), i]));
  return [...byFace.values()];
}

// Solves the board on screen, skipping the matched cards.
async function solveBoard(page, kit) {
  const matched = await page.evaluate(() =>
    [...document.querySelectorAll('.mem-card.is-matched')].map((el) => Number(el.dataset.index)));
  for (const [a, b] of pairsOf(await faces(page))) {
    if (!matched.includes(a)) await pair(page, kit, a, b);
  }
}

// `misses(pairs)` = the missed known matches to make before solving: a list of
// [pairIndex, count]. Each miss: the pair's 2nd card, then a card of another pair.
async function playRound(page, kit, misses = []) {
  const pairs = pairsOf(await faces(page));
  // The wrong 2nd card: a card of a pair with no misses to make (never the twin).
  const free = pairs.find((_, j) => !misses.some(([m]) => m === j));
  const other = () => free[0];
  for (const [k] of misses) await pair(page, kit, pairs[k][0], other(k)); // A seen, no miss yet
  for (const [k, count] of misses) {
    for (let n = 0; n < count; n++) await pair(page, kit, pairs[k][1], other(k));
  }
  await solveBoard(page, kit);
}

// A ▶ from `skill`: 2 rounds with these misses each → the saved skill must be `expected`.
async function playPath(page, kit, skill, misses, expected, label) {
  await setSkill(page, skill);
  await openPath(page, kit);
  await kit.tap(page, page.locator('.path-play'));
  for (let r = 0; r < 2; r++) {
    await waitBoard(page, kit, r);
    await playRound(page, kit, misses);
  }
  await page.locator('.path-play').waitFor({ timeout: 30_000 });
  const got = await savedSkill(page);
  if (got !== expected) throw new Error(`${label}: skill is ${got}, expected ${expected}`);
}

// INSIDE-THE-EDGES: every card box fully inside the viewport and the board.
async function cardsInside(page) {
  const bad = await page.evaluate(() => {
    const b = document.querySelector('.mem-board').getBoundingClientRect();
    const out = [];
    document.querySelectorAll('.mem-card').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const e = 0.5;
      if (r.left < -e || r.top < -e || r.right > innerWidth + e || r.bottom > innerHeight + e) out.push(`${i} (viewport)`);
      else if (r.left < b.left - e || r.top < b.top - e || r.right > b.right + e || r.bottom > b.bottom + e) out.push(`${i} (board)`);
    });
    return out;
  });
  if (bad.length) throw new Error(`cards outside: ${bad.join(', ')}`);
}

async function expectHint(page, cls) {
  const state = await page.evaluate((c) => [...document.querySelectorAll(`.mem-card.${c}`)]
    .map((el) => el.classList.contains('is-up')), cls);
  if (state.length !== 1) throw new Error(`${state.length} cards with ${cls}, expected 1`);
  if (state[0]) throw new Error(`the ${cls} card is face up`);
}

// ---------- Duo ----------

const allStars = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('petits-labos')).profiles.map((p) => p.rewards.stars));

// Reset the opener (path on, memory skill = `skill`), add a 2nd test profile if the kit
// has only one (a fake player: never a real name), then open the duo pick screen.
async function openDuo(page, kit, skill = null) {
  await page.waitForSelector('.profile-tile');
  await page.evaluate(async () => {
    const s = await import('./js/storage.js');
    if (s.getProfiles().length < 2) s.addProfile({ name: 'Duo', avatar: '🦊', readingLang: 'fr' });
  });
  await setSkill(page, skill);
  await openPath(page, kit);
  await kit.tap(page, page.locator('.path-free'));
  await page.locator('.mem-pick-play').waitFor({ timeout: 30_000 });
  await kit.settle(page);
}

async function startDuo(page, kit, skill = null) {
  await openDuo(page, kit, skill);
  await kit.tap(page, page.locator('.mem-pick-btn:not(.is-opener)').first());
  await kit.tap(page, page.locator('.mem-pick-play'));
  await waitBoard(page, kit);
  const n = (await faces(page)).length;
  if (n !== 16) throw new Error(`duo: ${n} cards, expected 16`);
}

// INSIDE-THE-EDGES for both player panels.
async function panelsInside(page) {
  const bad = await page.evaluate(() => [...document.querySelectorAll('.mem-panel')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width === 0 || r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5;
  }).length);
  if (bad) throw new Error(`${bad} player panel(s) outside the screen`);
}

// Plays the duo board to the end (closing every reward reveal) → the party screen.
async function playDuo(page, kit) {
  await solveBoard(page, kit);
  for (let n = 0; n < 40; n++) {
    if (await page.locator('.mem-party').count()) break;
    const reveal = page.locator('.sticker-overlay');
    if (await reveal.count()) await kit.tap(page, reveal.first());
    await kit.wait(page, 500);
  }
  await page.locator('.mem-party').waitFor({ timeout: 30_000 });
  await kit.settle(page);
}

const boardCase = (id, pairs) => ({
  name: `step ${id} board (${pairs} pairs)`,
  async setup(page, kit) {
    await openLevel(page, kit, id);
    const n = (await faces(page)).length;
    if (n !== 2 * pairs) throw new Error(`${n} cards, expected ${2 * pairs}`);
    await cardsInside(page);
  },
});

export default {
  touch: ['.mem-card', '.mem-level-btn', '.mem-continue', '.path-play', '.path-free',
    '.mem-duo-btn', '.mem-pick-btn', '.mem-pick-play', '.mem-party-btn'],
  cells: '.mem-card, .path-play, .mem-pick-btn, .mem-party-btn', // (screens with no cards: their buttons stand in)
  minCell: 64,

  worstCases: [
    { name: 'path screen', async setup(page, kit) { await openPath(page, kit); } },
    boardCase(1, 3),
    boardCase(5, 6),
    boardCase(8, 12),
    {
      name: "step 1, 'clue' (2 misses on one pair: its twin wiggles face down)",
      async setup(page, kit) {
        await openLevel(page, kit, 1);
        const pairs = pairsOf(await faces(page));
        await pair(page, kit, pairs[0][0], pairs[1][0]);
        for (let n = 0; n < 2; n++) await pair(page, kit, pairs[0][1], pairs[1][0]);
        await expectHint(page, 'mem-clue');
        await kit.settle(page);
        await cardsInside(page);
      },
    },
    {
      name: "step 1, 'glow' (3 misses on one pair: its twin glows face down)",
      async setup(page, kit) {
        await openLevel(page, kit, 1);
        const pairs = pairsOf(await faces(page));
        await pair(page, kit, pairs[0][0], pairs[1][0]);
        for (let n = 0; n < 3; n++) await pair(page, kit, pairs[0][1], pairs[1][0]);
        await expectHint(page, 'mem-glow');
        await cardsInside(page);
      },
    },
    { name: 'duo: pick screen', async setup(page, kit) { await openDuo(page, kit); } },
    {
      name: 'duo: board (8 pairs, 2 panels)',
      async setup(page, kit) {
        await startDuo(page, kit);
        await cardsInside(page);
        await panelsInside(page);
      },
    },
    {
      // One duo play to the end: +2 stars for EACH profile, the opener's skill unchanged.
      once: true, // behaviour check: 1 size
      name: 'duo: play to the end → party screen, +2 stars each, skill unchanged',
      async setup(page, kit) {
        await page.waitForSelector('.profile-tile');
        await startDuo(page, kit, 3);
        const before = await allStars(page);
        await playDuo(page, kit);
        const after = await allStars(page);
        const gained = after.map((s, i) => s - before[i]);
        if (gained.length < 2 || gained[0] !== 2 || gained[1] !== 2) throw new Error(`duo stars gained: ${gained}, expected 2,2`);
        const skill = await savedSkill(page);
        if (skill !== 3) throw new Error(`duo changed the skill: ${skill}, expected 3`);
      },
    },
    {
      // Leaving during the 1st reveal must not lose a star: both profiles still get +2.
      once: true, // behaviour check: 1 size
      name: 'duo: leave during the 1st reveal → both profiles still +2 stars',
      async setup(page, kit) {
        await page.waitForSelector('.profile-tile');
        await startDuo(page, kit, 3);
        // Player 1's next star earns a reward → the 1st reveal opens.
        await page.evaluate(async () => {
          const s = await import('./js/storage.js');
          const id = s.getProfiles()[0].id;
          const r = s.getRewards(id);
          s.setRewards(id, { ...r, stars: r.nextAt - 1 });
        });
        const before = await allStars(page);
        // The reveal closes by itself after 5 s: wait for it while the board is solved.
        const opened = page.locator('.sticker-overlay').first().waitFor({ timeout: 60_000 });
        await solveBoard(page, kit);
        await opened;
        await page.locator('.top-bar button').first().evaluate((b) => b.click()); // the home button (a reveal covers it)
        await kit.wait(page, 500);
        const gained = (await allStars(page)).map((s, i) => s - before[i]);
        if (gained.length < 2 || gained[0] !== 2 || gained[1] !== 2) throw new Error(`stars after leaving: ${gained}, expected 2,2`);
        await page.reload(); // back to the profiles screen, then a screen the layout checks can measure
        await openDuo(page, kit, 3);
      },
    },
    {
      once: true, // behaviour check: 1 size
      name: 'path a: clean ▶ from skill 1 → skill 2',
      async setup(page, kit) { await playPath(page, kit, null, [], 2, 'clean ▶'); },
    },
    {
      // Strongest hint, not the sum: 2 misses on ONE pair = 'clue' → skill stays.
      once: true, // behaviour check: 1 size
      name: "path b: 2 misses on the same pair per round → 'clue', skill stays 2",
      async setup(page, kit) { await playPath(page, kit, 2, [[0, 2]], 2, 'same pair'); },
    },
    {
      // 1 miss on each of 2 pairs = 'none' per pair → skill goes up.
      once: true, // behaviour check: 1 size
      name: "path c: 1 miss on 2 different pairs per round → 'none', skill 3",
      async setup(page, kit) { await playPath(page, kit, 2, [[0, 1], [1, 1]], 3, 'two pairs'); },
    },
  ],

  // Offline: ▶ from a fresh path → one step-1 board to the end → one more star.
  async offline(page, kit) {
    // earlier games' offline checks leave fixedMap on (shared profile): back to the path, step 1
    await setSkill(page, null);
    await openPath(page, kit);
    const before = await savedStars(page);
    await kit.tap(page, page.locator('.path-play'));
    await waitBoard(page, kit, 0);
    const n = (await faces(page)).length;
    if (n !== 6) throw new Error(`step 1: ${n} cards, expected 6`);
    await playRound(page, kit);
    await page.waitForFunction((s) =>
      JSON.parse(localStorage.getItem('petits-labos')).profiles[0].rewards.stars === s + 1,
    before, { timeout: 10_000 });
  },
};
