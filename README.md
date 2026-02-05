# Telegram Support Panel (techweb)

Самая простая инструкция «скопировал и запустил».

## Быстрый старт (через install.sh)

### Шаг 1. Скопируйте проект на сервер
Пример:
```bash
scp -r ./techweb user@server:/opt/techweb
```
Или через Git:
```bash
git clone <repo-url> /opt/techweb
```
Дальше:
```bash
cd /opt/techweb
```

### Шаг 2. Запустите установку
```bash
./install.sh
```
Если скрипт создал `.env`, откройте его, заполните и запустите `./install.sh` ещё раз.

### Шаг 3. Первый вход
1. Откройте `https://ваш-домен`
2. Подождите 30–60 секунд — Caddy сам получит SSL сертификат
3. Логин/пароль по умолчанию: `admin` / `admin`
4. Смените пароль

Если пароль **не принимается при первом запуске** (БД ещё не готова):
```bash
docker compose restart backend
```
Подождите 1–2 минуты и попробуйте снова.

---

## Что нужно заранее
- Docker 20.10+
- Docker Compose 2.0+
- Открыты порты 80 и 443
- Домен указывает на этот сервер

Проверка:
```bash
docker --version
docker compose version
```

## Настройка `.env` (обязательно)
После первого запуска `install.sh` откройте `.env` и заполните минимум:
- `DOMAIN` — домен без `https://`
- `SECRET_KEY` — любой длинный ключ
- `TELEGRAM_TOKEN` — токен от @BotFather
- `WEBHOOK_URL` — `https://<ваш-домен>/webhook/telegram`
- `POSTGRES_PASSWORD` — пароль базы
- `BOT_INTERNAL_TOKEN` — любой длинный ключ
- `PANEL_ORIGIN` — `https://<ваш-домен>`
- `RP_ID` и `RP_ORIGIN` — домен и `https://<ваш-домен>`

Пример:
```bash
DOMAIN=support.example.com
SECRET_KEY=change-me-32-chars-or-more
POSTGRES_PASSWORD=super-secure-password
POSTGRES_DB=support
POSTGRES_USER=postgres
POSTGRES_DSN=postgresql+asyncpg://postgres:super-secure-password@db:5432/support

TELEGRAM_TOKEN=123456:ABCDEF
WEBHOOK_URL=https://support.example.com
WEBHOOK_PATH=/webhook/telegram

BOT_INTERNAL_TOKEN=internal-secret
BOT_BASE_URL=http://bot:8081

PANEL_ORIGIN=https://support.example.com
COOKIE_SECURE=true
RP_ID=support.example.com
RP_ORIGIN=https://support.example.com

JWT_ISS=support-panel
JWT_AUD=support-panel
JWT_PRIVATE_KEY=/app/keys/jwt_private.pem
JWT_PUBLIC_KEY=/app/keys/jwt_public.pem
```

## Полезные команды

Статус:
```bash
docker compose ps
```

Логи:
```bash
docker compose logs -f
```

Перезапуск:
```bash
docker compose restart
```

Миграции БД (если нужно вручную):
```bash
docker compose exec backend alembic upgrade head
```

Создание администратора вручную:
```bash
docker compose exec backend python -m app.scripts.create_admin
```

## Частые проблемы

### Не выдался SSL сертификат
Проверьте:
- домен указывает на этот сервер
- открыты порты 80 и 443
- в `.env` указан правильный `DOMAIN`

Логи:
```bash
docker compose logs -f frontend
```

### Ошибка подключения к БД
```bash
docker compose ps db
docker compose logs -f db
```
Если подключаетесь к базе снаружи (например, PgAdmin), порт на хосте — `5433`.

## Структура проекта
```
techweb/
├── backend/          # FastAPI + миграции
├── bot/              # Telegram bot
├── frontend/         # React + Caddy
├── docker-compose.yml
├── install.sh
├── .env.example
└── README.md
```
