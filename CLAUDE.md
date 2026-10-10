# CLAUDE.md — Petits Labos

Educational STEM/logic game hub (PWA) for two 6-year-old early readers, played on an
Android tablet/phone. Learning through play, never through pressure. The owner is learning
Claude Code with this project: **keep code simple, readable, and commented where the logic
isn't obvious.**

Each game has its own notes in `games/<id>/CLAUDE.md` (read them when working on it).
Roadmap and status: `GAMES.md` (one game at a time; DONE only after the owner confirms a
playtest).

## Hard rules

**Tech**
- Plain HTML/CSS/JS (ES modules OK), no framework, no build step. **No dependencies in
  the app**; dev tools may use Playwright (devDependency only, never loaded by the app).
- No external network calls, no ads, no purchases, no analytics, no data collection.
  All data lives in `localStorage` on the device.
- No external assets: art = inline SVG/CSS, sounds = Web Audio API, voice = `speechSynthesis`.
- **Public repo: no personal data.** Daughters' names/avatars exist only on the device —
  never in code, fixtures, screenshots, or commit messages (enforced by the gate's privacy
  check, from the git-ignored `tools/private-words.txt`).

**Offline-first & updates (non-negotiable)**
- After first load the app is 100% playable offline, indefinitely. Service worker is
  cache-first for every app file. No feature may depend on the network.
- Versioned cache from a single `VERSION` constant, bumped on every release.
- When online, the SW fetches the new version in the background and installs it silently;
  it is applied **only on the next app launch, never mid-game**. Old caches are deleted
  after activation.
- Kids never see update prompts. Version number + "check for updates" button live behind
  the parent gate.
- Progress in `localStorage` must survive updates. Storage has a schema version; format
  changes get a migration — **never wipe progress.**

**UX (kids)**
- Touch-first: touch targets ≥ 64px, drag-and-drop via pointer/touch events, nothing
  hover-dependent. Icon/colour/audio-driven, minimal text.
- No timers, no lives, no "game over". Mistakes → funny/neutral reaction + gentle hint.
- Parent gate (press-and-hold 3 s) in front of settings and profile management.
- Voice reads instructions aloud in the active language, with a "repeat" button. Degrade
  gracefully when no voice exists for that language.

**Responsive**
- Phone + tablet, portrait + landscape. Relative units, CSS grid/flexbox. Rearrange layout
  rather than shrinking touch targets below 64px. Respect safe areas
  (`env(safe-area-inset-*)`). No orientation lock unless a game truly requires it.
- Checked by the gate at 7 sizes: 360×640, 640×360, 412×915, 915×412, 800×1280, 1280×800
  (touch) and 1366×657 (laptop, mouse).

**i18n**
- All UI strings in dictionaries (`fr`, `es`, `en`). Default: French.
- Games that teach letters/words/reading support all 3 languages (selectable per profile).
  Non-linguistic games use French by default.

## Architecture

- Hub: pick a profile → pick a mini-game. Two profiles (name + avatar, emoji or simple
  SVG), progress saved per profile.
- Each mini-game is a self-contained module in its own folder, registered in the hub via
  one registry entry. Adding a game must not touch other games.
- Shared utilities: i18n, audio (sfx + speech), storage (+ migrations), drag-and-drop
  helper, rewards (stars/stickers shown in a per-profile "collection" screen), parent gate.

## How to work

- Build in small steps. New game: `/new-game <n>` (design → OK → steps).
- **Verification = `/gate`, sized to what changed** (owner, 2026-10-02 — the full gate
  takes ~18 min on this PC):
  - build step (only `games/<id>/`, its tests, its data):
    `node tools/gate.mjs --game <id> --quick` (its unit tests, levels, layout at 3 sizes,
    offline) + `node tools/gate.mjs --only privacy`;
  - mailbox / playable checkpoint: `--game <id>` without `--quick` (7 sizes) +
    `--only privacy` + the `kid-ux-reviewer` subagent;
  - shared code changed (`js/`, `css/`, `index.html`, `sw.js` logic — a PRECACHE-only
    change does not count) or a release: full gate + the `pwa-guardian` subagent;
  - the full gate runs alone; reviewers run after it, never at the same time.
  Don't re-verify manually what the gate covers. On PASS report one line; read the
  details only on failure. Report what the gate can't check (real touch feel, voice).
- Ask only on real blockers/ambiguity. Don't add unrequested features — propose them.
- Windows: commit with a message file (`git commit -F <file>`); never pipe the message
  through PowerShell (a here-string piped to `git commit -F -` is taken as a pathspec).

## Report style (mailbox files and final reports)
- Write in ASD-STE-100 style, about 80 %: one idea per sentence; max 20 words per
  instruction, 25 per description; active voice; imperative for owner actions.
- Use one term for one thing. No synonyms.
- Exempt: code identifiers, file paths, commands, test output, quotes.
- Report results, risks and questions only. No process narration.
- Read narrowly: grep or line ranges before whole files; state the read list first.
- Proposals that change stored data or shared flows include: a field table (field |
  written by, with app versions | read by | migration) and a Mermaid state diagram for
  any multi-step flow. Keep each one under 15 rows or nodes.

## Code map

```
index.html, manifest.webmanifest   app shell + PWA manifest (all paths RELATIVE)
sw.js                  service worker: VERSION, PRECACHE (generated), cache-first, deferred update
js/app.js              boot, screen switching, "safe moments" for applying updates
js/updates.js          SW registration, applyIfWaiting(), manual check
js/storage.js          localStorage document, schema version + MIGRATIONS (v2: additive —
                       the preview and the live app share it on a phone)
js/progress.js         new engine (games 9+): adaptive difficulty, pure (skill, pickLevel)
js/scene.js            rewards option B, pure: alternate sticker/item, growing gap, the scene
js/items.js            the scene items (SVG) + the scenes — names in js/i18n as item.<id>
js/i18n.js, js/i18n/   t(), addStrings(); fr/es/en dictionaries
js/audio.js            Web Audio sfx + speechSynthesis (prefers local voices)
js/parentgate.js       3 s press-and-hold button
js/dragdrop.js         draggable(el, { targets, onDrop(target, point), onTap, canDrag }) — pointer events, ghost copy
js/rewards.js          stars + stickers (shared by all games): addStar, flyStar, showSticker, starBadge
js/stickers.js         the 24 album stickers (SVG) — names in js/i18n as sticker.<id>
js/ui.js, dom.js, icons.js   top bar, repeat button, h() DOM helper, shell SVG icons
js/screens/            profiles, hub, game (mounts a game + builds ctx), parent, collection (album),
                       scene ("Mon pré": the child places the items they unlocked)
games/registry.js      one line per game
games/<id>/meta.js     id, titleKey, strings, tile icon (loaded eagerly by the hub)
games/<id>/<id>.js     default export { mount(container, ctx), unmount() } (lazy-loaded)
games/<id>/checks.js   dev-only: worst-case screens + offline interaction for the gate
games/<id>/CLAUDE.md   dev-only: that game's notes (template: tools/templates/game-CLAUDE.md)
games/<id>/levels.json level-based games only: the levels (app file) — see "Level data"
games/<id>/levels.schema.json, solver.mjs   level-based games: dev-only, used by the gate
tools/                 dev-only Node scripts (never loaded by the app); templates/ for /new-game
tests/                 dev-only unit tests: node --test tests/*.test.mjs
.claude/               settings.json (permissions), agents/ (reviewers), commands/ (/gate, /new-game)
```

Conventions:
- **All URLs relative** (`./sw.js`, `css/base.css`) — the app lives at `/petits-labos/`.
- **PRECACHE: don't regenerate it during build steps — `release.mjs` does it.** Only
  exception: a step that adds or removes an app file the game loads runs
  `node tools/update-precache.mjs`, otherwise the game gate's offline check fails (the
  new file isn't cached when the network is cut). Dev-only files (`checks.js`,
  `solver.mjs`, `levels.schema.json`, `*.md`) are never precached
  (`isDevOnly()` in `tools/precache.mjs`).
- Game contract and `ctx` fields are documented at the top of `js/screens/game.js`.
- Game-specific strings go in the game's `strings.js` / `meta.js`, not in `js/i18n/`.
- Updates are applied only at safe moments: app launch, entering hub/profiles, or the app
  returning to the foreground on hub/profiles. Never while a game is mounted.
- Storage format change → bump `SCHEMA_VERSION` + add a migration in `js/storage.js`.
- Don't use `requestAnimationFrame` for game logic/timers (it stops in some webviews and
  background tabs) — use `setTimeout` + CSS animations.
- Rewards: 1 star per success (games call `ctx.rewards.star(el)`). Every few stars a
  reward, alternating a sticker (album) and an item (the child's meadow, "Mon pré"); the
  gap starts at 5 stars and grows by 1 every 2 rewards, at most 20 (`js/scene.js`;
  owner, 2026-10-05). `ctx.rewards.star` returns the reward (or null): await
  `ctx.rewards.showSticker(reward)` before moving on — it reveals stickers and items.
  No scores, never take stars away. Free-play modes give no stars.
  Exception (owner's decision, 2026-09-28): a game may give **+1 bonus star** for an
  especially efficient solution (Robot Codeur: fewest cards), and mark a level done that
  way with a crown. Always positive: a normal success still gets its star, nothing is
  ever shown as a failure, and "try to do better" is said at most once per level.
  Exception (owner's decision, 2026-10-08): the Duo Mémoire duo mode gives **2 stars to
  EACH of the 2 players** at the end of a board, through `ctx.rewards.starFor(profileId,
  fromEl, toEl)`. No winner: both players are celebrated. The duo is not a free-play mode.

## Level data (level-based games)

The new engine, for games 9 onwards (owner, 2026-10-03). Games 1–8 keep their `levels.js`
until they are migrated, one at a time.
- **A level = a parameter set** (pieces, rules, look-alikes…), one per difficulty step at
  least. Its **rounds are generated** by a build-time script in the private repo and
  checked by the game's `solver.mjs`; only the output (+ the seed) is committed in
  `levels.json` — like game 8's levels 7–8.
- `difficulty` = whole steps 1, 2, 3… N; every step has a level (the gate fails on a
  hole in the curve).
- `games/<id>/levels.json` — the only place level content lives (no levels hard-coded
  in engine code):
  ```json
  { "schemaVersion": 1, "game": "<id>", "levels": [ { "id": 1, "difficulty": 1, "…": "game params" } ] }
  ```
  `id` unique (progress is saved by id — never renumber), `difficulty` a whole step
  (the intended curve). The engine loads it with a JSON module import —
  `import data from './levels.json' with { type: 'json' };` — never `fetch()` (the app
  makes no network calls; the service worker precaches `levels.json` like any app file).
- `games/<id>/levels.schema.json` — JSON Schema for ONE level (the game's params).
  Dev-only. The gate's validator (`tools/json-schema.mjs`) supports a subset (type,
  properties, required, additionalProperties, items, min/max, enum, const, pattern,
  `$ref` to `#/$defs/…`); any other keyword is reported, never silently ignored.
- `games/<id>/solver.mjs` — optional, dev-only: `export function solve(level) →
  { solvable, minMoves? }`. Plain JS, no dependencies, bounded search.
- Templates for all three: `tools/templates/level-game/` (`/new-game` copies them).
- **Level generators never go in this repo** (it's public): they live in a separate
  private repo. `private/` is git-ignored, and the gate fails on any tracked path under
  `private/` or containing "generator".

## Verification (the gate)

```bash
node tools/gate.mjs                 # everything: unit + privacy + levels + layout + offline
node tools/gate.mjs --game robot    # one game: its unit tests, levels, layout, offline
node tools/gate.mjs --game robot --quick   # … layout at 3 sizes (build steps)
node tools/gate.mjs --only unit,privacy
```
- `check-layout.mjs`: every game × its `checks.js` worst cases × 7 sizes, or 3 with
  `--quick` (360x640, 640x360, 1366x657) (touch contexts, laptop with mouse). No page
  scroll, touch targets ≥ 64px / on screen / not overlapping, grid cells ≥ the game's
  `minCell`. Failure screenshots → `tools/.check-output/`.
- `check-offline.mjs`: service worker active, every PRECACHE file cached and no dev-only
  file, nothing fails to load; then server stopped + network cut, each game's `offline()`
  interaction must succeed.
- `check-privacy.mjs`: words from `tools/private-words.txt` (git-ignored; `word @ file` =
  allowed in that file only) in committed/staged/untracked files and commit messages; the
  list itself must never be tracked; no network calls/URLs in app code; no tracked path
  (`git ls-files`) under `private/` or matching /generator/i.
- `check-levels.mjs` (level-based games only — games without `levels.json` are
  skipped): `levels.json` shape + every level valid against `levels.schema.json` → FAIL
  otherwise; difficulty steps 1…N with no hole → FAIL otherwise; if `solver.mjs` exists,
  every level must be solvable → FAIL otherwise; then a difficulty table (id,
  difficulty, minMoves) — information only.
- Layout jobs (one game × one size) run 3 at a time; `--jobs 1` runs them one by one (use it if
  a run looks flaky). A worst case with `once: true` runs at the first size only: use it for
  behaviour checks (they play and assert saved data), never for a screen whose layout matters.
- Never hangs: 10 s per Playwright action, 30 s per page load, 60 s per worst case /
  `offline()` (constants in `check-kit.mjs`). Failures show the page's JS errors; a worst
  case that times out or hits a JS error is skipped at the remaining sizes.
- Needs once: `npm install` + `npx playwright install chromium`.

## Local dev

```bash
node tools/serve.mjs          # → http://localhost:8080/petits-labos/ (same sub-path as Pages)
node tools/serve.mjs --lan    # also on the WiFi: prints http://<this-pc-ip>:8080/petits-labos/
```
- Default = this computer only. `--lan` listens on all interfaces for tablet playtests
  (Windows may ask to allow Node through the firewall). Over the LAN there is **no
  service worker** (browsers only allow it on localhost/HTTPS): play-testing works,
  offline/updates don't. Hidden files/folders (`.git`, `.claude`…) are never served.
- The service worker caches everything, so edits don't show on reload. During development
  use **`http://localhost:8080/petits-labos/?nosw`**: it unregisters the SW and clears
  caches (localhost only).
- Icons: `node tools/make-icons.mjs` regenerates `icons/` (SVG + 192/512/maskable PNGs)
  from the shape list in that script — pure Node, no packages.

## Release routine

Repo: https://github.com/Teberix/petits-labos — live app: https://teberix.github.io/petits-labos/
(setup done 2026-09-28; commits use the repo-local GitHub noreply email, never the personal one).

```bash
node tools/release.mjs            # patch: 0.1.0 → 0.1.1
node tools/release.mjs minor      # new level/game: 0.1.1 → 0.2.0
```
It runs the **full gate first and refuses if it fails** (nothing changed). Then it bumps
`VERSION` in `sw.js` + `js/version.js`, refreshes PRECACHE, commits tracked changes + new
files under the app/tool/test/config paths only (prints the list, and what it left out),
tags, and pushes `main`. Pages redeploys in ~1 min; devices download the new version in
the background and switch at their next safe moment.

### Preview builds
- Build a preview on a temporary branch from `dev`.
- Set `VERSION` to `<next>-preview.<n>` in `sw.js` and `js/version.js`.
- Set these fields in `manifest.webmanifest`: `"id": "./preview"`, `"name": "Petits Labos · test"`,
  `"short_name": "PL test"`, `"theme_color": "#D9480F"`.
- Commit, then force-push to `Teberix/petits-labos-preview` `main`. Delete the temporary branch.
- `dev` keeps no version bump and no manifest change.
