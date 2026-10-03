import { connect, rememberName, rememberedName } from './net.js';
import { createMap } from './map-view.js';
import { createGame } from './game.js';
import { homeScreen, roomScreen, finalScreen } from './screens.js';
import { toast } from './dom.js';

const screenEl = document.getElementById('screen');
const ring = document.getElementById('press-ring');
const connEl = document.getElementById('conn');

const app = {
  me: { playerId: null, name: rememberedName() },
  lobbies: [],
  lobby: null,
  net: null,
  send(type, payload) { app.net.send(type, payload); },
  setName(raw) {
    const name = raw.trim().slice(0, 16);
    if (!name || name === app.me.name) return;
    app.me.name = name;
    rememberName(name);
    app.send('setName', { name });
  },
  ensureName() {
    const input = document.getElementById('name');
    if (input?.value.trim()) app.setName(input.value);
    if (!app.me.name) {
      toast('Erst einen Namen eintragen.');
      input?.focus();
      return false;
    }
    return true;
  },
  create() { if (app.ensureName()) app.send('createLobby'); },
  join(id) { if (app.ensureName()) app.send('joinLobby', { lobbyId: id }); },
};

// ---- Wake Lock: Display bleibt während des Spiels an
let wakeLock = null;
async function setWakeLock(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* nicht unterstützt oder verweigert */ }
}

const map = await createMap(document.getElementById('map'), {
  onLongPressStart(x, y, ms) {
    if (app.lobby?.phase !== 'question' || app.lobby.question.myGuess != null) return;
    ring.hidden = false;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.setProperty('--ms', `${ms}ms`);
    ring.classList.remove('run');
    void ring.offsetWidth;
    ring.classList.add('run');
  },
  onLongPressCancel() { ring.hidden = true; ring.classList.remove('run'); },
  onLongPress(i) {
    ring.hidden = true;
    ring.classList.remove('run');
    game.onLongPress(i);
  },
});
const game = createGame(app, map);
map.setInteractive(false);

let lastScreen = null;
function render() {
  const l = app.lobby;
  const phase = l?.phase ?? 'home';
  const inGame = phase === 'question' || phase === 'reveal';
  document.body.dataset.phase = phase;
  setWakeLock(inGame);
  if (inGame) {
    screenEl.replaceChildren();
    screenEl.hidden = true;
    game.render(l);
    lastScreen = phase;
    return;
  }
  if (lastScreen === 'question' || lastScreen === 'reveal') game.hide();
  const focused = document.activeElement?.id;
  const view = phase === 'home' ? homeScreen(app) : phase === 'final' ? finalScreen(app) : roomScreen(app);
  screenEl.hidden = false;
  if (lastScreen !== phase) screenEl.scrollTop = 0;
  screenEl.replaceChildren(view);
  if (focused === 'name' && phase === 'home') {
    const input = document.getElementById('name');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
  lastScreen = phase;
}

app.net = connect({
  onStatus(status) { connEl.hidden = status === 'online'; },
  onMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        app.me.playerId = msg.playerId;
        if (msg.name) app.me.name = msg.name;
        else if (app.me.name) app.send('setName', { name: app.me.name });
        break;
      case 'me':
        app.me.name = msg.name;
        return;
      case 'lobbies':
        app.lobbies = msg.lobbies;
        if (app.lobby) { app.lobby = null; }
        break;
      case 'lobby':
        app.lobby = msg.lobby;
        break;
      case 'error':
        toast(msg.message, 3000);
        return;
      default:
        return;
    }
    // Während der Namenseingabe die Startseite nicht neu aufbauen
    if (!app.lobby && document.activeElement?.id === 'name') return;
    render();
  },
});

render();
