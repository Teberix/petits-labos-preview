// Dev-only (never precached): "Formes & Silhouettes" worst-case screens for
// tools/check-layout.mjs and its offline interaction for tools/check-offline.mjs.
// See tools/check-kit.mjs.
import { LEVELS, PICTURES, PICTURE_PX, MIN_PIECE_PX, TANGRAMS } from './levels.js';
import { tapsToFit } from './logic.js';
import { regionOf, trianglesOf, centroid, solve, snap, key, distinctAngles } from './grid.js';

// The level cases use the fixed level map (parent switch "Carte des niveaux"): the test
// profile gets fixedMap, then the page reloads (the app reads the save at start).
async function useFixedMap(page) {
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('petits-labos') ?? 'null')?.profiles?.length > 0);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('petits-labos'));
    data.profiles[0].fixedMap = true;
    localStorage.setItem('petits-labos', JSON.stringify(data));
  });
  await page.reload();
}

// The path (new engine): the game opens on it; ▶ plays three rounds.
async function openPath(page, kit) {
  await kit.openGame(page, 'shapes');
  await page.locator('.path-play').waitFor({ timeout: 30_000 });
  await kit.settle(page);
}

const savedSkill = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('petits-labos')).profiles[0].skills?.shapes?.skill);

// Puts the saved path skill at `skill` (null = a fresh path), then reloads.
async function setSkill(page, skill) {
  await page.evaluate((n) => {
    const data = JSON.parse(localStorage.getItem('petits-labos'));
    data.profiles[0].skills ??= {};
    if (n === null) delete data.profiles[0].skills.shapes;
    else data.profiles[0].skills.shapes = { skill: n };
    localStorage.setItem('petits-labos', JSON.stringify(data));
  }, skill);
  await page.reload();
}

// Plays one round on screen, whatever its type (picture or tangram board), cleanly.
async function solveRound(page, kit) {
  if (await page.locator('.sh-tg-board').count()) await solveBoard(page, kit, await readBoard(page, kit));
  else await solvePuzzle(page, kit);
}

// Waits for the next round of the same ▶ (a different picture / board).
async function waitNextRound(page, kit, before) {
  await page.waitForFunction((b) => {
    const el = document.querySelector('.sh-pic, .sh-tg-board');
    return el && (el.dataset.picture ?? el.dataset.board) !== b && document.querySelectorAll('.sh-tray .sh-piece').length > 0
      && !document.querySelector('.sh-tray .sh-spot')
      && !document.querySelector('.sticker-reveal'); // (the first star unlocks the arctic world: its reveal shows first)
  }, before, { timeout: 30_000 });
  await kit.settle(page);
}

// Plays `n` clean rounds of the ▶ now on screen (the last one ends back on the path
// only when n is 3: the caller waits for it).
async function playRounds(page, kit, n) {
  for (let i = 1; i <= n; i++) {
    await page.locator('.sh-tray .sh-piece').first().waitFor({ timeout: 30_000 });
    await kit.settle(page);
    const before = await page.evaluate(() => {
      const el = document.querySelector('.sh-pic, .sh-tg-board');
      return el.dataset.picture ?? el.dataset.board;
    });
    await solveRound(page, kit);
    if (i < n) await waitNextRound(page, kit, before);
  }
}

// Strongest hint, not the sum: one wrong drop on each of 2 pieces in every round of a ▶
// is a 'clue' outcome (1 miss at most per piece) → the skill stays 2 (a sum of 2 = 'glow').
async function playClueRounds(page, kit) {
  await setSkill(page, 2);
  await openPath(page, kit);
  await kit.tap(page, page.locator('.path-play'));
  for (let r = 1; r <= 3; r++) {
    const { pieces, holes } = await readPuzzle(page, kit);
    const before = await pictureKey(page);
    let wrongDrops = 0;
    for (const q of pieces) {
      const h = holes.find((x) => x.shape !== q.shape);
      if (!h || wrongDrops === 2) continue;
      await kit.drag(page, piece(q.id), hole(h.index));
      wrongDrops++;
    }
    if (wrongDrops !== 2) throw new Error('strongest hint: could not make 2 wrong drops on 2 pieces');
    await solvePuzzle(page, kit);
    if (r < 3) await waitNextRound(page, kit, before);
  }
  await page.locator('.path-play').waitFor({ timeout: 30_000 });
  const afterClues = await savedSkill(page);
  if (afterClues !== 2) throw new Error('1 wrong drop on 2 pieces per round: skill is ' + afterClues + ', expected 2');
}

async function openMap(page, kit) {
  await useFixedMap(page);
  await kit.openGame(page, 'shapes');
  // Wait for shapes.css (loaded when the game mounts): before it applies, the level
  // buttons aren't where they end up, and a tap can land next to them. This includes
  // loading the game's modules (lazy import), so it gets a page load's timeout: on a
  // busy PC the 10 s action timeout was hit twice with the screen still empty.
  await page.waitForFunction(() => {
    const map = document.querySelector('.sh-levels');
    return map && getComputedStyle(map).display === 'flex';
  }, null, { timeout: 30_000 }); // = check-kit's NAV_TIMEOUT
}

async function openLevel(page, kit, id) {
  await openMap(page, kit);
  await kit.tap(page, page.locator('.sh-level-btn').nth(LEVELS.findIndex((l) => l.id === id)));
}

async function savedStars(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('petits-labos')).profiles[0].rewards.stars);
}

// The class alone isn't enough: another animation class can override it, and a
// missing @keyframes leaves the name set but nothing running (both happened; kid-ux
// review). So: a RUNNING animation of that name.
async function animating(page, selector, name) {
  return page.locator(selector).evaluateAll((els, n) => els.some((el) =>
    el.getAnimations().some((a) => a.animationName === n && a.playState === 'running')), name);
}
const dancing = (page, selector) => animating(page, selector, 'sh-dance');

const piece = (id) => `.sh-tray .sh-piece[data-piece="${id}"]`;
const hole = (i) => `.sh-pic-hole[data-index="${i}"]`;

// The pieces in the tray and the empty holes. Settles the picture's pop-in first: a
// drag measured mid-animation would aim at the wrong hole.
async function readPuzzle(page, kit) {
  await page.locator('.sh-tray .sh-piece').first().waitFor();
  await kit.settle(page);
  return page.evaluate(() => ({
    pieces: [...document.querySelectorAll('.sh-tray .sh-piece')].map((el) => ({
      id: el.dataset.piece, shape: el.dataset.shape, angle: Number(el.dataset.angle),
    })),
    holes: [...document.querySelectorAll('.sh-pic-hole')].map((el) => ({
      index: el.dataset.index, shape: el.dataset.shape, angle: Number(el.dataset.angle),
    })),
  }));
}

// The picture's 0–100 frame must be at least PICTURE_PX on every phone: the unit
// tests' "≥ 44px per piece" rule is computed at that size.
async function checkFrame(page) {
  const box = await page.locator('.sh-pic-holes').boundingBox();
  const side = Math.min(box.width, box.height);
  const phone = await page.evaluate(() => Math.min(innerWidth, innerHeight) <= 450);
  if (phone && side < PICTURE_PX - 0.5) throw new Error(`picture frame ${side.toFixed(0)}px < PICTURE_PX ${PICTURE_PX}`);
}

// Turns each piece (taps) until it fits a free hole, then drags it there.
async function solvePuzzle(page, kit) {
  for (;;) {
    const { pieces, holes } = await readPuzzle(page, kit);
    const p = pieces[0];
    const options = holes.map((h) => ({ h, taps: tapsToFit(p.shape, p.angle, h) })).filter((o) => o.taps !== null);
    if (!options.length) throw new Error(`no hole for ${p.shape}`);
    options.sort((a, b) => a.taps - b.taps);
    for (let i = 0; i < options[0].taps; i++) await kit.tap(page, page.locator(piece(p.id)));
    await kit.settle(page);
    await page.waitForTimeout(300); // the turn transition
    await kit.drag(page, piece(p.id), hole(options[0].h.index));
    if (await page.locator(piece(p.id)).count()) throw new Error(`${p.shape} was not placed`);
    if (pieces.length === 1) return;
  }
}

// The picture of the round on screen (by its holes' shapes; pictures differ).
async function pictureKey(page) {
  return page.locator('.sh-pic').getAttribute('data-picture');
}

// Waits for the next round: a new picture with every hole empty again.
async function nextRound(page, before) {
  await page.waitForFunction((b) => {
    const pic = document.querySelector('.sh-pic');
    return pic && pic.dataset.picture !== b && document.querySelectorAll('.sh-tray .sh-piece').length > 0
      && !document.querySelector('.sh-tray .sh-spot');
  }, before, { timeout: 20000 }); // (the 5th star brings a sticker)
}

const biggest = (id) => LEVELS.find((l) => l.id === id).pictures
  .reduce((a, b) => (PICTURES[b].length > PICTURES[a].length ? b : a));

// ---------- tangram (level 8) ----------

// The board on screen: its key, region, and how cell coordinates map to the screen
// (same arithmetic as tangram.js).
async function readBoard(page, kit) {
  await page.locator('.sh-tg-board[data-board]').waitFor();
  await page.locator('.sh-tray .sh-piece').first().waitFor();
  await kit.settle(page);
  const id = await page.locator('.sh-tg-board').getAttribute('data-board');
  const board = TANGRAMS[id];
  const region = regionOf(board);
  const cells = [...region].map((k) => k.split(',').map(Number));
  const cols = Math.max(...cells.map((c) => c[0])) + 1;
  const rows = Math.max(...cells.map((c) => c[1])) + 1;
  const m = Math.max(cols, rows);
  const vw = (100 * cols) / m;
  const vh = (100 * rows) / m;
  const cs = 92 / m;
  const rect = await page.locator('.sh-tg-board').boundingBox();
  const screen = ([x, y]) => ({
    x: rect.x + (((vw - cols * cs) / 2 + x * cs) / vw) * rect.width,
    y: rect.y + (((vh - rows * cs) / 2 + y * cs) / vh) * rect.height,
  });
  return { id, board, region, cs, vw, rect, screen };
}

const trayPiece = (type) => `.sh-tray .sh-piece[data-type="${type}"]`;
const placedPiece = (id) => `.sh-tg-placed[data-piece="${id}"]`;

async function dragTo(page, from, point) {
  const a = await page.locator(from).first().boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.mouse.up();
}

// Turns a tray piece of `type` until it has `angle`, then drops it so its middle
// lands on the placement's middle.
async function putPiece(page, kit, b, pl) {
  const sel = trayPiece(pl.type);
  for (let i = 0; i < 4; i++) {
    if (Number(await page.locator(sel).first().getAttribute('data-angle')) === pl.angle) break;
    await kit.tap(page, page.locator(sel).first());
  }
  await kit.settle(page);
  await page.waitForTimeout(300); // the turn transition
  await dragTo(page, sel, b.screen(centroid(trianglesOf(pl))));
}

// A placement that fits but leaves the rest unsolvable, or null if the board has none.
function deadEnd(b, types) {
  for (const type of new Set(types)) {
    const rest = [...types];
    rest.splice(rest.indexOf(type), 1);
    for (const angle of distinctAngles(type)) {
      for (let dc = 0; dc < 6; dc++) {
        for (let dr = 0; dr < 6; dr++) {
          const tris = trianglesOf({ type, angle, dc, dr }).map(key);
          if (tris.every((k) => b.region.has(k)) && !solve(b.region, new Set(tris), rest)) {
            return { type, angle, dc, dr };
          }
        }
      }
    }
  }
  return null;
}

async function solveBoard(page, kit, b) {
  for (const pl of b.board.solution) await putPiece(page, kit, b, pl);
}

const occupied = (b, placed) => new Set(placed.flatMap((pl) => trianglesOf(pl).map(key)));

export default {
  touch: ['.sh-level-btn', '.sh-continue', '.sh-piece'],

  worstCases: [
    {
      once: true, // behaviour check: 1 size
      name: 'path: 1 wrong drop on 2 pieces per round → skill unchanged (strongest hint)',
      async setup(page, kit) {
        await playClueRounds(page, kit);
      },
    },
    {
      name: 'path screen',
      async setup(page, kit) {
        await openPath(page, kit);
        if (!(await page.locator('.path-play').count())) throw new Error('no ▶ button');
      },
    },
    {
      name: 'path: one round at step 1',
      async setup(page, kit) {
        await openPath(page, kit);
        await kit.tap(page, page.locator('.path-play'));
        await page.locator('.sh-tray .sh-piece').first().waitFor({ timeout: 30_000 });
        await kit.settle(page);
        if (await page.locator('.sh-dot').count() !== 3) throw new Error('expected 3 progress dots on the path');
        await checkFrame(page);
      },
    },
    {
      name: 'level map (all levels)',
      async setup(page, kit) {
        await openMap(page, kit);
        const n = await page.locator('.sh-level-btn').count();
        if (n !== LEVELS.length) throw new Error(`${n} level buttons, expected ${LEVELS.length}`);
      },
    },
    {
      // Level 1 ('one'): exactly one piece fits nowhere until it is turned.
      name: 'puzzle: level 1, one piece to turn, 5 progress dots, picture big enough',
      async setup(page, kit) {
        await openLevel(page, kit, 1);
        const { pieces, holes } = await readPuzzle(page, kit);
        const stuck = pieces.filter((p) => !holes.some((h) => h.shape === p.shape && tapsToFit(p.shape, p.angle, h) === 0));
        if (stuck.length !== 1) throw new Error(`${stuck.length} pieces need turning, expected 1`);
        if (await page.locator('.sh-dot').count() !== 5) throw new Error('not 5 progress dots');
        if (await page.locator('.sh-dot.now').count() !== 1) throw new Error('no current dot');
        await checkFrame(page);
      },
    },
    {
      // The biggest picture of the hardest drawn level, a piece turned once.
      name: 'puzzle: level 7, most pieces, a piece turned',
      async setup(page, kit) {
        await openLevel(page, kit, 7);
        // Pictures come in random order: solve them until one with the most pieces shows
        // (the level has several; the tray then needs its widest layout).
        // After the 5th picture the level ends: play it again (5 of its 12 pictures have
        // the most pieces, so this ends fast; capped so it can't loop forever).
        const most = PICTURES[biggest(7)].length;
        let { pieces } = await readPuzzle(page, kit);
        for (let i = 0; i < 15 && pieces.length < most; i++) {
          const key = await pictureKey(page);
          await solvePuzzle(page, kit);
          const next = await Promise.race([
            nextRound(page, key).then(() => 'round'),
            page.locator('.sh-done .sh-continue').waitFor({ timeout: 20000 }).then(() => 'done'),
          ]);
          if (next === 'done') {
            await kit.tap(page, page.locator('.sh-continue'));
            await kit.tap(page, page.locator('.sh-level-btn').nth(LEVELS.findIndex((l) => l.id === 7)));
          }
          ({ pieces } = await readPuzzle(page, kit));
        }
        if (pieces.length !== most) throw new Error(`no ${most}-piece picture shown`);
        await kit.tap(page, page.locator(piece(pieces[0].id)));
        const angle = Number(await page.locator(piece(pieces[0].id)).getAttribute('data-angle'));
        if (angle !== (pieces[0].angle + 90) % 360) throw new Error('a tap did not turn the piece');
        await checkFrame(page);
        await kit.settle(page);
        await page.waitForTimeout(300);
      },
    },
    {
      // A piece dropped 3 times where it doesn't fit: clue → its hole glows → it dances.
      name: 'puzzle: 3 wrong drops → its hole glows, the piece dances',
      async setup(page, kit) {
        await openLevel(page, kit, 6);
        const { pieces, holes } = await readPuzzle(page, kit);
        const p = pieces[0];
        const other = holes.find((h) => h.shape !== p.shape);
        for (let i = 0; i < 3; i++) await kit.drag(page, piece(p.id), hole(other.index));
        if (!(await animating(page, '.sh-pic-hole.sh-glow', 'sh-glow'))) throw new Error('no hole glows');
        const glowShape = await page.locator('.sh-pic-hole.sh-glow').getAttribute('data-shape');
        if (glowShape !== p.shape) throw new Error(`a ${glowShape} hole glows for a ${p.shape}`);
        if (!(await dancing(page, piece(p.id)))) throw new Error('the piece does not dance');
        await kit.settle(page);
      },
    },
    {
      // Piece A dances (3 wrong drops), then piece B gets 2 wrong drops: the hints now
      // point only at B (its hole glows, A stops dancing) — never at two pieces.
      name: 'puzzle: hints move to the piece that needs them',
      async setup(page, kit) {
        await openLevel(page, kit, 6);
        const { pieces, holes } = await readPuzzle(page, kit);
        const [a, b] = pieces.filter((p, i, all) => all.findIndex((q) => q.shape === p.shape) === i);
        const otherThan = (p) => holes.find((h) => h.shape !== p.shape).index;
        for (let i = 0; i < 3; i++) await kit.drag(page, piece(a.id), hole(otherThan(a)));
        for (let i = 0; i < 2; i++) await kit.drag(page, piece(b.id), hole(otherThan(b)));
        if (await dancing(page, piece(a.id))) throw new Error('piece A still dances');
        const glow = await page.locator('.sh-pic-hole.sh-glow').evaluateAll((els) => els.map((el) => el.dataset.shape));
        if (glow.length !== 1 || glow[0] !== b.shape) throw new Error(`glowing holes ${glow} for a ${b.shape}`);
        await kit.settle(page);
      },
    },
    {
      // 5 pictures, each solved by turning; a new picture each time (no repeat while the
      // level has enough), the dots fill in; then the level-done screen + the sticker.
      name: 'puzzle: level 2 done (5 pictures, dots fill in, sticker)',
      async setup(page, kit) {
        await openLevel(page, kit, 2);
        const seen = [];
        for (let i = 0; i < 5; i++) {
          await readPuzzle(page, kit);
          const key = await pictureKey(page);
          seen.push(key);
          const done = await page.locator('.sh-dot.done').count();
          if (done !== i) throw new Error(`round ${i + 1}: ${done} dots filled`);
          await solvePuzzle(page, kit);
          if (i < 4) await nextRound(page, key);
        }
        const pool = LEVELS.find((l) => l.id === 2).pictures.length;
        if (pool >= 5 && new Set(seen).size !== 5) throw new Error(`a picture repeated: ${seen}`);
        await page.locator('.sh-done .sh-continue').waitFor({ timeout: 20000 });
        const completed = await page.evaluate(() => JSON.parse(localStorage.getItem('petits-labos')).profiles[0].games.shapes?.completed ?? []);
        if (!completed.includes(2)) throw new Error('level 2 not marked done');
        await kit.settle(page);
      },
    },
    {
      // Cells must stay ≥ 44px on phones (the small triangle's sides are one cell).
      name: 'tangram: a board, cells big enough',
      async setup(page, kit) {
        await openLevel(page, kit, 8);
        const b = await readBoard(page, kit);
        const phone = await page.evaluate(() => Math.min(innerWidth, innerHeight) <= 450);
        const cellPx = (b.cs / b.vw) * b.rect.width;
        if (phone && cellPx < MIN_PIECE_PX - 0.5) throw new Error(`cells ${cellPx.toFixed(0)}px < ${MIN_PIECE_PX}px`);
        if (await page.locator('.sh-tray .sh-piece').count() !== b.board.solution.length) throw new Error('not every piece in the tray');
      },
    },
    {
      name: 'tangram: board filled → one star, a new board',
      async setup(page, kit) {
        await openLevel(page, kit, 8);
        const b = await readBoard(page, kit);
        const before = await savedStars(page);
        await solveBoard(page, kit, b);
        if (await savedStars(page) !== before + 1) throw new Error('expected exactly one star');
        await page.waitForFunction((id) => {
          const el = document.querySelector('.sh-tg-board');
          return el && el.dataset.board !== id && !document.querySelector('.sh-tg-placed');
        }, b.id, { timeout: 20000 });
        await kit.settle(page);
      },
    },
    {
      // A placement that fits but leaves the rest unsolvable is accepted; then 3 drops
      // that fit nowhere: clue → the misplaced piece glows → a blue outline shows where
      // a piece goes and the dropped piece dances. Then the misplaced piece is dragged
      // back to the tray.
      name: 'tangram: dead end → hints, piece back to the tray',
      async setup(page, kit) {
        await openLevel(page, kit, 8);
        // Some boards have no dead end at all (every placement that fits can be
        // finished): solve those and go on until a board with one shows.
        let b = null;
        let bad = null;
        let types = null;
        for (let i = 0; i < 12 && !bad; i++) {
          b = await readBoard(page, kit);
          types = b.board.solution.map((pl) => pl.type);
          bad = deadEnd(b, types);
          if (bad) break;
          await solveBoard(page, kit, b);
          const next = await Promise.race([
            page.waitForFunction((id) => {
              const el = document.querySelector('.sh-tg-board');
              return el && el.dataset.board !== id && !document.querySelector('.sh-tg-placed');
            }, b.id, { timeout: 20000 }).then(() => 'round'),
            page.locator('.sh-done .sh-continue').waitFor({ timeout: 20000 }).then(() => 'done'),
          ]);
          if (next === 'done') {
            await kit.tap(page, page.locator('.sh-continue'));
            await kit.tap(page, page.locator('.sh-level-btn').nth(LEVELS.findIndex((l) => l.id === 8)));
          }
        }
        if (!bad) throw new Error('no board with a dead end shown');
        await putPiece(page, kit, b, bad);
        await page.locator('.sh-tg-placed').first().waitFor();
        // a tray piece and a spot on the board where it fits nowhere
        const other = types.find((t, i) => i !== types.indexOf(bad.type)) ?? bad.type;
        const angle = Number(await page.locator(trayPiece(other)).first().getAttribute('data-angle'));
        let spot = null;
        for (let y = 0.2; y < 6 && !spot; y += 0.25) {
          for (let x = 0.2; x < 6 && !spot; x += 0.25) {
            const pt = b.screen([x, y]);
            const inside = pt.x > b.rect.x + 4 && pt.x < b.rect.x + b.rect.width - 4
              && pt.y > b.rect.y + 4 && pt.y < b.rect.y + b.rect.height - 4;
            if (inside && !snap(other, angle, [x, y], b.region, occupied(b, [bad]))) spot = pt;
          }
        }
        if (!spot) throw new Error('no spot where the piece fits nowhere');
        for (let i = 0; i < 3; i++) await dragTo(page, trayPiece(other), spot);
        const glow = await page.locator('.sh-tg-placed.sh-glow-shape').evaluateAll((els) =>
          els.some((el) => el.getAnimations().some((a) => a.animationName === 'sh-glow-shape' && a.playState === 'running')));
        if (!glow) throw new Error('the misplaced piece does not glow');
        if (!(await page.locator('.sh-tg-hint svg').count())) throw new Error('no blue outline');
        if (!(await dancing(page, trayPiece(other)))) throw new Error('the dropped piece does not dance');
        await kit.settle(page);
        // the misplaced piece back to the tray
        const id = await page.locator('.sh-tg-placed').first().getAttribute('data-piece');
        const from = b.screen(centroid(trianglesOf(bad)));
        const tray = await page.locator('.sh-tray').boundingBox();
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2, { steps: 8 });
        await page.mouse.up();
        if (await page.locator(placedPiece(id)).count()) throw new Error('the piece did not go back to the tray');
        if (await page.locator(`.sh-tray .sh-piece[data-piece="${id}"]`).count() !== 1) throw new Error('the piece is not in the tray');
        await kit.settle(page);
      },
    },
  ],

  // Level 1: a wrong drop → no star, the piece stays; the whole picture → one star;
  // then the next picture.
  async offline(page, kit) {
    // The path: a fresh path, one clean ▶ (3 rounds) → skill 1 → 2, ▶ then picks level 2.
    await openPath(page, kit);
    await setSkill(page, null);
    await openPath(page, kit);
    await kit.tap(page, page.locator('.path-play'));
    await playRounds(page, kit, 3);
    await page.locator('.path-play').waitFor({ timeout: 30_000 });
    if (await page.locator('.path-stone').count() !== 3) throw new Error('expected three stones on the path');
    const skill = await savedSkill(page);
    if (skill !== 2) throw new Error('clean play: skill is ' + skill + ', expected 2');
    const picked = await page.evaluate(async () => {
      const { pickLevel } = await import('./js/progress.js');
      const { PATH_LEVELS } = await import('./games/shapes/levels.js');
      const state = JSON.parse(localStorage.getItem('petits-labos')).profiles[0].skills.shapes;
      return pickLevel(PATH_LEVELS, state).id;
    });
    if (picked !== 2) throw new Error('step 2: expected level 2, picked ' + picked);

    // Leave after one round: the skill must not move.
    await kit.tap(page, page.locator('.path-play'));
    await playRounds(page, kit, 1);
    await kit.tap(page, page.locator('.top-bar .icon-btn').first());
    await page.waitForFunction(() => document.querySelector('#app')?.dataset.screen !== 'game');
    const after = await savedSkill(page);
    if (after !== 2) throw new Error('left after 1 round: skill is ' + after + ', expected 2');

    // Step 8 (tangram): one ▶ plays three boards, back on the path.
    await setSkill(page, 8);
    await openPath(page, kit);
    await kit.tap(page, page.locator('.path-play'));
    await page.locator('.sh-tg-board[data-board]').waitFor({ timeout: 30_000 });
    await playRounds(page, kit, 3);
    await page.locator('.path-play').waitFor({ timeout: 30_000 });

    // The fixed map: level 1, wrong drop → no star, picture → one star, next picture.
    await openLevel(page, kit, 1);
    const before = await savedStars(page);
    const { pieces, holes } = await readPuzzle(page, kit);
    const p = pieces[0];
    await kit.drag(page, piece(p.id), hole(holes.find((h) => h.shape !== p.shape).index));
    if (await savedStars(page) !== before) throw new Error('wrong drop: expected no star');
    if (!(await page.locator(piece(p.id)).count())) throw new Error('wrong drop: the piece left the tray');
    const key = await pictureKey(page);
    await solvePuzzle(page, kit);
    if (await savedStars(page) !== before + 1) throw new Error('finished picture: expected one more star');
    await nextRound(page, key);
  },
};
