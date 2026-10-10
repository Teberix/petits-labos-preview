# Parent gate: adult question

Model: Sonnet 5.5 (session model). Task brief named Opus 5.5.
Read list: js/parentgate.js, hub.js and profiles.js callers, js/screens/checks.js, parent strings in fr/es/en.

## Result
- Commit `50d0474` on `dev`: "Parent gate: adult multiplication after the hold". Pushed.
- Preview `0.11.0-preview.18`: hash `fea5cd6` on `Teberix/petits-labos-preview` main. Replaced `8bf4962` (0.10.0-preview.17).

## Usage
1. Hold the gear button 3 s (unchanged).
2. A full-screen question appears: `a × b = ?`. `a` is 12..29, `b` is 3..9.
3. Type the answer on the keypad. Maximum 3 digits. Press OK.
4. Right answer: the parent area opens, as before.
5. Wrong answer: neutral message and a new question. No lockout, no timer.
6. Press "Cancel" to go back. The question is never read aloud.

Both callers (hub, profiles) use `parentGateButton`. No other caller exists.

## Changes
- `js/parentgate.js`: `makeParentQuestion(rng)` (pure), keypad overlay.
- `css/base.css`: `.pg-*` rules. `body.pg-open #app` is hidden while the question is open.
- `js/i18n/{fr,es,en}.js`: `parentWrong`, `parentErase`, `parentCancel`.
- `tests/parentgate.test.mjs`: ranges, answer = a × b, 3 digits maximum, extremes.
- `js/screens/checks.js`: `passGate()` reads a and b from the question text. The answer is not in the DOM. New worst case "parent gate, keypad" (3 digits typed, wrong message shown). Selectors `.pg-key`, `.pg-cancel` added to the touch list.
- No storage change. No new app file.

## Gate tails
- `node --test tests/*.test.mjs`: 230 pass, 0 fail.
- `gate --quick`: GATE PASSED. unit 230, privacy ok, levels 41 ok, layout 315 screens ok, offline 120 files ok.
- `gate --only privacy`: pass.
- Full gate and `pwa-guardian`: not run (owner runs them).

## Risks
- Keypad layout was checked at 3 sizes only (360x640, 640x360, 1366x657). The 7-size run is in the owner's full gate.
- Two quick-gate runs failed before the final pass. Cause 1: the wrong-answer message cleared on the next key. Cause 2: the hub stayed in the layout behind the overlay. Both fixed.
- Landscape phones: question left, keypad right (`max-height: 520px`). Check by hand on the tablet.
- The message "Answer to enter. Try again!" and its es/fr versions are plain wording. Review them.
- Real touch feel is not covered by the gate.
- A parent with a device whose `#app` hiding fails would see the hub behind the overlay. Not seen in Chromium.
