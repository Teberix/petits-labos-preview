// Parent gate, two steps:
//  1. a button that only works when pressed and held for 3 seconds. A ring fills up
//     while holding (CSS transition); letting go early resets it. The timer is a plain
//     setTimeout, so it works even when the browser skips animation frames.
//  2. an adult question (a multiplication) answered on an on-screen keypad. A wrong answer
//     gives a neutral message and a new question — no lockout, no timer. Never read aloud.
import { h } from './dom.js';
import { ICONS } from './icons.js';
import { t } from './i18n.js';

const HOLD_MS = 3000;

// The adult question. `rng` returns a number in [0, 1) (Math.random by default).
// a in 12..29, b in 3..9 → the answer has at most 3 digits (max 29 × 9 = 261).
export function makeParentQuestion(rng = Math.random) {
  const a = 12 + Math.floor(rng() * 18);
  const b = 3 + Math.floor(rng() * 7);
  return { a, b, answer: a * b };
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'erase', '0', 'ok'];
let open = null; // the overlay on screen, if any

// Step 2: the question + keypad over the whole screen. Calls onPass() on a right answer.
function askQuestion(onPass) {
  if (open) return;
  let question = makeParentQuestion();
  let typed = '';

  const questionEl = h('p', { class: 'pg-question' });
  const answerEl = h('p', { class: 'pg-answer', 'aria-live': 'polite' });
  const msgEl = h('p', { class: 'pg-msg', role: 'status' });

  function newQuestion() {
    question = makeParentQuestion();
    typed = '';
    questionEl.textContent = `${question.a} × ${question.b} = ?`;
    answerEl.textContent = '';
  }

  function close() {
    overlay.remove();
    document.body.classList.remove('pg-open');
    open = null;
  }

  function press(key) {
    if (key === 'erase') typed = typed.slice(0, -1);
    else if (key === 'ok') {
      if (typed === '') return;
      if (Number(typed) === question.answer) { close(); onPass(); return; }
      newQuestion();
      msgEl.textContent = t('parentWrong');
      return;
    } else if (typed.length < 3) typed += key; // answers have at most 3 digits
    answerEl.textContent = typed; // the wrong-answer message stays until the next OK
  }

  const pad = h('div', { class: 'pg-pad' }, KEYS.map((key) => h('button', {
    type: 'button',
    class: `pg-key${key === 'ok' ? ' pg-ok' : ''}`,
    'data-key': key,
    'aria-label': key === 'erase' ? t('parentErase') : key === 'ok' ? 'OK' : null,
    onclick: () => press(key),
  }, key === 'erase' ? '⌫' : key === 'ok' ? 'OK' : key)));

  const cancel = h('button', { type: 'button', class: 'btn pg-cancel', onclick: close }, t('parentCancel'));
  const overlay = h('div', { class: 'pg-overlay', role: 'dialog', 'aria-label': t('parentTitle') },
    h('div', { class: 'pg-panel' },
      h('div', { class: 'pg-info' }, questionEl, answerEl, msgEl, cancel),
      pad));
  newQuestion();
  open = overlay;
  document.body.classList.add('pg-open'); // hides the screen behind (CSS): nothing to tap or scroll there
  document.body.append(overlay);
}

export function parentGateButton(onPass) {
  // pathLength="100" lets the CSS use simple 0–100 values for the ring.
  const ring = `<svg class="gate-ring" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="28" fill="none" stroke-width="6" pathLength="100"/></svg>`;
  const button = h('button', {
    class: 'icon-btn gate-btn',
    type: 'button',
    'aria-label': t('parentHold'),
    html: ring + ICONS.gear,
  });
  button.style.setProperty('--hold-ms', `${HOLD_MS}ms`);

  let timer = 0;

  function start(event) {
    // Capture keeps us receiving pointerup even if the finger slides a little.
    try { button.setPointerCapture(event.pointerId); } catch { /* still works without it */ }
    button.classList.add('holding');
    timer = setTimeout(() => {
      reset();
      askQuestion(onPass);
    }, HOLD_MS);
  }

  function reset() {
    clearTimeout(timer);
    button.classList.remove('holding');
  }

  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', reset);
  button.addEventListener('pointercancel', reset);
  // A long press on Android would otherwise open the context menu.
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  return button;
}
