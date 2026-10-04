// Startseite, Lobby-Raum und Endstand.
import { h, fmt } from './dom.js';
import { highscorePanel } from './highscores.js';
import { MODES, MODE_IDS, levelOf } from './modes.js';

const PHASE_LABEL = { lobby: 'wartet', question: 'läuft', reveal: 'läuft', final: 'Endstand' };
const modeOf = (s) => MODES[s.mode] ?? MODES.welt;
const levelLabel = (s) => modeOf(s).levels[levelOf(s.mode, s.difficulty)].label;

function brand() {
  return h('header.brand', {},
    h('p.brand-kicker', {}, 'Ein Spiel für Leute, die nebeneinander sitzen'),
    h('h1.brand-title', {}, 'Wo', h('span', {}, 'ist?')),
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
    h('span.chip.chip-mode', {}, modeOf(s).label),
    h('span.chip', {}, levelLabel(s)),
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
      options.map(([v, text, sub]) => h(`button.seg${sub ? '.seg-two' : ''}`, {
        role: 'radio',
        'aria-checked': String(v === value),
        disabled: !enabled,
        onclick: () => onPick({ [key]: v }),
      }, h('span.seg-label', {}, text), sub ? h('small.seg-sub', {}, sub) : null)),
    ),
  );
}

/** score: 'game' (dieses Spiel), 'total' (Summe aller Spiele der Lobby) oder null */
function playerList(lobby, { score = null } = {}) {
  const players = score === 'total' ? [...lobby.players].sort((a, b) => b.total - a.total) : lobby.players;
  return h('ul.players', {}, players.map((p, idx) => h(`li.player${p.id === lobby.you ? '.player-me' : ''}`, { '--c': p.color, '--i': idx },
    score === 'total' ? h('span.player-rank', {}, `${idx + 1}.`) : null,
    h('span.player-dot', {}),
    h('span.player-name', {}, p.name),
    p.id === lobby.hostId ? h('span.tag', {}, 'Host') : null,
    p.id === lobby.you ? h('span.tag.tag-you', {}, 'du') : null,
    !p.connected ? h('span.tag.tag-off', {}, 'offline') : null,
    score ? h('span.player-score', {}, fmt(score === 'total' ? p.total : p.score)) : null,
  )));
}

function totalsSection(l) {
  if (l.gamesPlayed < 1) return null;
  return h('section', {},
    h('h2.section-title', {}, `Gesamtwertung · ${l.gamesPlayed} ${l.gamesPlayed === 1 ? 'Spiel' : 'Spiele'}`),
    playerList(l, { score: 'total' }),
  );
}

// Podesthöhe proportional zur Punktzahl, Achse beginnt nicht bei 0
function podiumHeight(score, scores) {
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  if (max === min) return 140;
  const base = min - (max - min) * 0.35;
  return Math.round(44 + 96 * ((score - base) / (max - base)));
}

// Kartenebenen als Schalter – gelten für alle in der Lobby
function mapToggles(s, isHost, set) {
  const toggle = (key, label) => h('button.toggle', {
    role: 'switch',
    'aria-checked': String(s[key] !== false),
    disabled: !isHost,
    onclick: () => set({ [key]: s[key] === false }),
  }, h('span.toggle-knob', {}), label);
  return h('div.setting', {},
    h('span.setting-label', {}, 'Orientierung auf der Karte'),
    h('div.toggles', {}, toggle('rivers', 'Flüsse & Seen'), toggle('relief', 'Gebirge (Relief)')),
  );
}

function modePicker(s, isHost, set) {
  return h('section.modes', { role: 'radiogroup', 'aria-label': 'Spielvariante' },
    h('h2.section-title', {}, 'Variante'),
    h('div.mode-grid', {}, MODE_IDS.map((id) => h('button.mode-card', {
      role: 'radio',
      'aria-checked': String(s.mode === id),
      disabled: !isHost,
      onclick: () => set({ mode: id, difficulty: Object.keys(MODES[id].levels)[0] }),
    }, h('span.mode-label', {}, MODES[id].label), h('span.mode-blurb', {}, MODES[id].blurb)))),
  );
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
    modePicker(s, isHost, set),
    h('section.settings', {},
      segmented('Schwierigkeit', 'difficulty', Object.entries(modeOf(s).levels).map(([k, v]) => [k, v.label, v.sub]), levelOf(s.mode, s.difficulty), isHost, set),
      segmented('Zeit pro Runde', 'timeLimit', [[15, '15 s'], [30, '30 s'], [45, '45 s']], s.timeLimit, isHost, set),
      segmented('Runden', 'rounds', [[5, '5'], [10, '10'], [15, '15']], s.rounds, isHost, set),
      h('p.hint', {}, modeOf(s).levels[levelOf(s.mode, s.difficulty)].hint),
      mapToggles(s, isHost, set),
    ),
    h('section', {},
      h('h2.section-title', {}, `Mitspieler (${l.players.length})`),
      playerList(l),
    ),
    totalsSection(l),
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
    h('p.brand-kicker', {}, `${modeOf(l.settings).label} · ${levelLabel(l.settings)} · ${l.settings.rounds} Runden`),
    h('h1.room-title', {}, 'Endstand'),
    h('div.podium', {}, order.map((p) => {
      const rank = l.players.indexOf(p) + 1;
      return h(`div.podium-step.rank${rank}`, { '--c': p.color, '--h': `${podiumHeight(p.score, top.map((x) => x.score))}px` },
        h('span.podium-name', {}, p.name),
        h('span.podium-score', {}, fmt(p.score)),
        h('span.podium-block', {}, String(rank)),
      );
    })),
    l.final?.highscoreRank ? h('p.hs-badge', {},
      h('span.hs-badge-rank', {}, `#${l.final.highscoreRank}`),
      h('span', {}, 'Du stehst in der Bestenliste', h('small', {}, `${modeOf(l.settings).label} · ${levelLabel(l.settings)} · ${l.settings.rounds} Runden`)),
    ) : null,
    l.final?.headline ? h('p.quip', {}, l.final.headline) : null,
    l.final?.mine ? h('div.quip-mine', {}, h('span.section-title', {}, 'Dein Fazit'), h('p.quip.quip-loser', {}, l.final.mine)) : null,
    l.players.length > 1 ? playerList(l, { score: 'game' }) : null,
    l.gamesPlayed > 1 ? totalsSection(l) : null,
    highscorePanel({ fixed: l.settings, highlight: l.final?.highscoreRank }),
    h('div.actions', {},
      isHost ? h('button.btn.btn-primary.btn-wide', { onclick: () => app.send('start') }, 'Nochmal, gleiche Einstellungen') : null,
      isHost ? h('button.btn.btn-ghost', { onclick: () => app.send('backToLobby') }, 'Einstellungen ändern') : null,
      !isHost ? h('p.waiting', {}, 'Der Host entscheidet, ob es eine Revanche gibt.') : null,
      h('button.btn.btn-ghost', { onclick: () => app.send('leaveLobby') }, 'Spiel verlassen'),
    ),
  );
}
