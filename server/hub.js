import { randomBytes } from 'node:crypto';
import { Lobby, sanitizeSettings } from './lobby.js';
import { lobbySummary, lobbyView } from './lobby-view.js';

const MAX_LOBBIES = 30;
const LOBBY_IDLE_MS = 10 * 60_000;
const PLAYER_IDLE_MS = 60 * 60_000;

const newId = (bytes) => randomBytes(bytes).toString('hex');

/** Clean user-provided names: trim, collapse whitespace, cap length. */
export function cleanName(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

/** Routes socket messages to players and lobbies. Transport-agnostic for tests. */
export class Hub {
  constructor({ data, clock, random, highscores = null } = {}) {
    this.data = data;
    this.highscores = highscores;
    this.clock = clock;
    this.random = random;
    this.players = new Map();
    this.lobbies = new Map();
  }

  connect(socket) {
    socket.playerId = null;
  }

  disconnect(socket) {
    const player = this.players.get(socket.playerId);
    if (!player) return;
    player.sockets.delete(socket);
    player.lastSeen = Date.now();
    if (player.sockets.size === 0) this.lobbyOf(player)?.setConnected(player.id, false);
  }

  handle(socket, msg) {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'hello') return this.hello(socket, msg);
    const player = this.players.get(socket.playerId);
    if (!player) return send(socket, { type: 'error', message: 'Bitte neu laden.' });
    const lobby = this.lobbyOf(player);
    switch (msg.type) {
      case 'setName': {
        const name = cleanName(msg.name);
        if (!name) return send(socket, { type: 'error', message: 'Bitte gib einen Namen ein.' });
        player.name = name;
        const lp = lobby?.players.get(player.id);
        if (lp) { lp.name = name; lobby.touch(); }
        this.sendSelf(player);
        return;
      }
      case 'createLobby': return this.createLobby(player, msg.settings);
      case 'joinLobby': return this.joinLobby(player, msg.lobbyId);
      case 'leaveLobby': return this.leaveLobby(player);
      case 'settings': return lobby?.updateSettings(player.id, msg.settings);
      case 'start': return lobby?.start(player.id);
      case 'guess': return lobby?.guess(player.id, msg.country, String(msg.key));
      case 'next': return lobby?.next(player.id, String(msg.key));
      case 'backToLobby': return lobby?.backToLobby(player.id);
      default: return undefined;
    }
  }

  hello(socket, msg) {
    // Eine Verbindung = eine Identität; weitere hellos liefern nur den Zustand erneut
    const bound = this.players.get(socket.playerId);
    if (bound) {
      send(socket, { type: 'welcome', playerId: bound.id, token: bound.token, name: bound.name });
      const lobby = this.lobbyOf(bound);
      if (lobby) this.sendLobby(lobby, bound);
      else this.sendLobbyList([bound]);
      return;
    }
    let player = this.players.get(msg.playerId);
    if (!player || player.token !== msg.token) {
      player = { id: newId(6), token: newId(16), name: '', lobbyId: null, sockets: new Set() };
      this.players.set(player.id, player);
    }
    if (!player.name && msg.name) player.name = cleanName(msg.name);
    socket.playerId = player.id;
    player.sockets.add(socket);
    player.lastSeen = Date.now();
    send(socket, { type: 'welcome', playerId: player.id, token: player.token, name: player.name });
    const lobby = this.lobbyOf(player);
    if (lobby) lobby.setConnected(player.id, true);
    if (lobby) this.sendLobby(lobby, player);
    else this.sendLobbyList([player]);
  }

  createLobby(player, settings) {
    if (!player.name) return this.sendError(player, 'Bitte gib zuerst einen Namen ein.');
    if (this.lobbies.size >= MAX_LOBBIES) return this.sendError(player, 'Zu viele Spiele offen.');
    this.leaveLobby(player, false);
    const lobby = new Lobby({
      id: newId(3),
      hostId: player.id,
      settings: sanitizeSettings(settings),
      data: this.data,
      clock: this.clock,
      random: this.random,
      onChange: (l) => this.broadcast(l),
      onFinish: (l) => this.highscores?.record(l.settings, l.standings()) ?? {},
    });
    this.lobbies.set(lobby.id, lobby);
    player.lobbyId = lobby.id;
    lobby.addPlayer({ id: player.id, name: player.name });
    this.broadcastLobbyList();
  }

  joinLobby(player, lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!player.name) return this.sendError(player, 'Bitte gib zuerst einen Namen ein.');
    if (!lobby) return this.sendError(player, 'Dieses Spiel gibt es nicht mehr.');
    if (player.lobbyId !== lobby.id) this.leaveLobby(player, false);
    player.lobbyId = lobby.id;
    if (!lobby.addPlayer({ id: player.id, name: player.name })) {
      player.lobbyId = null;
      return this.sendError(player, 'Das Spiel ist voll.');
    }
    this.broadcastLobbyList();
  }

  leaveLobby(player, notify = true) {
    const lobby = this.lobbyOf(player);
    player.lobbyId = null;
    if (lobby) {
      lobby.removePlayer(player.id);
      if (lobby.players.size === 0) this.closeLobby(lobby);
    }
    if (notify) this.broadcastLobbyList();
  }

  closeLobby(lobby) {
    lobby.dispose();
    this.lobbies.delete(lobby.id);
    for (const p of lobby.players.keys()) {
      const player = this.players.get(p);
      if (player?.lobbyId === lobby.id) player.lobbyId = null;
    }
  }

  lobbyOf(player) {
    return player?.lobbyId ? this.lobbies.get(player.lobbyId) : undefined;
  }

  broadcast(lobby) {
    for (const id of lobby.players.keys()) {
      const player = this.players.get(id);
      if (player) this.sendLobby(lobby, player);
    }
    this.broadcastLobbyList();
  }

  sendLobby(lobby, player) {
    for (const s of player.sockets) send(s, { type: 'lobby', lobby: lobbyView(lobby, player.id) });
  }

  broadcastLobbyList() {
    this.sendLobbyList([...this.players.values()].filter((p) => !p.lobbyId));
  }

  sendLobbyList(players) {
    const list = [...this.lobbies.values()].map(lobbySummary);
    for (const p of players) for (const s of p.sockets) send(s, { type: 'lobbies', lobbies: list });
  }

  sendSelf(player) {
    for (const s of player.sockets) send(s, { type: 'me', name: player.name });
  }

  sendError(player, message) {
    for (const s of player.sockets) send(s, { type: 'error', message });
  }

  /** Drop idle lobbies and long-gone players. */
  sweep(now = Date.now()) {
    let changed = false;
    for (const lobby of this.lobbies.values()) {
      const idle = lobby.connectedPlayers.length === 0 && now - lobby.lastActivity > LOBBY_IDLE_MS;
      if (idle) { this.closeLobby(lobby); changed = true; }
    }
    for (const p of this.players.values()) {
      if (p.sockets.size === 0 && !p.lobbyId && now - p.lastSeen > PLAYER_IDLE_MS) this.players.delete(p.id);
    }
    if (changed) this.broadcastLobbyList();
  }
}

function send(socket, data) {
  if (socket.readyState === 1) socket.send(JSON.stringify(data));
}
