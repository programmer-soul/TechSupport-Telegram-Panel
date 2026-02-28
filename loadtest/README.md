# Load Testing Profiles (k6)

This folder contains ready-to-run load tests for the current stack:

- `operator_api.js`: authenticated operator read path (`/api/chats`, `/api/chats/counts`, `/api/chats/{id}/messages`)
- `bot_ingress.js`: bot write path (`/api/bot/chat`, `/api/bot/incoming`)
- `ws_fanout.js`: websocket connection stability/fanout (`/ws`)

These tests do not change UI behavior. They are only for capacity validation.

## 1) Prerequisites

- Running stack (backend/frontend/db up)
- `k6` installed locally, or Docker image `grafana/k6`
- Valid admin credentials for panel login

## 2) Quick Start

Run from repository root (`/root/techweb`).

### Operator API load

```bash
BASE_URL=https://your-domain \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=admin \
k6 run loadtest/operator_api.js
```

### Bot ingress load

```bash
BASE_URL=https://your-domain \
BOT_INTERNAL_TOKEN=change-me-bot \
k6 run loadtest/bot_ingress.js
```

### WebSocket fanout load

```bash
BASE_URL=https://your-domain \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=admin \
k6 run loadtest/ws_fanout.js
```

## 3) Using Docker k6

```bash
docker run --rm -i \
  -e BASE_URL=https://your-domain \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin \
  -v "$PWD:/work" \
  grafana/k6 run /work/loadtest/operator_api.js
```

## 4) Tunable Parameters

All scripts support these env vars:

- `BASE_URL` (required): panel URL, e.g. `https://support.example.com`
- `DURATION`: test duration (default varies by script)
- `VUS`: virtual users (default varies by script)
- `MAX_RPS`: optional cap (`rps`) for constant-arrival profiles

Operator/WebSocket scripts also need:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Bot script needs:

- `BOT_INTERNAL_TOKEN`

## 5) What "Good" Looks Like

Target baseline for stable production:

- HTTP failure rate < 1%
- `http_req_duration`:
  - p95 < 500ms (reads)
  - p99 < 1200ms
- WebSocket connect success > 99%
- No steady growth in DB CPU / lock waits / connection saturation

## 6) Recommended Execution Order

1. `operator_api.js` (read-heavy baseline)
2. `bot_ingress.js` (write path + ws broadcasts)
3. `ws_fanout.js` (high concurrent socket pressure)
4. mixed run: start all three with moderate VUs

## 7) Notes

- Do not run extreme tests directly on production first.
- Start from low load and step up gradually.
- Save k6 output (`--summary-export`) for each run to compare regressions.
