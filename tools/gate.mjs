// The verification gate: unit tests + privacy + levels + layout + offline.
//   node tools/gate.mjs                 everything (release.mjs always runs this)
//   node tools/gate.mjs --game robot    one game only: its unit tests, levels, layout, offline
//   node tools/gate.mjs --game robot --quick   … with layout at 3 sizes (build steps)
//   node tools/gate.mjs --only unit,privacy   just some checks (unit, privacy, levels, layout, offline)
//   add --jobs <n> to run n layout jobs at a time (default 3; --jobs 1 = one at a time)
// levels = level-based games only (games/<id>/levels.json): schema + solver + no gap in
// the difficulty steps; it also prints a difficulty table (information).
// Prints one line per check (+ its problems) and exits with code 1 if anything failed.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './precache.mjs';
import { selectedGames } from './check-kit.mjs';
import { checkPrivacy } from './check-privacy.mjs';
import { checkLevels } from './check-levels.mjs';
import { checkLayout } from './check-layout.mjs';
import { checkOffline } from './check-offline.mjs';

// All unit tests, or with --game <id> only that game's tests/<id>.test.mjs (a build step
// doesn't need every other game's tests; the full gate still runs them all).
function unitTests(args) {
  const i = args.indexOf('--game');
  const file = i >= 0 ? `tests/${args[i + 1]}.test.mjs` : 'tests/*.test.mjs';
  if (i >= 0 && !existsSync(join(ROOT, file))) {
    return { ok: false, summary: 'no tests', failures: [`${file} is missing (every game has its unit tests)`] };
  }
  const run = spawnSync(process.execPath, ['--test', file], { cwd: ROOT, encoding: 'utf8' });
  const out = `${run.stdout}\n${run.stderr}`;
  const count = (label) => Number(out.match(new RegExp(`ℹ ${label} (\\d+)`))?.[1] ?? 0);
  const failed = [...out.matchAll(/^✖ (.+?)(?: \(\d|$)/gm)].map((m) => m[1]).filter((t) => !t.startsWith('failing tests'));
  return {
    ok: run.status === 0,
    summary: `${count('pass')} passed, ${count('fail')} failed`,
    failures: run.status === 0 ? [] : (failed.length ? [...new Set(failed)] : [out.trim().split('\n').slice(-5).join(' | ')]),
  };
}

const CHECKS = {
  unit: (args) => unitTests(args),
  privacy: () => checkPrivacy(),
  levels: (args) => checkLevels(args),
  layout: (args) => checkLayout(args),
  offline: (args) => checkOffline(args),
};

const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const names = onlyIndex >= 0 ? args[onlyIndex + 1].split(',') : Object.keys(CHECKS);
const unknown = names.filter((n) => !CHECKS[n]);
if (unknown.length) {
  console.error(`Unknown check(s): ${unknown.join(', ')} (known: ${Object.keys(CHECKS).join(', ')})`);
  process.exit(2);
}
const games = selectedGames(args).map((g) => g.id);
console.log(`Gate: ${names.join(', ')}${args.includes('--game') ? ` — games: ${games.join(', ')}` : ''}${args.includes('--quick') ? ' (quick: 3 sizes)' : ''}`);

const started = Date.now();
let allOk = true;
for (const name of names) {
  const t0 = Date.now();
  let result;
  try {
    result = await CHECKS[name](args);
  } catch (err) {
    result = { ok: false, summary: 'crashed', failures: [err.message.split('\n')[0]] };
  }
  allOk &&= result.ok;
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`${result.ok ? '✓' : '✗'} ${name.padEnd(8)} ${result.summary} (${secs}s)`);
  const shown = result.failures.slice(0, 25);
  for (const line of result.info ?? []) console.log(`    ${line}`); // (information only)
  for (const f of shown) console.log(`    ✗ ${f}`);
  if (result.failures.length > shown.length) console.log(`    … and ${result.failures.length - shown.length} more`);
}
console.log(allOk
  ? `GATE PASSED (${Math.round((Date.now() - started) / 1000)}s)`
  : 'GATE FAILED — screenshots of layout/offline failures: tools/.check-output/');
process.exitCode = allOk ? 0 : 1;
