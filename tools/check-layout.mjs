// Layout check: every game × its worst-case screens (games/<id>/checks.js) × the 7 sizes
// (3 with --quick: 360x640, 640x360, 1366x657 — for build steps).
// Without --game, the shared screens too (album, "Mon pré", the reward reveal…:
// js/screens/checks.js, same format as a game's checks.js; owner, 2026-10-05).
//   node tools/check-layout.mjs [--game <id>] [--quick] [--jobs <n>]   (n parallel jobs, default 3)
// A worst case with `once: true` runs at the first size only (behaviour checks).
// Fails on: page scroll, touch targets < 64px / off-screen / overlapping, grid cells
// smaller than the game's minCell. Boxes are measured with offsetTop/offsetWidth
// (layout boxes, not animated/transformed ones) after finite animations are finished.
// Screenshots of failures only: tools/.check-output/.
import { chromium } from 'playwright';
import {
  MIN_TOUCH, SHELL_TOUCH, STEP_TIMEOUT, describeFailure, isMain, kit, loadGameChecks,
  loadShellChecks, newContext, screenshotPath, selectedGames, sizesFor, startServer, watchErrors, withTimeout,
} from './check-kit.mjs';

// Runs in the page: measures everything and returns the problems found.
// pageScroll: the worst case allows the page to scroll DOWN (a list screen: hub, album);
// sideways never. A target inside a scrolling box (overflow auto/scroll, e.g. the
// meadow's tray) is reachable by scrolling it: the box must be on screen instead.
function measure({ touch, cells, minCell, minTouch, pageScroll }) {
  // Position on the page from the layout offsets (ignores CSS transforms).
  const box = (el) => {
    let x = 0, y = 0;
    for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };
  const label = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}`;
  const problems = [];
  const doc = document.documentElement;
  const bottom = pageScroll ? doc.scrollHeight : innerHeight; // how far down a target may be
  if (doc.scrollWidth > innerWidth + 1 || (!pageScroll && doc.scrollHeight > innerHeight + 1)) {
    problems.push(`page scrolls: content ${doc.scrollWidth}×${doc.scrollHeight} in a ${innerWidth}×${innerHeight} screen`);
  }
  const scroller = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) return e;
    }
    return null;
  };
  const offScreen = (b) => b.x < -1 || b.y < -1 || b.x + b.w > innerWidth + 1 || b.y + b.h > bottom + 1;

  const targets = [...new Set(touch.flatMap((s) => [...document.querySelectorAll(s)]))]
    .filter((el) => el.offsetParent !== null) // skip hidden ones
    .map((el) => ({ el, ...box(el) }));
  if (!targets.length) problems.push('no touch targets found (selectors out of date?)');
  const scrollers = new Set();
  for (const t of targets) {
    if (t.w < minTouch - 0.5 || t.h < minTouch - 0.5) problems.push(`too small (${t.w}×${t.h}px): ${label(t.el)}`);
    const sc = scroller(t.el);
    if (sc) scrollers.add(sc);
    else if (offScreen(t)) problems.push(`off screen (${t.x},${t.y} ${t.w}×${t.h}): ${label(t.el)}`);
  }
  for (const sc of scrollers) {
    const b = box(sc);
    if (offScreen(b)) problems.push(`scrolling box off screen (${b.x},${b.y} ${b.w}×${b.h}): ${label(sc)}`);
  }
  // Two targets in the same scrolling box can't overlap the others there; outside it,
  // compare their real positions (scrolled), not the layout offsets.
  for (const t of targets) {
    const sc = scroller(t.el);
    if (!sc) continue;
    const r = t.el.getBoundingClientRect();
    Object.assign(t, { x: r.left + scrollX, y: r.top + scrollY });
  }
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue; // a card inside its block
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > 1 && overlapY > 1) problems.push(`overlap: ${label(a.el)} × ${label(b.el)}`);
    }
  }

  if (cells) {
    const sizes = [...document.querySelectorAll(cells)].map((el) => Math.min(el.offsetWidth, el.offsetHeight));
    if (!sizes.length) problems.push(`no grid cells found (${cells})`);
    else if (Math.min(...sizes) < minCell) problems.push(`grid cells ${Math.min(...sizes)}px < ${minCell}px`);
  }
  return problems;
}

export async function checkLayout(args = []) {
  // What to check: each selected game's checks.js, and — for the whole app — the
  // shared screens' (named "shell" in the output).
  const suites = [];
  const failures = [];
  for (const game of selectedGames(args)) {
    const checks = await loadGameChecks(game.id);
    if (!checks?.worstCases?.length) failures.push(`${game.id}: no games/${game.id}/checks.js with worstCases`);
    else suites.push({ id: game.id, checks });
  }
  if (!args.includes('--game')) {
    const checks = await loadShellChecks();
    if (!checks?.worstCases?.length) failures.push('shell: no js/screens/checks.js with worstCases');
    else suites.push({ id: 'shell', checks });
  }

  const sizes = sizesFor(args); // 7 sizes, or 3 with --quick
  // Parallel runs (owner, 2026-10-11: the full gate took 45 min). Each job = one suite at
  // one size, in its own browser context; JOBS of them run at the same time.
  // --jobs 1 = the old one-at-a-time order (use it if a run looks flaky).
  const jobsArg = args.indexOf('--jobs');
  const JOBS = Math.max(1, Number(jobsArg >= 0 ? args[jobsArg + 1] : 3) || 3);
  const server = await startServer();
  const browser = await chromium.launch();
  let screens = 0;

  // One suite at one size. A worst case marked `once: true` (a behaviour check: it plays
  // and asserts saved data; its screen is not a layout case of its own) runs at the first
  // size only. A worst case that timed out or broke on a JS error is skipped at the other
  // sizes (it would fail the same way).
  async function runJob({ id, checks, broken }, size) {
    const context = await newContext(browser, size);
    try {
      for (const wc of checks.worstCases) {
        if (broken.has(wc)) continue;
        if (wc.once && size !== sizes[0]) continue;
        const page = await context.newPage();
        const errors = watchErrors(page);
        const where = `${id} · ${wc.name} · ${size.name}`;
        try {
          await page.goto(`${server.base}?nosw`);
          await withTimeout(wc.setup(page, kit), STEP_TIMEOUT, 'setup');
          await kit.settle(page);
          const problems = await page.evaluate(measure, {
            touch: [...SHELL_TOUCH, ...checks.touch], cells: checks.cells, minCell: checks.minCell ?? 0, minTouch: MIN_TOUCH,
            pageScroll: wc.pageScroll === true,
          });
          problems.push(...errors);
          screens++;
          if (problems.length) {
            await page.screenshot({ path: screenshotPath(id, wc.name, size.name) });
            failures.push(...problems.map((p) => `${where}: ${p}`));
          }
        } catch (err) {
          const skip = err.timedOut || errors.some((e) => e.startsWith('page error'));
          if (skip) broken.add(wc);
          const skipped = skip ? ' (other sizes skipped)' : '';
          failures.push(`${where}: setup failed — ${describeFailure(err, errors)}${skipped}`);
          await page.screenshot({ path: screenshotPath(id, wc.name, size.name, 'error') }).catch(() => {});
        }
        await page.close();
      }
    } finally {
      await context.close();
    }
  }

  try {
    const queue = [];
    for (const suite of suites) {
      const once = suite.checks.worstCases.filter((wc) => wc.once).length;
      console.log(`  … layout: ${suite.id} (${suite.checks.worstCases.length} worst cases × ${sizes.length} sizes${once ? `, ${once} at 1 size` : ''})`);
      suite.broken = new Set();
      for (const size of sizes) queue.push([suite, size]);
    }
    console.log(`  … layout: ${queue.length} jobs, ${JOBS} at a time`);
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await runJob(...next);
    };
    await Promise.all(Array.from({ length: JOBS }, worker));
  } finally {
    await browser.close();
    await server.stop();
  }
  return { ok: failures.length === 0, summary: `${screens} screens checked`, failures };
}

// Run directly: print the result and set the exit code.
if (isMain(import.meta.url)) {
  const result = await checkLayout(process.argv.slice(2));
  for (const f of result.failures) console.log(`  ✗ ${f}`);
  console.log(result.ok ? `✓ layout: ${result.summary}` : `✗ layout: ${result.failures.length} problem(s), ${result.summary}`);
  process.exitCode = result.ok ? 0 : 1;
}
