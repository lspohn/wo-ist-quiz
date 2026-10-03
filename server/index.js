import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import { loadCountries } from './geo.js';
import { Hub } from './hub.js';

const PORT = Number(process.env.PORT ?? 7777);
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

// Alle statischen Dateien einmal in den RAM laden (klein, Raspi-freundlich)
function loadStatic(dir) {
  const files = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      const body = readFileSync(full);
      const url = `/${relative(PUBLIC_DIR, full).split('\\').join('/')}`;
      files.set(url, { body, gz: gzipSync(body), type: TYPES[extname(name)] ?? 'application/octet-stream' });
    }
  };
  walk(dir);
  return files;
}

const files = loadStatic(PUBLIC_DIR);
const hub = new Hub({ countries: loadCountries() });

function pathOf(rawUrl) {
  try { return new URL(rawUrl, 'http://x').pathname; } catch { return null; }
}

const server = createServer((req, res) => {
  const url = pathOf(req.url);
  if (url === null) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  const file = files.get(url === '/' ? '/index.html' : url);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden');
    return;
  }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  res.writeHead(200, {
    'content-type': file.type,
    'cache-control': url.startsWith('/data/') ? 'public, max-age=86400' : 'no-cache',
    ...(gzip ? { 'content-encoding': 'gzip' } : {}),
    vary: 'accept-encoding',
  });
  res.end(gzip ? file.gz : file.body);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (socket) => {
  hub.connect(socket);
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    try { hub.handle(socket, msg); } catch (err) { console.error('handle failed', err); }
  });
  socket.on('close', () => hub.disconnect(socket));
  // z. B. Frame > maxPayload: nur diese Verbindung schließen, nie den Prozess
  socket.on('error', () => socket.terminate());
});

// Tote Verbindungen (schlafende Handys) erkennen
setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
  hub.sweep();
}, 20_000).unref();

wss.on('error', (err) => console.error('ws server error', err));
server.on('clientError', (_err, sock) => sock.destroy());

server.listen(PORT, '0.0.0.0', () => console.log(`Länderquiz läuft auf Port ${PORT}`));
