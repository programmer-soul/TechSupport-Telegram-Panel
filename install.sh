#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

NO_BUILD=0
PULL=0
DB_WAIT_SECONDS=90

usage() {
  cat <<'EOF'
Использование: ./install.sh [параметры]

Параметры:
  --no-build         Запуск без сборки образов (docker compose up -d)
  --pull             Подтянуть последние образы перед запуском
  --db-wait N        Ждать готовности PostgreSQL до N секунд (по умолчанию: 90)
  -h, --help         Показать эту справку
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-build) NO_BUILD=1 ;;
    --pull) PULL=1 ;;
    --db-wait)
      shift
      DB_WAIT_SECONDS="${1:-90}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[techweb] Неизвестный параметр: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

log() {
  printf '[techweb] %s\n' "$*"
}

warn() {
  printf '[techweb][warn] %s\n' "$*" >&2
}

die() {
  printf '[techweb][error] %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Не найдена обязательная команда: $1"
}

ensure_docker() {
  log "Проверка Docker..."
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  warn "Docker не найден. Пытаюсь установить автоматически..."
  if ! command -v apt-get >/dev/null 2>&1; then
    die "Автоустановка поддерживается только на Debian/Ubuntu (apt). Установите Docker вручную."
  fi
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    die "Для автоустановки Docker нужны права root. Запустите через sudo."
  fi

  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
    # Поддерживаем Ubuntu и Debian корректно (не хардкодим ubuntu URL для всех).
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian) ;;
      *) die "Автоустановка Docker поддерживается только для Ubuntu/Debian (ID=${ID:-unknown})" ;;
    esac
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  fi
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

prepare_jwt_keys() {
  log "Подготовка JWT-ключей..."
  need_cmd openssl
  mkdir -p backend/keys

  if [ ! -f backend/keys/jwt_private.pem ]; then
    openssl genrsa -out backend/keys/jwt_private.pem 2048 >/dev/null 2>&1
    chmod 600 backend/keys/jwt_private.pem
    log "Создан backend/keys/jwt_private.pem"
  fi
  if [ ! -f backend/keys/jwt_public.pem ]; then
    openssl rsa -in backend/keys/jwt_private.pem -pubout -out backend/keys/jwt_public.pem >/dev/null 2>&1
    chmod 644 backend/keys/jwt_public.pem
    log "Создан backend/keys/jwt_public.pem"
  fi
}

ensure_env_file() {
  log "Проверка .env..."
  if [ ! -f .env ]; then
    cp .env.example .env
    warn "Файл .env создан из .env.example"
    warn "Заполните .env и запустите ./install.sh снова"
    exit 0
  fi
}

validate_env() {
  log "Загрузка .env..."
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a

  local required_vars=(
    SECRET_KEY
    POSTGRES_USER
    POSTGRES_PASSWORD
    POSTGRES_DB
    POSTGRES_DSN
    BOT_INTERNAL_TOKEN
    PANEL_ORIGIN
    DOMAIN
  )
  local missing=()
  local key val
  for key in "${required_vars[@]}"; do
    val="${!key:-}"
    if [ -z "$val" ]; then
      missing+=("$key")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    printf '[techweb][error] В .env не заполнены переменные: %s\n' "${missing[*]}" >&2
    exit 1
  fi

  if printf '%s\n' "${SECRET_KEY:-}" "${BOT_INTERNAL_TOKEN:-}" | grep -qi 'change-me'; then
    warn "В .env остались плейсхолдеры секретов (change-me*)"
  fi
  if printf '%s\n' "${DOMAIN:-}" "${PANEL_ORIGIN:-}" | grep -qi 'example.com'; then
    warn "DOMAIN/PANEL_ORIGIN похожи на примерные значения. SSL/авторизация могут не работать."
  fi
}

wait_for_db() {
  local pg_user="${POSTGRES_USER:-postgres}"
  local pg_db="${POSTGRES_DB:-support}"
  local started_at now elapsed
  started_at="$(date +%s)"

  log "Запуск контейнера PostgreSQL..."
  docker compose up -d db

  log "Ожидание готовности БД (таймаут: ${DB_WAIT_SECONDS}с)..."
  while true; do
    if docker compose exec -T db pg_isready -U "$pg_user" -d "$pg_db" >/dev/null 2>&1; then
      log "PostgreSQL готов"
      return 0
    fi
    now="$(date +%s)"
    elapsed="$((now - started_at))"
    if [ "$elapsed" -ge "$DB_WAIT_SECONDS" ]; then
      docker compose logs --tail=80 db || true
      die "БД не стала готова за ${DB_WAIT_SECONDS}с"
    fi
    sleep 1
  done
}

start_stack() {
  if [ "$PULL" -eq 1 ]; then
    log "Подтягиваю последние образы..."
    docker compose pull
  fi

  if [ "$NO_BUILD" -eq 1 ]; then
    log "Запуск стека без сборки..."
    docker compose up -d
  else
    log "Запуск стека со сборкой..."
    docker compose up -d --build
  fi
}

validate_cli_args() {
  case "${DB_WAIT_SECONDS}" in
    ''|*[!0-9]*)
      die "Параметр --db-wait должен быть целым числом в секундах"
      ;;
  esac
  if [ "${DB_WAIT_SECONDS}" -lt 1 ]; then
    die "Параметр --db-wait должен быть больше 0"
  fi
}

post_summary() {
  local domain="${DOMAIN:-localhost}"
  local panel_origin="${PANEL_ORIGIN:-https://${domain}}"
  log "Готово"
  log "URL панели: ${panel_origin}"
  log "Статус: docker compose ps"
  log "Логи: docker compose logs -f"
  log "Логи backend: docker compose logs -f backend"
}

ensure_docker
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 недоступен"
validate_cli_args
prepare_jwt_keys
ensure_env_file
validate_env
wait_for_db
start_stack
post_summary
