# Wo ist? (wo-ist-quiz)

Multiplayer-Kartenquiz fürs Heimnetz/Intranet, als Docker-Container selbst gehostet (siehe `README.md`).
Mobile first (Chrome/Safari, Touch, Hoch- und Querformat), UI-Sprache Deutsch.
Lizenz: Code AGPL-3.0 (`LICENSE`), Texte CC BY 4.0 (`LICENSE-CONTENT.md`), Datenquellen in `QUELLEN.md`.

## Architektur

- **Server** (`server/`, Node ≥ 22, nur Abhängigkeit `ws`): HTTP für statische Dateien (alles im RAM, gzip) + WebSocket `/ws`.
  Spielzustand komplett im Speicher; nur die Bestenliste wird als JSON-Datei gespeichert.
  - `hub.js` – Spieler-Identitäten (id + token), Lobby-Liste, Nachrichten-Routing
  - `lobby.js` – Zustandsmaschine `lobby → question ↔ reveal → final`, Timer, Host-Übergabe
  - `lobby-view.js` – Zustand pro Spieler serialisieren (fremde Tipps werden während der Frage nie verschickt)
  - `scoring.js` / `geo.js` – Punkte nach Grenz-zu-Grenz-Distanz (Haversine über gesampelte Grenzpunkte)
  - `comments.js` + `data/comments.js` – sarkastische Kommentare, keine Wiederholung innerhalb eines Spiels
  - `modes.js` + `public/js/modes.js` (gemeinsame Konfiguration) – Varianten Welt, Europa, Europa-Städte,
    Deutschland, USA, Deutschland-Städte: Fragenpools, Hauptstadtfragen, Wertung (Flächen nach Grenzabstand, Städte nach km)
  - `deck.js` – gemischter Stapel pro Lobby/Variante, Wiederholung erst wenn alle Fragen dran waren
  - `highscores.js` – Top 10 pro Schwierigkeit × Rundenzahl, JSON-Datei in `$DATA_DIR` (Docker-Volume `wo-ist-data` bzw. `wo-ist-quiz-data`), `GET /api/highscores`
- **Client** (`public/`, Vanilla-ES-Module, kein Build-Schritt): SVG-Weltkarte, eigene Pan/Pinch/Long-Press-Gesten.
  - Länder werden nur per Long-Press (550 ms) markiert und per Button bestätigt; Bewegung bricht den Press ab.
  - Die Karte enthält keine Ländernamen (nur numerische IDs), sonst könnte man schummeln.
  - Identität pro Tab in `sessionStorage` → Reload/Handy-Standby findet den Spieler wieder.

## Kartendaten

- `node scripts/fetch-places.mjs` – Städte-Schnappschuss nach `scripts/data/` (Wikidata: deutsche Städte ≥ 20.000 mit
  Gemeindeschlüssel, Hauptstädte Europas; GeoNames cities15000 für kuratierte europäische Großstädte). Eingecheckt.
- `node scripts/build-germany.mjs` – Deutschland-Karte (Natural Earth 10m Bundesländer, Nachbarländer, Flüsse, Seen, Städte)
  → `public/data/germany.json`, `server/data/de-*.json`.
- `node scripts/build-usa.mjs` – USA-Karte (Albers mit Alaska/Hawaii als Einschub, Kanada/Mexiko als Kontext)
  → `public/data/usa.json`, `server/data/us-states.json`. Gemeinsame Helfer: `scripts/lib/regional.mjs`.
- `node scripts/copy-flags.mjs` – Flaggen nach `public/flags/` (flag-icons + Commons-Downloads aus `.cache/flags-de|us/`;
  sehr detailreiche Flaggen werden als kleines WebP in eine SVG-Hülle gerastert).
- `npm run build:map` erzeugt aus Natural Earth 10m (Download nach `.cache/`) die eingecheckten Dateien
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

- Selbst hosten: `docker compose up -d --build` (Port 7777, Volume für die Bestenliste) – Details im README.
- Eigenes Deployment per SSH: `scripts/deploy.sh` pusht auf ein Bare-Repo des Zielrechners (`DEPLOY_REMOTE`),
  baut dort nativ und startet den Container `wo-ist-quiz` neu (`DEPLOY_HOST`, `DEPLOY_PORT`).
  Übernimmt beim ersten Lauf die Bestenliste aus dem früheren Volume `laender-quiz-data`.
