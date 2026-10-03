// WebSocket mit automatischem Wiederverbinden. Identität pro Tab (sessionStorage),
// damit ein Reload oder ein schlafendes Handy denselben Spieler wiederfindet.

const KEY = 'laenderquiz.identity';
const NAME_KEY = 'laenderquiz.name';

function load(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}
function save(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* privat-Modus */ }
}

export function rememberedName() {
  return load(localStorage, NAME_KEY) ?? '';
}
export function rememberName(name) {
  save(localStorage, NAME_KEY, name);
}

/** Connect and dispatch server messages to `onMessage(msg)`. */
export function connect({ onMessage, onStatus }) {
  let ws = null;
  let retry = 0;
  let timer = null;

  function open() {
    clearTimeout(timer);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(`${proto}://${location.host}/ws`);
    ws = sock;
    ws.onopen = () => {
      retry = 0;
      onStatus?.('online');
      const id = load(sessionStorage, KEY) ?? {};
      ws.send(JSON.stringify({ type: 'hello', playerId: id.playerId, token: id.token, name: rememberedName() }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'welcome') save(sessionStorage, KEY, { playerId: msg.playerId, token: msg.token });
      onMessage(msg);
    };
    ws.onclose = () => {
      if (sock !== ws) return;
      onStatus?.('offline');
      const delay = Math.min(4000, 300 * 2 ** retry++);
      timer = setTimeout(open, delay);
    };
    ws.onerror = () => sock.close();
  }

  // Zurück aus dem Hintergrund: tote Verbindung sofort ersetzen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ws && ws.readyState > 1) open();
  });

  open();
  return {
    /** Returns false while offline; actions are never queued for later. */
    send(type, payload = {}) {
      if (ws?.readyState !== 1) return false;
      ws.send(JSON.stringify({ type, ...payload }));
      return true;
    },
  };
}
