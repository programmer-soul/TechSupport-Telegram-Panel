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
После первого запуска `install.sh` откройте `.env` и заполните **все поля** как в `.env.example`.

Список полей:
- `SECRET_KEY` — секретный ключ приложения
- `CORS_ORIGINS` — разрешённые origin панели
- `POSTGRES_USER` — пользователь БД
- `POSTGRES_PASSWORD` — пароль БД
- `POSTGRES_DB` — имя БД
- `POSTGRES_DSN` — строка подключения к БД
- `STORAGE_BACKEND` — тип хранилища (`local` или другое)
- `STORAGE_LOCAL_PATH` — путь хранения файлов
- `STORAGE_PUBLIC_BASE_URL` — публичный путь к файлам
- `BOT_INTERNAL_TOKEN` — внутренний токен backend↔bot
- `BOT_BASE_URL` — URL бота внутри Docker
- `WEBHOOK_URL` — базовый URL панели без пути
- `WEBHOOK_PATH` — путь вебхука
- `PANEL_ORIGIN` — URL панели для cookies/auth
- `COOKIE_SECURE` — `true` для HTTPS
- `JWT_ISS` — issuer
- `JWT_AUD` — audience
- `JWT_PRIVATE_KEY` — путь к приватному ключу внутри контейнера
- `JWT_PUBLIC_KEY` — путь к публичному ключу внутри контейнера
- `RP_ID` — домен без `https://`
- `RP_ORIGIN` — `https://<ваш-домен>`
- `DOMAIN` — домен без `https://`

Важно: ключи генерируются в `backend/keys` на хосте, а внутри контейнера доступны как `/app/keys`.

Пример:
```bash
SECRET_KEY=change-me-secret
CORS_ORIGINS=https://support.example.com

POSTGRES_USER=postgres
POSTGRES_PASSWORD=super-secure-password
POSTGRES_DB=support
POSTGRES_DSN=postgresql+asyncpg://postgres:super-secure-password@db:5432/support

STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=/data/uploads
STORAGE_PUBLIC_BASE_URL=/static

BOT_INTERNAL_TOKEN=internal-secret
BOT_BASE_URL=http://bot:8081

WEBHOOK_URL=https://support.example.com
WEBHOOK_PATH=/webhook/telegram

PANEL_ORIGIN=https://support.example.com
COOKIE_SECURE=true
RP_ID=support.example.com
RP_ORIGIN=https://support.example.com

JWT_ISS=support-panel
JWT_AUD=support-panel
JWT_PRIVATE_KEY=/app/keys/jwt_private.pem
JWT_PUBLIC_KEY=/app/keys/jwt_public.pem

DOMAIN=support.example.com
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
