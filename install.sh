#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

NO_BUILD=0
PULL=0
DB_WAIT_SECONDS=90

usage() {
  cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --no-build         Skip image build (docker compose up -d)
  --pull             Pull latest images before startup
  --db-wait N        Wait up to N seconds for PostgreSQL readiness (default: 90)
  -h, --help         Show this help
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
      echo "[techweb] Unknown option: $1" >&2
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
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

ensure_docker() {
  log "Checking Docker..."
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  warn "Docker is not installed. Trying auto-install..."
  if ! command -v apt-get >/dev/null 2>&1; then
    die "Auto-install is supported only on Debian/Ubuntu (apt). Install Docker manually."
  fi
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    die "Docker auto-install requires root. Re-run with sudo."
  fi

  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  fi
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

prepare_jwt_keys() {
  log "Preparing JWT keys..."
  need_cmd openssl
  mkdir -p backend/keys

  if [ ! -f backend/keys/jwt_private.pem ]; then
    openssl genrsa -out backend/keys/jwt_private.pem 2048 >/dev/null 2>&1
    chmod 600 backend/keys/jwt_private.pem
    log "Created backend/keys/jwt_private.pem"
  fi
  if [ ! -f backend/keys/jwt_public.pem ]; then
    openssl rsa -in backend/keys/jwt_private.pem -pubout -out backend/keys/jwt_public.pem >/dev/null 2>&1
    chmod 644 backend/keys/jwt_public.pem
    log "Created backend/keys/jwt_public.pem"
  fi
}

ensure_env_file() {
  log "Checking .env..."
  if [ ! -f .env ]; then
    cp .env.example .env
    warn ".env was created from .env.example"
    warn "Fill .env values, then run ./install.sh again"
    exit 0
  fi
}

validate_env() {
  log "Loading .env..."
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
    printf '[techweb][error] Missing .env values: %s\n' "${missing[*]}" >&2
    exit 1
  fi

  if printf '%s\n' "${SECRET_KEY:-}" "${BOT_INTERNAL_TOKEN:-}" | grep -qi 'change-me'; then
    warn "You still have placeholder secrets (change-me*) in .env"
  fi
  if printf '%s\n' "${DOMAIN:-}" "${PANEL_ORIGIN:-}" | grep -qi 'example.com'; then
    warn "DOMAIN/PANEL_ORIGIN look like example values. SSL/login may fail."
  fi
}

wait_for_db() {
  local pg_user="${POSTGRES_USER:-postgres}"
  local pg_db="${POSTGRES_DB:-support}"
  local started_at now elapsed
  started_at="$(date +%s)"

  log "Starting PostgreSQL container..."
  docker compose up -d db

  log "Waiting for DB readiness (timeout: ${DB_WAIT_SECONDS}s)..."
  while true; do
    if docker compose exec -T db pg_isready -U "$pg_user" -d "$pg_db" >/dev/null 2>&1; then
      log "PostgreSQL is ready"
      return 0
    fi
    now="$(date +%s)"
    elapsed="$((now - started_at))"
    if [ "$elapsed" -ge "$DB_WAIT_SECONDS" ]; then
      docker compose logs --tail=80 db || true
      die "DB did not become ready in ${DB_WAIT_SECONDS}s"
    fi
    sleep 1
  done
}

start_stack() {
  if [ "$PULL" -eq 1 ]; then
    log "Pulling latest images..."
    docker compose pull
  fi

  if [ "$NO_BUILD" -eq 1 ]; then
    log "Starting stack without build..."
    docker compose up -d
  else
    log "Starting stack with build..."
    docker compose up -d --build
  fi
}

post_summary() {
  local domain="${DOMAIN:-localhost}"
  local panel_origin="${PANEL_ORIGIN:-https://${domain}}"
  log "Done"
  log "Panel URL: ${panel_origin}"
  log "Status: docker compose ps"
  log "Logs: docker compose logs -f"
  log "Backend logs: docker compose logs -f backend"
}

need_cmd grep
need_cmd sed
need_cmd awk
ensure_docker
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not available"
prepare_jwt_keys
ensure_env_file
validate_env
wait_for_db
start_stack
post_summary
