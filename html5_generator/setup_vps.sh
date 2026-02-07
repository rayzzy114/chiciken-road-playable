#!/usr/bin/env bash
set -euo pipefail

SUDO=""
if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh

echo "Installing Docker Compose plugin..."
$SUDO apt-get update
$SUDO apt-get install -y docker-compose-plugin

echo "Adding current user to docker group..."
$SUDO usermod -aG docker "$USER" || true

COMPOSE_CMD="docker compose"
if ! docker compose version >/dev/null 2>&1 && command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
fi

echo "------------------------------------------------"
echo "VPS Docker setup complete."
echo "Re-login to apply docker group changes, then run:"
echo "1) cp .env.example .env"
echo "2) edit .env"
echo "3) ${COMPOSE_CMD} up -d --build"
echo "4) ${COMPOSE_CMD} logs -f playable-bot playable-admin"
echo "------------------------------------------------"
