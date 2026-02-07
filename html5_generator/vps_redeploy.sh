#!/usr/bin/env bash
set -euo pipefail

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is not installed. Install docker compose plugin or docker-compose."
  exit 1
fi

git pull --ff-only
"${COMPOSE_CMD[@]}" down
"${COMPOSE_CMD[@]}" up -d --build --remove-orphans
"${COMPOSE_CMD[@]}" ps
"${COMPOSE_CMD[@]}" logs --tail=120 playable-bot playable-admin
