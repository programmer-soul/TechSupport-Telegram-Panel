#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[techweb] Проверка Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не найден. Пытаюсь установить автоматически..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
    fi
    if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
    fi
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    echo "Автоустановка поддерживается только для Debian/Ubuntu (apt). Установите Docker вручную." >&2
    exit 1
  fi
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 не найден. Проверьте установку Docker." >&2
  exit 1
fi

echo "[techweb] Подготовка JWT ключей..."
mkdir -p backend/keys
if [ ! -f backend/keys/jwt_private.pem ]; then
  openssl genrsa -out backend/keys/jwt_private.pem 2048
  chmod 600 backend/keys/jwt_private.pem
fi
if [ ! -f backend/keys/jwt_public.pem ]; then
  openssl rsa -in backend/keys/jwt_private.pem -pubout -out backend/keys/jwt_public.pem
  chmod 644 backend/keys/jwt_public.pem
fi
echo "[techweb] Ключи лежат в backend/keys (хост), в контейнере путь /app/keys"

echo "[techweb] Проверка .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан файл .env. Заполните его и запустите install.sh снова."
  exit 0
fi

echo "[techweb] Проверка .env (загрузка переменных)..."
set -a
. ./.env
set +a

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-support}"

# Поднимаем только БД, чтобы она была готова к остальным сервисам
docker compose up -d db

# Ждем готовности БД
for i in {1..30}; do
  if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[techweb] Запуск контейнеров..."
docker compose up -d --build

echo "[techweb] Готово. Проверить статус: docker compose ps"
