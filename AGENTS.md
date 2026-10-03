# Länderquiz

Multiplayer-Länderquiz fürs Heimnetz. Läuft als Docker-Container auf dem Raspi (`192.168.178.5:7777`).
Mobile first (Chrome, Touch, Hoch- und Querformat), UI-Sprache Deutsch.

## Architektur

- **Server** (`server/`, Node ≥ 22, nur Abhängigkeit `ws`): HTTP für statische Dateien (alles im RAM, gzip) + WebSocket `/ws`.
  Spielzustand komplett im Speicher; nur die Bestenliste wird als JSON-Datei gespeichert.
  - `hub.js` – Spieler-Identitäten (id + token), Lobby-Liste, Nachrichten-Routing
  - `lobby.js` – Zustandsmaschine `lobby → question ↔ reveal → final`, Timer, Host-Übergabe
  - `lobby-view.js` – Zustand pro Spieler serialisieren (fremde Tipps werden während der Frage nie verschickt)
  - `scoring.js` / `geo.js` – Punkte nach Grenz-zu-Grenz-Distanz (Haversine über gesampelte Grenzpunkte)
  - `comments.js` + `data/comments.js` – sarkastische Kommentare, keine Wiederholung innerhalb eines Spiels
  - `highscores.js` – Top 10 pro Schwierigkeit × Rundenzahl, JSON-Datei in `$DATA_DIR` (Docker-Volume `laender-quiz-data`), `GET /api/highscores`
- **Client** (`public/`, Vanilla-ES-Module, kein Build-Schritt): SVG-Weltkarte, eigene Pan/Pinch/Long-Press-Gesten.
  - Länder werden nur per Long-Press (550 ms) markiert und per Button bestätigt; Bewegung bricht den Press ab.
  - Die Karte enthält keine Ländernamen (nur numerische IDs), sonst könnte man schummeln.
  - Identität pro Tab in `sessionStorage` → Reload/Handy-Standby findet den Spieler wieder.

## Kartendaten

`npm run build:map` erzeugt aus Natural Earth 50m (Download nach `.cache/`) die eingecheckten Dateien
`public/data/map.json` (projizierte SVG-Pfade) und `server/data/countries.json` (Namen, Kontinent, Nachbarn, Grenzpunkte).
Zielländer und der Pool „mittel“ stehen in `scripts/countries-config.mjs`.

## Punkte

Exakt 1000 + bis zu 100 Tempobonus · Nachbarland 500 · sonst `450·e^(−km/1500)`, gleicher Kontinent mindestens 100 · keine Antwort 0.

## Entwickeln & Testen

```bash
npm install
PORT=7788 npm start   # http://localhost:7788
npm test              # node:test – Scoring, Lobby-Zustandsmaschine, Kommentare
```

## Deploy

`scripts/deploy.sh` pusht nach `raspi:/git/laender-quiz.git`, checkt auf dem Raspi nach `~/laender-quiz` aus,
baut das Image nativ (arm64) und startet den Container `laender-quiz` (`--restart unless-stopped`, Port 7777).
