import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { loadGameData } from './modes.js';
import { Highscores } from './highscores.js';
import { Hub } from './hub.js';

const PORT = Number(process.env.PORT ?? 7777);
const DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL('../data/', import.meta.url));
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
  '.webp': 'image/webp',
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
      const hash = createHash('sha1').update(body).digest('base64url').slice(0, 16);
      // eigener starker ETag je Codierung (RFC 9110 §8.8.3)
      files.set(url, { body, gz: gzipSync(body), etag: `"${hash}"`, etagGz: `"${hash}-gz"`, type: TYPES[extname(name)] ?? 'application/octet-stream' });
    }
  };
  walk(dir);
  return files;
}

const files = loadStatic(PUBLIC_DIR);
const highscores = new Highscores(join(DATA_DIR, 'highscores.json'));
const hub = new Hub({ data: loadGameData(), highscores });

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
  if (url === '/api/highscores') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(highscores.all()));
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
  // Immer revalidieren (ETag → 304): Kartendaten und Server-Indizes müssen zusammenpassen,
  // ein veralteter Cache würde Länder an falscher Stelle zeigen.
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  const etag = gzip ? file.etagGz : file.etag;
  const match = (req.headers['if-none-match'] ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''));
  if (match.includes(etag)) {
    res.writeHead(304, { etag, 'cache-control': 'no-cache', vary: 'accept-encoding' });
    res.end();
    return;
  }
  res.writeHead(200, {
    'content-type': file.type,
    etag,
    'cache-control': 'no-cache',
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

server.listen(PORT, '0.0.0.0', () => console.log(`Wo ist? läuft auf Port ${PORT}`));
