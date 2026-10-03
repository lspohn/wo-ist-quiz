// Auflösung: Karte (Ziel pulsiert, Tipps in Spielerfarben mit Linien) und Ergebnistabelle.
import { h, fmt, flag, noted, fill, CATEGORY_LABEL } from './dom.js';
import { leaveButton } from './leave.js';

const initials = (name) => name.trim().slice(0, 2);

function resultRow(l, r, idx, isMe) {
  const p = l.players.find((x) => x.id === r.id);
  const row = h(`li.result${isMe ? '.result-me' : ''}`, { '--c': p?.color ?? '#999', '--i': idx },
    h('span.result-rank', {}, String(idx + 1)),
    h('span.result-who', {},
      h('span.result-name', {}, h('span.player-dot', {}), p?.name ?? '?', isMe ? h('span.tag.tag-you', {}, 'du') : null),
      h('span.result-guess', {}, flag(r.guessFlag, 'mini-flag'), r.guessName ?? 'kein Tipp', r.km ? ` · ${fmt(r.km)} km` : ''),
    ),
    h('span.result-pts', {},
      h('span.result-points', {}, `+${fmt(r.points)}`),
      h('span.result-total', {}, `Σ ${fmt(p?.score ?? 0)}`),
    ),
    isMe ? null : h('p.result-comment', {}, r.comment),
  );
  if (!isMe) row.addEventListener('click', () => row.classList.toggle('open'));
  return row;
}

/** Render the reveal sheet and HUD. */
export function renderRevealPanel({ l, hud, sheet, app }) {
  const rv = l.reveal;
  const mine = rv.results.find((r) => r.id === l.you);
  const isHost = l.hostId === l.you;
  hud.hidden = false;
  hud.classList.remove('hurry');
  fill(hud, 
    h('div.hud-row', {}, leaveButton(app), h('span.hud-round', {}, `Runde ${l.roundNo}/${l.settings.rounds} · Auflösung`)),
    h('h2.hud-target.solved', {}, flag(rv.target.flag, 'hud-flag'), ...noted(rv.target.name, rv.target.note)),
    h('p.hud-ask', {}, rv.target.sub ?? ''),
    rv.target.note ? h('p.hud-note', {}, `* ${rv.target.note}`) : null,
  );
  sheet.hidden = false;
  sheet.className = `sheet sheet-reveal cat-${mine?.category ?? 'none'}`;
  fill(sheet, 
    mine ? h('div.verdict', {},
      h('div.verdict-head', {},
        h('span.verdict-cat', {}, CATEGORY_LABEL[mine.category]),
        h('span.verdict-detail', {}, mine.guessName
          ? `${mine.guessName}${mine.km ? ` · ${fmt(mine.km)} km` : ''}${mine.bonus ? ` · +${mine.bonus} Tempo` : ''}`
          : 'kein Tipp'),
      ),
      h('p.verdict-comment', {}, mine.comment),
    ) : null,
    h('ol.results', {}, rv.results.map((r, idx) => resultRow(l, r, idx, r.id === l.you))),
    h('div.sheet-actions', {},
      isHost
        ? h('button.btn.btn-primary.btn-wide', { onclick: () => app.send('next', { key: l.roundKey }) },
          rv.last ? 'Zum Endstand' : 'Nächste Runde', h('span.auto-next', {}, ''))
        : h('p.waiting', {}, rv.last ? 'Gleich kommt der Endstand · ' : 'Nächste Runde in ', h('span.auto-next', {}, '')),
    ),
  );
}

/** Mark target, guesses, lines and zoom so that every pin is visible. */
export function showRevealOnMap({ l, map, inset }) {
  const rv = l.reveal;
  const targetAt = map.anchor(rv.target.i);
  const guessed = rv.results.filter((r) => r.guess != null);
  const color = (id) => l.players.find((p) => p.id === id)?.color ?? '#999';

  map.setCandidate(null);
  map.setLocked(null);
  map.setTarget(rv.target.i);
  // Falsche Tipps in Spielerfarbe; eigener Tipp hat Vorrang, falls mehrere dasselbe Land tippen
  const fills = new Map();
  for (const r of [...guessed].sort((a, b) => Number(a.id === l.you) - Number(b.id === l.you))) {
    if (r.guess !== rv.target.i) fills.set(r.guess, color(r.id));
  }
  map.setGuessFills([...fills].map(([i, c]) => ({ i, color: c })));

  const stack = new Map();
  const pins = guessed.map((r) => {
    const n = stack.get(r.guess) ?? 0;
    stack.set(r.guess, n + 1);
    const p = l.players.find((x) => x.id === r.id);
    const me = r.id === l.you;
    return { at: map.anchor(r.guess), color: color(r.id), label: me ? 'Du' : initials(p?.name ?? '?'), me, offset: n };
  });
  // eigener Pin zuletzt, damit er oben liegt
  pins.sort((a, b) => Number(a.me) - Number(b.me));
  map.overlay.setPins(pins);
  map.overlay.setLines(guessed.filter((r) => r.guess !== rv.target.i)
    .map((r) => ({ from: map.anchor(r.guess), to: targetAt, color: color(r.id), me: r.id === l.you })));
  map.overlay.setPing(targetAt);
  map.overlay.setFlag(rv.target.flag ? targetAt : null, rv.target.flag);

  const b = [...map.coreBounds(rv.target.i)];
  for (const r of guessed) {
    const [x, y] = map.anchor(r.guess);
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  requestAnimationFrame(() => map.zoomToBounds(b, inset()));
}
