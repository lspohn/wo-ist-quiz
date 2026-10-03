#!/usr/bin/env bash
# Deploy auf den Raspi: pushen, dort aus dem Bare-Repo auschecken, Image bauen, Container neu starten.
set -euo pipefail
git push raspi main
ssh raspi bash -s <<'REMOTE'
set -euo pipefail
DIR="$HOME/laender-quiz"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin && git -C "$DIR" reset -q --hard origin/main
else git clone -q /git/laender-quiz.git "$DIR"; fi
cd "$DIR"
docker build -q -t laender-quiz:latest .
docker rm -f laender-quiz >/dev/null 2>&1 || true
docker run -d --name laender-quiz --restart unless-stopped -p 7777:7777 laender-quiz:latest >/dev/null
sleep 2
curl -fsS http://127.0.0.1:7777/health && echo " – läuft auf http://192.168.178.5:7777"
REMOTE
