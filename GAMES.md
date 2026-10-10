# Petits Labos — games roadmap

Planned games, in build order. **One game at a time.** A game is DONE only after the
owner confirms it was playtested with the kids.

| # | Game | Teaches | Status |
|---|---|---|---|
| 1 | La Potion | colours, cause/effect, counting | DONE |
| 2 | Robot Codeur | sequencing, then loops | DONE |
| 3 | Lettres Magiques | letters/sounds/first words (FR/ES/EN) | POSTPONED (owner will do it later; letter sounds need recorded audio — system voices only say letter names) |
| 4 | Le Marché | counting, addition, CHF coins | DONE |
| 5 | Le Train des Suites | patterns/logic | DONE |
| 6 | La Balance | heavier/lighter, equality | DONE |
| 7 | Qui mange qui ? | food chains, habitats | DONE |
| 8 | Formes à tourner (was Formes & Silhouettes) | shapes, rotation, spatial reasoning | DONE |
| 9 | Duo Mémoire | memory, turn-taking, 2 players on one device | DONE |
| 10 | Le Petit Jaguar | mazes, planning a path, spatial reasoning | planned |
| 11 | Les Tubes Arc-en-ciel | colour sorting in tubes, planning ahead | TODO |
| 12 | La Pâtisserie | match-3 swaps, spotting patterns | TODO |
| 13 | Les Paires | pair matching on stacked tiles, visual search | TODO |
| 14 | Les Pompons | moving zones to guide balls to their colour, cause/effect | TODO |

### Game 7 note (owner, 2026-09-30)
Qui mange qui ? keeps its levels in `games/food/levels.js`, not `levels.json` — an
accepted exception: its rounds are generated from the animal/food data, not hand-made
puzzles, and the consistency tests in `tests/food.test.mjs` act as its solver (every
round `makeRound` can build has exactly one right answer).

### Big update after game 10: new engine + rewards (owner, 2026-10-01)
From the Qui mange qui ? playtest: the kids finished all 7 levels in under 5 minutes.
They are quick and the games are too easy for them.
- **Plan:** finish game 7, then build games 8–10 with the current approach to validate
  the game ideas. Then switch engine and strategy, reusing what is already built and
  tested, so that **difficulty rises as they progress** instead of a few fixed levels.
- **Rewards:** stars work as motivation (they play on every phone to earn them), but
  they complain the sticker album fills up far too fast. The reward system needs an
  alternative or an evolution, ideally together with the new-engine games. To design
  as part of that big update; nothing to change before then.
- **Engine:** levels in `levels.json` + `solver.mjs`, checked by the gate (see "Level
  data" in `CLAUDE.md`). Games 8–10 keep `levels.js` (owner, 2026-10-01).
- **Review (owner, 2026-10-01):** until game 10, each checkpoint (proposal, art
  contact sheet, first playable, final gate report) goes to `docs/mailbox/` for the
  owner's external reviewer. After game 10: add a read-only "project-manager" subagent
  that reviews proposals against the project standards before they reach the owner; it
  replaces the mailbox as the first review layer. Roadmap only — not built yet.

### Backlog notes (games 11–14, owner, 2026-09-30)
All four: **original names and art only** — no assets, names or branding from the apps
that inspired them. Level-based: levels in `levels.json` (see "Level data" in
`CLAUDE.md`), hand-made for now (procedural generation comes later, in a separate
PRIVATE repo — never here). Games 12–14: ~30 hand-made levels for the v1 test, with a
clear difficulty curve.
- **11 Les Tubes Arc-en-ciel** — colour sort in tubes (Magic Sort-style). Unlimited
  undo; starts at 3 colours.
- **12 La Pâtisserie** — match-3 swap (Cookie Jam-style). No lives, no timer; simple
  goals (« collect 10 X »); auto-reshuffle when no move is left; hint after 5 s idle.
  The fun = cascades and combo feedback.
- **13 Les Paires** — mahjong-style pair matching on stacked tiles. Every board must be
  solvable: v1 levels are hand-made, so it needs a real `solver.mjs` (the gate checks
  every level). A free shuffle button.
- **14 Les Pompons** — move zones to guide fluffy balls to the matching colour (Fluffy
  Drop-style). No fail penalty; short levels.
