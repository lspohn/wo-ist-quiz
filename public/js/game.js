// Frage- und Auflösungsphase: HUD oben, Bestätigen-/Ergebnis-Sheet unten.
import { h, toast } from './dom.js';
import { renderRevealPanel, showRevealOnMap } from './reveal.js';

const WATER_QUIPS = ['Das ist Wasser.', 'Ozean. Nicht wählbar, auch wenn er sich schön anfühlt.', 'Da schwimmen nur Fische.'];

/** Game-phase controller bound to the map. */
export function createGame(app, map) {
  const hud = document.getElementById('hud');
  const sheet = document.getElementById('sheet');
  let roundKey = null;
  let candidate = null;
  let deadline = 0;
  let limitMs = 1;
  let ticker = null;
  let autoNextAt = 0;

  function sheetInset() {
    const landscape = innerWidth > innerHeight && innerHeight < 560;
    return landscape
      ? { top: 70, bottom: 30, left: 30, right: sheet.offsetWidth + 40 }
      : { top: hud.offsetHeight + 30, bottom: sheet.offsetHeight + 30, left: 24, right: 24 };
  }

  function tick() {
    const left = Math.max(0, deadline - performance.now());
    const bar = hud.querySelector('.timer-fill');
    const num = hud.querySelector('.timer-num');
    if (bar) bar.style.transform = `scaleX(${left / limitMs})`;
    if (num) num.textContent = Math.ceil(left / 1000);
    hud.classList.toggle('hurry', left < 10_000 && left > 0);
    const auto = sheet.querySelector('.auto-next');
    if (auto) auto.textContent = `${Math.max(0, Math.ceil((autoNextAt - performance.now()) / 1000))} s`;
  }

  function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(tick, 200);
    tick();
  }

  function renderHud(l, q) {
    const answered = l.players.filter((p) => p.answered).length;
    hud.hidden = false;
    hud.replaceChildren(
      h('div.hud-row', {},
        h('span.hud-round', {}, `Runde ${l.roundNo}/${l.settings.rounds}`),
        h('span.hud-answered', {}, `${answered}/${l.players.filter((p) => p.connected).length} getippt`),
        h('span.timer-num', {}, Math.ceil(q.remainingMs / 1000)),
      ),
      h('p.hud-ask', {}, 'Wo liegt'),
      h('h2.hud-target', {}, q.target),
      h('div.timer', {}, h('div.timer-fill', {})),
      h('div.hud-dots', {}, l.players.map((p) => h(`span.hud-dot${p.answered ? '.done' : ''}${p.id === l.you ? '.me' : ''}`, { '--c': p.color },
        h('span.hud-dot-name', {}, p.id === l.you ? 'Du' : p.name)))),
    );
  }

  function renderPickSheet(l, q) {
    sheet.hidden = false;
    sheet.className = 'sheet sheet-pick';
    if (q.myGuess != null) {
      const waiting = l.players.filter((p) => p.connected && !p.answered).map((p) => p.name);
      sheet.replaceChildren(
        h('p.sheet-title', {}, 'Tipp ist drin.'),
        h('p.sheet-sub', {}, waiting.length ? `Warte auf ${waiting.join(', ')} …` : 'Gleich gibt’s die Auflösung.'),
      );
      return;
    }
    if (candidate == null) {
      sheet.replaceChildren(
        h('p.sheet-hint', {}, h('span.hold-icon', {}), h('span', {}, 'Land ', h('strong', {}, 'gedrückt halten'), ', um es zu markieren')),
      );
      return;
    }
    sheet.replaceChildren(
      h('p.sheet-title', {}, 'Land markiert'),
      h('p.sheet-sub', {}, 'Sicher? Danach gibt es kein Zurück.'),
      h('div.sheet-actions', {},
        h('button.btn.btn-ghost', { onclick: () => { candidate = null; map.setCandidate(null); renderPickSheet(l, q); } }, 'Verwerfen'),
        h('button.btn.btn-primary', {
          onclick: () => {
            if (!app.send('guess', { country: candidate, key: l.roundKey })) return;
            map.setLocked(candidate);
            map.setCandidate(null);
            navigator.vibrate?.(30);
          },
        }, 'Bestätigen'),
      ),
    );
  }

  function question(l, fresh) {
    const q = l.question;
    if (fresh) {
      candidate = null;
      map.resetGestures();
      map.clearAll();
      map.fitAll();
    }
    deadline = performance.now() + q.remainingMs;
    limitMs = q.limitMs;
    map.setInteractive(q.myGuess == null);
    if (q.myGuess != null) map.setLocked(q.myGuess);
    renderHud(l, q);
    renderPickSheet(l, q);
    startTicker();
  }

  function onLongPress(i) {
    const l = app.lobby;
    if (l?.phase !== 'question' || l.question.myGuess != null) return;
    if (i == null) { toast(WATER_QUIPS[Math.floor(Math.random() * WATER_QUIPS.length)]); return; }
    navigator.vibrate?.(18);
    candidate = i;
    map.setCandidate(i);
    renderPickSheet(l, l.question);
  }

  function reveal(l, fresh) {
    autoNextAt = performance.now() + l.reveal.autoNextMs;
    renderRevealPanel({ l, hud, sheet, app });
    startTicker();
    if (!fresh) return;
    map.resetGestures();
    map.setInteractive(false);
    showRevealOnMap({ l, map, inset: sheetInset });
    const mine = l.reveal.results.find((r) => r.id === l.you);
    if (mine?.category === 'exact') navigator.vibrate?.([20, 40, 20]);
  }

  return {
    render(l) {
      const key = `${l.id}:${l.roundNo}:${l.phase}`;
      const fresh = key !== roundKey;
      roundKey = key;
      if (l.phase === 'question') question(l, fresh);
      else if (l.phase === 'reveal') reveal(l, fresh);
    },
    hide() {
      clearInterval(ticker);
      hud.hidden = true;
      sheet.hidden = true;
      roundKey = null;
      candidate = null;
      map.clearAll();
      map.setInteractive(false);
    },
    onLongPress,
  };
}
