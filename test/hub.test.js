import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCountries } from '../server/geo.js';
import { Hub } from '../server/hub.js';

const countries = loadCountries();
const sock = () => ({ readyState: 1, sent: [], send(d) { this.sent.push(JSON.parse(d)); } });

test('repeated hello on one socket does not create ghost players', () => {
  const hub = new Hub({ countries });
  const s = sock();
  hub.connect(s);
  for (let k = 0; k < 5; k++) {
    hub.handle(s, { type: 'hello', name: `X${k}` });
    hub.handle(s, { type: 'createLobby' });
  }
  hub.disconnect(s);
  assert.equal(hub.players.size, 1);
  assert.equal(hub.lobbies.size, 1);
  const lobby = [...hub.lobbies.values()][0];
  assert.equal(lobby.connectedPlayers.length, 0);
});
