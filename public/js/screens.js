// Startseite, Lobby-Raum und Endstand.
import { h, fmt } from './dom.js';
import { highscorePanel } from './highscores.js';

const PHASE_LABEL = { lobby: 'wartet', question: 'läuft', reveal: 'läuft', final: 'Endstand' };
const DIFF_LABEL = { mittel: 'Mittel', schwer: 'Schwer' };

function brand() {
  return h('header.brand', {},
    h('p.brand-kicker', {}, 'Ein Spiel für Leute, die nebeneinander sitzen'),
    h('h1.brand-title', {}, 'Länder', h('span', {}, 'quiz')),
  );
}

function nameField(app) {
  const input = h('input.name-input', {
    id: 'name', value: app.me.name, maxLength: 16, autocomplete: 'nickname',
    placeholder: 'Wie heißt du?', enterKeyHint: 'done',
  });
  const commit = () => app.setName(input.value);
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return h('label.field', { for: 'name' }, h('span.field-label', {}, 'Dein Name'), input);
}

function settingChips(s) {
  return h('div.chips', {},
    h('span.chip', {}, DIFF_LABEL[s.difficulty]),
    h('span.chip', {}, `${s.timeLimit} s`),
    h('span.chip', {}, `${s.rounds} Runden`),
  );
}

/** Home: name, create, list of open games. */
export function homeScreen(app) {
  const lobbies = app.lobbies;
  const list = lobbies.length
    ? lobbies.map((l, idx) => h('li.lobby-card', { '--i': idx },
      h('div.lobby-card-main', {},
        h('p.lobby-host', {}, `${l.host}s Spiel`),
        h('p.lobby-names', {}, l.names.join(' · ')),
        settingChips(l.settings),
      ),
      h('button.btn.btn-join', {
        onclick: () => app.join(l.id),
        'aria-label': `${l.host}s Spiel beitreten`,
      }, l.phase === 'lobby' ? 'Beitreten' : `Einsteigen · ${PHASE_LABEL[l.phase]}`),
    ))
    : [h('li.lobby-empty', {}, 'Noch kein Spiel offen. Mach doch eins auf.')];

  return h('div.panel.home', {},
    brand(),
    nameField(app),
    h('button.btn.btn-primary.btn-wide', { onclick: () => app.create() }, 'Neues Spiel eröffnen'),
    h('section.lobbies', {},
      h('h2.section-title', {}, 'Offene Spiele'),
      h('ul.lobby-list', {}, list),
    ),
    highscorePanel(),
  );
}

function segmented(label, key, options, value, enabled, onPick) {
  return h('div.setting', {},
    h('span.setting-label', {}, label),
    h('div.segmented', { role: 'radiogroup', 'aria-label': label },
      options.map(([v, text]) => h('button.seg', {
        role: 'radio',
        'aria-checked': String(v === value),
        disabled: !enabled,
        onclick: () => onPick({ [key]: v }),
      }, text)),
    ),
  );
}

function playerList(lobby, { showScore = false } = {}) {
  return h('ul.players', {}, lobby.players.map((p, idx) => h('li.player', { '--c': p.color, '--i': idx },
    h('span.player-dot', {}),
    h('span.player-name', {}, p.name),
    p.id === lobby.hostId ? h('span.tag', {}, 'Host') : null,
    p.id === lobby.you ? h('span.tag.tag-you', {}, 'du') : null,
    !p.connected ? h('span.tag.tag-off', {}, 'offline') : null,
    showScore ? h('span.player-score', {}, fmt(p.score)) : null,
  )));
}

/** Waiting room with settings (editable by host). */
export function roomScreen(app) {
  const l = app.lobby;
  const isHost = l.hostId === l.you;
  const s = l.settings;
  const set = (patch) => app.send('settings', { settings: { ...s, ...patch } });
  const host = l.players.find((p) => p.id === l.hostId);
  return h('div.panel.room', {},
    h('header.room-head', {},
      h('p.brand-kicker', {}, isHost ? 'Du bist Host' : `Host: ${host?.name ?? '?'}`),
      h('h1.room-title', {}, 'Lobby'),
    ),
    h('section.settings', {},
      segmented('Schwierigkeit', 'difficulty', [['mittel', 'Mittel'], ['schwer', 'Schwer']], s.difficulty, isHost, set),
      segmented('Zeit pro Runde', 'timeLimit', [[30, '30 s'], [60, '60 s']], s.timeLimit, isHost, set),
      segmented('Runden', 'rounds', [[5, '5'], [10, '10'], [15, '15']], s.rounds, isHost, set),
      h('p.hint', {}, s.difficulty === 'mittel'
        ? 'Mittel: rund 120 bekanntere Länder.'
        : 'Schwer: alle 197 Länder – inklusive Tuvalu, Nauru und Konsorten.'),
    ),
    h('section', {},
      h('h2.section-title', {}, `Mitspieler (${l.players.length})`),
      playerList(l),
    ),
    h('div.actions', {},
      isHost
        ? h('button.btn.btn-primary.btn-wide', { onclick: () => app.send('start') }, 'Spiel starten')
        : h('p.waiting', {}, 'Warte, bis der Host startet …'),
      h('button.btn.btn-ghost', { onclick: () => app.send('leaveLobby') }, 'Verlassen'),
    ),
  );
}

/** Final standings with podium. */
export function finalScreen(app) {
  const l = app.lobby;
  const isHost = l.hostId === l.you;
  const top = l.players.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return h('div.panel.final', {},
    h('p.brand-kicker', {}, `${l.settings.rounds} Runden · ${DIFF_LABEL[l.settings.difficulty]}`),
    h('h1.room-title', {}, 'Endstand'),
    h('div.podium', {}, order.map((p) => {
      const rank = l.players.indexOf(p) + 1;
      return h(`div.podium-step.rank${rank}`, { '--c': p.color },
        h('span.podium-name', {}, p.name),
        h('span.podium-score', {}, fmt(p.score)),
        h('span.podium-block', {}, String(rank)),
      );
    })),
    l.final?.highscoreRank ? h('p.hs-badge', {},
      h('span.hs-badge-rank', {}, `#${l.final.highscoreRank}`),
      h('span', {}, 'Du stehst in der Bestenliste', h('small', {}, `${DIFF_LABEL[l.settings.difficulty]} · ${l.settings.rounds} Runden`)),
    ) : null,
    l.final?.winner ? h('p.quip', {}, l.final.winner) : null,
    l.final?.loser ? h('p.quip.quip-loser', {}, l.final.loser) : null,
    playerList(l, { showScore: true }),
    highscorePanel({ fixed: l.settings, highlight: l.final?.highscoreRank }),
    h('div.actions', {},
      isHost ? h('button.btn.btn-primary.btn-wide', { onclick: () => app.send('start') }, 'Nochmal, gleiche Einstellungen') : null,
      isHost ? h('button.btn.btn-ghost', { onclick: () => app.send('backToLobby') }, 'Einstellungen ändern') : null,
      !isHost ? h('p.waiting', {}, 'Der Host entscheidet, ob es eine Revanche gibt.') : null,
      h('button.btn.btn-ghost', { onclick: () => app.send('leaveLobby') }, 'Spiel verlassen'),
    ),
  );
}
