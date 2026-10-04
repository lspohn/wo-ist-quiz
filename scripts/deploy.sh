#!/usr/bin/env bash
# Eigenes Deployment (Beispiel): pusht nach einem Bare-Repo auf dem Zielrechner, checkt dort aus,
# baut das Image nativ und startet den Container neu. Anpassbar über Umgebungsvariablen:
#   DEPLOY_HOST (SSH-Ziel, Standard: raspi)   DEPLOY_REMOTE (Git-Remote, Standard: raspi)
#   DEPLOY_PORT (Standard: 7777)
set -euo pipefail
HOST="${DEPLOY_HOST:-raspi}"
REMOTE="${DEPLOY_REMOTE:-raspi}"
PORT="${DEPLOY_PORT:-7777}"
git push "$REMOTE" main
ssh "$HOST" PORT="$PORT" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
NAME=wo-ist-quiz
DIR="$HOME/$NAME"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin && git -C "$DIR" reset -q --hard origin/main
else git clone -q -b main "/git/$NAME.git" "$DIR"; fi
cd "$DIR"
docker build -q -t "$NAME:latest" .
# einmalige Übernahme der Bestenliste aus dem früheren Namen „laender-quiz“
if ! docker volume inspect "$NAME-data" >/dev/null 2>&1 && docker volume inspect laender-quiz-data >/dev/null 2>&1; then
  docker volume create "$NAME-data" >/dev/null
  docker run --rm -v laender-quiz-data:/from -v "$NAME-data":/to alpine sh -c 'cp -a /from/. /to/'
  echo "Bestenliste aus laender-quiz-data übernommen"
fi
docker rm -f "$NAME" laender-quiz >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped -p "$PORT:7777" -v "$NAME-data":/app/data "$NAME:latest" >/dev/null
sleep 2
curl -fsS "http://127.0.0.1:$PORT/health" && echo " – läuft auf Port $PORT"
REMOTE_SCRIPT
