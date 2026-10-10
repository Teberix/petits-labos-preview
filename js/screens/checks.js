// Dev-only (never precached: tools/precache.mjs skips every checks.js): the shared
// screens' worst cases for tools/check-layout.mjs — album, "Mes mondes", a free world,
// the reward reveals, the parent reset confirm (owner, 2026-10-05: shared screens must be
// in the gate). Same format as a
// game's checks.js (see tools/check-kit.mjs); run for the whole app, not with --game.
// Starts on the profiles screen with the check's test profile.
import { STICKERS } from '../stickers.js';
import { ITEMS, PACKS, START_WORLD } from '../items.js';
import { addStrings } from '../i18n.js';

// A fake square pack (c3, owner 2026-10-05: new packs are 160 × 160): never shipped, not
// in scenes/registry.js. The meadow's first 3 items on a plain square background, ground
// from y ≈ 95. Also checked by tests/packs.test.mjs (any size must pass).
const MEADOW = PACKS[0];
const SQUARE_ITEMS = MEADOW.items.slice(0, 3);
export const SQUARE_PACK = {
  id: 'squarecheck',
  kind: 'free',
  size: [160, 160],
  ground: 0.45,
  background: `
    <rect width="160" height="160" fill="#BFE6FF"/>
    <path d="M0 76Q40 62 80 73T160 69V160H0Z" fill="#9BD07A"/>
    <path d="M0 100Q50 89 100 100T160 97V160H0Z" fill="#7CB342"/>`,
  items: SQUARE_ITEMS,
  strings: Object.fromEntries(Object.entries(MEADOW.strings).map(([lang, d]) => [lang,
    { title: `${d.title} ■`, ...Object.fromEntries(SQUARE_ITEMS.map((i) => [`item.${i.id}`, d[`item.${i.id}`]])) }])),
};

// Adds the square pack to the running app (like js/items.js does for a real pack).
export function installSquarePack() {
  if (PACKS.includes(SQUARE_PACK)) return;
  const p = SQUARE_PACK;
  PACKS.push(p);
  ITEMS.push(...p.items.map((i) => ({ ...i, id: `${p.id}.${i.id}`, world: p.id })));
  const strings = {};
  for (const [lang, d] of Object.entries(p.strings)) {
    strings[lang] = { [`world.${p.id}`]: d.title };
    for (const i of p.items) strings[lang][`item.${p.id}.${i.id}`] = d[`item.${i.id}`];
  }
  addStrings(strings);
}

// Rewrites the test profile's save (schema 4: rewards, collection, worlds — the start
// world), then reloads (the app reads it at start).
// `square`: also the fake square world, unlocked, with its 3 items and `placed` of them.
async function seed(page, { stars = 0, stickers = 0, items = 0, placed = 0, news = false, square = false }) {
  await page.waitForSelector('.profile-tile');
  await page.evaluate(({ stars, stickers, items, placed, news, world, square }) => {
    const data = JSON.parse(localStorage.getItem('petits-labos'));
    const p = data.profiles[0];
    p.rewards = { stars, stickers };
    p.collection = { items, nextAt: stars + 5, news: news ? [items.at(-1)] : [] };
    // placed: spread over the ground, overlapping like a child's busy world
    const spots = Array.from({ length: placed }, (_, i) => ({ id: items[i % items.length], x: 0.08 + (i % 10) * 0.094, y: 0.62 + Math.floor(i / 10) * 0.17 }));
    p.worlds = { unlocked: [world], [world]: { placed: spots } };
    if (square) {
      p.collection.items.push(...square.items);
      p.worlds.unlocked.push(square.id);
      p.worlds[square.id] = { placed: spots.map((s, i) => ({ ...s, id: square.items[i % square.items.length] })) };
    }
    localStorage.setItem('petits-labos', JSON.stringify(data));
  }, {
    world: START_WORLD,
    stars,
    stickers: STICKERS.slice(0, stickers).map((s) => s.id),
    items: ITEMS.filter((i) => i.world === START_WORLD).slice(0, items).map((i) => i.id),
    placed,
    news,
    square: square && { id: SQUARE_PACK.id, items: SQUARE_PACK.items.map((i) => `${SQUARE_PACK.id}.${i.id}`) },
  });
  await page.reload();
  await page.waitForSelector('.profile-tile');
  if (square) await page.evaluate(async () => (await import('./js/screens/checks.js')).installSquarePack());
}

async function openAlbum(page, kit) {
  await kit.tap(page, page.locator('.profile-tile').first());
  await kit.tap(page, page.locator('.album-btn'));
  await page.waitForSelector('.sticker-grid');
}

async function openWorlds(page, kit) {
  await openAlbum(page, kit);
  await kit.tap(page, page.locator('.worlds-btn'));
  await page.waitForSelector('.world-tile');
}

async function openStartWorld(page, kit, world = START_WORLD) {
  await openWorlds(page, kit);
  await kit.tap(page, page.locator(`.world-tile[data-world="${world}"]`));
  await page.waitForSelector('.scene-view');
}

// The full-screen reveal of a reward, over the hub (`unlocked`: a new world's gift).
async function reveal(page, kit, kind, unlocked) {
  await kit.tap(page, page.locator('.profile-tile').first());
  await page.waitForSelector('.game-tile');
  await page.evaluate(async ({ kind, unlocked }) => {
    if (unlocked === 'squarecheck') (await import('./js/screens/checks.js')).installSquarePack();
    const r = await import('./js/rewards.js');
    const list = kind === 'item' ? (await import('./js/items.js')).ITEMS : (await import('./js/stickers.js')).STICKERS;
    r.showSticker({ kind, ...list[0], ...(unlocked ? { unlocked } : {}) });
  }, { kind, unlocked });
  await page.waitForSelector('.sticker-overlay');
}

// The parent screen (the 3 s hold on the gate button), then the reset confirm of `which`.
async function resetConfirm(page, kit, which) {
  await kit.tap(page, page.locator('.profile-tile').first());
  await passGate(page);
  if (which === 'profile') {
    await kit.tap(page, page.locator('.profile-row .btn').first());
    await kit.tap(page, page.locator('.reset-btn'));
  } else {
    await kit.tap(page, page.locator('.reset-all-btn'));
  }
  await page.waitForSelector('.confirm-reset-btn');
}

// A fake game on the path (no real game opts in yet, c2): added to the registry in the
// page, with `rounds` stones already played. Leaves the app on the hub.
async function fakePathGame(page, kit, rounds = 0) {
  await kit.tap(page, page.locator('.profile-tile').first());
  await page.waitForSelector('.game-tile');
  await page.evaluate(async (rounds) => {
    const { GAMES } = await import('./games/registry.js');
    const s = await import('./js/storage.js');
    if (rounds) s.setSkill(s.getProfiles()[0].id, 'pathcheck', { skill: 1, best: 1, rounds, seen: [] });
    const levels = [{ id: 1, difficulty: 1 }];
    const game = { mount(stage, ctx) { ctx.path.show(stage, { levels, onPlay() {}, onFree() {}, roundsPerPlay: 1 }); }, unmount() {} };
    GAMES.push({ id: 'pathcheck', titleKey: 'parentTitle', path: true, load: async () => ({ default: game }) });
  }, rounds);
}

// The parent screen, through the 3 s gate (from the hub).
async function openParent(page) {
  await passGate(page);
}

// Type `digits` on the gate keypad (a key press = a click on the button).
async function typeKeys(page, digits) {
  for (const d of digits) await page.locator(`.pg-key[data-key="${d}"]`).dispatchEvent('click');
}

// Hold the gate button 3 s, wait for the question, then solve it. The answer is NOT in
// the DOM: read a and b from the question text ("23 × 7 = ?") and multiply here.
async function passGate(page) {
  await page.waitForSelector('.gate-btn');
  await page.locator('.gate-btn').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
  await page.waitForSelector('.pg-question', { timeout: 8000 });
  const [, a, b] = (await page.locator('.pg-question').textContent()).match(/(\d+)\s*×\s*(\d+)/);
  await typeKeys(page, String(a * b));
  await page.locator('.pg-key[data-key="ok"]').dispatchEvent('click');
  await page.waitForSelector('.parent-body', { timeout: 8000 });
}

export default {
  // (placed meadow items may overlap each other by design: not listed; their 64px
  // minimum is CSS, min-width on .scene-item)
  touch: ['.path-play', '.path-free', 'button.sticker-spot', '.scene-card', '.game-tile', 'button.world-tile', '.parent-body .btn', '.pg-key', '.pg-cancel'],
  worstCases: [
    // The hub and the album are lists: on a phone they scroll down (pageScroll).
    { name: 'hub, album button wiggling (new item)', pageScroll: true, async setup(page, kit) {
      await seed(page, { stars: 12, stickers: 1, items: 1, news: true });
      await kit.tap(page, page.locator('.profile-tile').first());
      await page.waitForSelector('.album-btn.nudge');
    } },
    { name: 'album, empty (bar at the start)', pageScroll: true, async setup(page, kit) {
      await seed(page, {});
      await openAlbum(page, kit);
    } },
    { name: 'album, every sticker + worlds button wiggling', pageScroll: true, async setup(page, kit) {
      await seed(page, { stars: 640, stickers: STICKERS.length, items: ITEMS.length, news: true });
      await openAlbum(page, kit);
      await page.waitForSelector('.worlds-btn.nudge');
    } },
    { name: 'worlds grid, a world wiggling (new item)', pageScroll: true, async setup(page, kit) {
      await seed(page, { stars: 12, stickers: 1, items: 1, news: true });
      await openWorlds(page, kit);
      await page.waitForSelector('.world-tile.nudge');
    } },
    { name: 'free world, empty (no treasure yet)', async setup(page, kit) {
      await seed(page, {});
      await openStartWorld(page, kit);
      await page.waitForSelector('.scene-empty');
    } },
    { name: 'free world, full: 30 placed, every item in the tray', async setup(page, kit) {
      await seed(page, { stars: 640, stickers: STICKERS.length, items: ITEMS.length, placed: 30 });
      await openStartWorld(page, kit);
      if (await page.locator('.scene-item').count() !== 30) throw new Error('expected 30 placed items');
    } },
    // 2c (owner, 2026-10-05): how much of the free height the empty world uses, printed
    // at 360×640 only (information, never a failure).
    { name: 'free world, empty: space used (printed at 360x640)', async setup(page, kit) {
      await seed(page, {});
      await openStartWorld(page, kit);
      const vp = page.viewportSize();
      if (vp.width !== 360 || vp.height !== 640) return;
      const m = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { scene: r('.scene-view').height, stage: r('.scene-stage').height, body: r('.scene-body').height, tray: r('.scene-tray').height };
      });
      console.log(`  2c free world 360x640: scene ${m.scene.toFixed(0)}px / free (stage) ${m.stage.toFixed(0)}px = ${(m.scene / m.stage * 100).toFixed(0)} %; body ${m.body.toFixed(0)}px, tray ${m.tray.toFixed(0)}px`);
    } },
    // c3 (owner, 2026-10-05): the same numbers for the fake square pack (160 × 160).
    { name: 'free world, square pack (fake), nothing placed: space used (printed at 360x640)', async setup(page, kit) {
      await seed(page, { square: true });
      await openStartWorld(page, kit, SQUARE_PACK.id);
      const vp = page.viewportSize();
      if (vp.width !== 360 || vp.height !== 640) return;
      const m = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { w: r('.scene-view').width, scene: r('.scene-view').height, stage: r('.scene-stage').height, body: r('.scene-body').height, tray: r('.scene-tray').height };
      });
      console.log(`  c3 square world 360x640: scene ${m.w.toFixed(0)}x${m.scene.toFixed(0)}px / free (stage) ${m.stage.toFixed(0)}px = ${(m.scene / m.stage * 100).toFixed(0)} %; body ${m.body.toFixed(0)}px, tray ${m.tray.toFixed(0)}px`);
    } },
    { name: 'free world, square pack (fake): 30 placed, its 3 items in the tray', async setup(page, kit) {
      await seed(page, { stars: 20, items: 1, placed: 30, square: true });
      await openStartWorld(page, kit, SQUARE_PACK.id);
      if (await page.locator('.scene-item').count() !== 30) throw new Error('expected 30 placed items');
    } },
    // The path screen (js/path.js) with a fake game: a new player, then a long path.
    { name: 'path, new player: play + free mode', async setup(page, kit) {
      await fakePathGame(page, kit, 0);
      await kit.tap(page, page.locator('.album-btn'));
      await kit.tap(page, page.locator('.top-bar button').first());
      await kit.tap(page, page.locator('.game-tile').last());
      await page.waitForSelector('.path-play');
    } },
    { name: 'path, 60 rounds played (stones)', async setup(page, kit) {
      await fakePathGame(page, kit, 60);
      await kit.tap(page, page.locator('.album-btn'));
      await kit.tap(page, page.locator('.top-bar button').first());
      await kit.tap(page, page.locator('.game-tile').last());
      await page.waitForSelector('.path-stone');
    } },
    // The parent gate, step 2: question + keypad, a 3-digit answer typed and the "wrong" message.
    { name: 'parent gate, keypad: 3 digits typed + wrong-answer message', async setup(page, kit) {
      await kit.tap(page, page.locator('.profile-tile').first());
      await page.waitForSelector('.gate-btn');
      await page.locator('.gate-btn').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
      await page.waitForSelector('.pg-question', { timeout: 8000 });
      await typeKeys(page, '999'); // never right (max answer is 261)
      await page.locator('.pg-key[data-key="ok"]').dispatchEvent('click');
      await typeKeys(page, '999');
      await page.waitForFunction(() => document.querySelector('.pg-msg')?.textContent);
    } },
    { name: 'parent, edit profile: level map switch + reset difficulty', pageScroll: true, async setup(page, kit) {
      await fakePathGame(page, kit, 5);
      await openParent(page);
      await kit.tap(page, page.locator('.profile-row .btn').first());
      await page.waitForSelector('.reset-skill-btn');
    } },
    { name: 'parent, Save card: kept saves + update backups', pageScroll: true, async setup(page, kit) {
      await page.waitForSelector('.profile-tile');
      await page.evaluate(() => {
        const raw = localStorage.getItem('petits-labos');
        const now = Date.now();
        for (const label of ['v1', 'v2', `before-reset-${now - 3600e3}`, `before-restore-${now - 60e3}`]) {
          localStorage.setItem(`petits-labos.backup-${label}`, raw);
        }
      });
      await kit.tap(page, page.locator('.profile-tile').first());
      await openParent(page);
      await page.waitForSelector('.backup-btn');
      if (await page.locator('.backup-btn').count() !== 4) throw new Error('expected 4 copies in the Save card');
    } },
    // (over the hub, which may scroll under it)
    { name: 'reveal, a sticker', pageScroll: true, async setup(page, kit) { await reveal(page, kit, 'sticker'); } },
    { name: 'reveal, an item', pageScroll: true, async setup(page, kit) { await reveal(page, kit, 'item'); } },
    { name: 'reveal, a new world', pageScroll: true, async setup(page, kit) { await reveal(page, kit, 'item', START_WORLD); } },
    { name: 'reveal, a new square world (fake pack)', pageScroll: true, async setup(page, kit) { await reveal(page, kit, 'item', SQUARE_PACK.id); } },
    // The parent screen is a list: it scrolls down on a phone.
    { name: 'parent, reset one profile: confirm', pageScroll: true, async setup(page, kit) { await resetConfirm(page, kit, 'profile'); } },
    { name: 'parent, reset everything: confirm', pageScroll: true, async setup(page, kit) { await resetConfirm(page, kit, 'all'); } },
  ],
};
