// Bestenliste: Tabs pro Schwierigkeit und Rundenzahl, Daten per HTTP.
import { h, fmt } from './dom.js';

const DIFFS = [['mittel', 'Mittel'], ['schwer', 'Schwer']];
const ROUNDS = [5, 10, 15];
let selected = { difficulty: 'mittel', rounds: 10 };
let cache = null;

async function load() {
  try {
    const res = await fetch('/api/highscores', { cache: 'no-store' });
    cache = res.ok ? await res.json() : {};
  } catch {
    cache = cache ?? {};
  }
  return cache;
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

function rows(list, highlight) {
  if (!list.length) return [h('li.hs-empty', {}, 'Noch leer. Ruhm wartet.')];
  return list.map((e, idx) => h(`li.hs-row${highlight === idx + 1 ? '.hs-me' : ''}`, { '--i': idx },
    h('span.hs-rank', {}, String(idx + 1)),
    h('span.hs-name', {}, e.name),
    h('span.hs-meta', {}, `${e.players > 1 ? `${e.players} Sp.` : 'solo'} · ${dateFmt.format(e.at)}`),
    h('span.hs-score', {}, fmt(e.score)),
  ));
}

/**
 * Highscore panel. With `fixed` settings (final screen) the tabs are hidden
 * and `highlight` marks the player's fresh rank.
 */
export function highscorePanel({ fixed = null, highlight = null } = {}) {
  if (fixed) selected = { difficulty: fixed.difficulty, rounds: fixed.rounds };
  const list = h('ol.hs-list', {});
  const tabs = h('div.hs-tabs', {});
  const panel = h('section.highscores', {},
    h('h2.section-title', {}, 'Bestenliste'),
    fixed ? null : tabs,
    list,
  );

  const fill = () => {
    const key = `${selected.difficulty}-${selected.rounds}`;
    list.replaceChildren(...rows(cache?.[key] ?? [], fixed ? highlight : null));
    if (fixed) return;
    const tab = (label, active, onclick) => h('button.hs-tab', { 'aria-pressed': String(active), onclick }, label);
    tabs.replaceChildren(
      h('div.hs-tabgroup', {}, DIFFS.map(([v, label]) => tab(label, selected.difficulty === v, () => { selected.difficulty = v; fill(); }))),
      h('div.hs-tabgroup', {}, ROUNDS.map((r) => tab(`${r} R.`, selected.rounds === r, () => { selected.rounds = r; fill(); }))),
    );
  };

  fill();
  load().then(fill);
  return panel;
}
