// Frage- und Auflösungsphase: HUD oben, Bestätigen-/Ergebnis-Sheet unten.
import { h, fmt, toast, CATEGORY_LABEL } from './dom.js';

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
      h('div.hud-dots', {}, l.players.map((p) => h(`span.hud-dot${p.answered ? '.done' : ''}`, { '--c': p.color, title: p.name }))),
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
            app.send('guess', { country: candidate });
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

  function resultRow(l, r, idx) {
    const p = l.players.find((x) => x.id === r.id);
    const row = h('li.result', { '--c': p?.color ?? '#999', '--i': idx },
      h('div.result-line', {},
        h('span.player-dot', {}),
        h('span.result-name', {}, p?.name ?? '?'),
        h('span.result-guess', {}, r.guessName ?? '—', r.km ? ` · ${fmt(r.km)} km` : ''),
        h('span.result-points', {}, `+${fmt(r.points)}`),
      ),
      h('p.result-comment', {}, r.comment),
    );
    row.addEventListener('click', () => row.classList.toggle('open'));
    return row;
  }

  function reveal(l, fresh) {
    const rv = l.reveal;
    const mine = rv.results.find((r) => r.id === l.you);
    const isHost = l.hostId === l.you;
    autoNextAt = performance.now() + rv.autoNextMs;
    hud.hidden = false;
    hud.replaceChildren(
      h('div.hud-row', {}, h('span.hud-round', {}, `Runde ${l.roundNo}/${l.settings.rounds} · Auflösung`)),
      h('h2.hud-target.solved', {}, rv.target.name),
      h('p.hud-ask', {}, rv.target.continent),
    );
    hud.classList.remove('hurry');
    sheet.hidden = false;
    sheet.className = `sheet sheet-reveal cat-${mine?.category ?? 'none'}`;
    const others = rv.results.filter((r) => r.id !== l.you);
    sheet.replaceChildren(
      mine ? h('div.verdict', {},
        h('p.verdict-cat', {}, CATEGORY_LABEL[mine.category]),
        h('p.verdict-points', {}, `+${fmt(mine.points)}`, mine.bonus ? h('small', {}, ` inkl. ${mine.bonus} Tempo`) : null),
        h('p.verdict-detail', {}, mine.guessName ? `Dein Tipp: ${mine.guessName}${mine.km ? ` · ${fmt(mine.km)} km daneben` : ''}` : 'Kein Tipp abgegeben'),
        h('p.verdict-comment', {}, mine.comment),
      ) : null,
      others.length ? h('ul.results', {}, others.map((r, idx) => resultRow(l, r, idx))) : null,
      h('div.sheet-actions', {},
        isHost
          ? h('button.btn.btn-primary.btn-wide', { onclick: () => app.send('next') }, rv.last ? 'Zum Endstand' : 'Nächstes Land', h('span.auto-next', {}, ''))
          : h('p.waiting', {}, rv.last ? 'Gleich kommt der Endstand · ' : 'Nächste Runde in ', h('span.auto-next', {}, '')),
      ),
    );
    startTicker();
    if (!fresh) return;
    map.setInteractive(false);
    map.setCandidate(null);
    map.setLocked(null);
    map.setTarget(rv.target.i);
    const wrong = rv.results.filter((r) => r.guess != null && r.guess !== rv.target.i).map((r) => r.guess);
    map.setWrong(wrong);
    map.setMarkers(rv.results.filter((r) => r.guess != null).map((r) => {
      const p = l.players.find((x) => x.id === r.id);
      return { i: r.guess, color: p?.color ?? '#999', label: (p?.name ?? '?').slice(0, 1).toUpperCase() };
    }));
    const b = [...map.bounds(rv.target.i)];
    if (mine?.guess != null && mine.km != null && mine.km < 4000) {
      const g = map.bounds(mine.guess);
      b[0] = Math.min(b[0], g[0]); b[1] = Math.min(b[1], g[1]);
      b[2] = Math.max(b[2], g[2]); b[3] = Math.max(b[3], g[3]);
    }
    requestAnimationFrame(() => map.zoomToBounds(b, sheetInset()));
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
