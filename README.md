# 🤖 Telegram Support Panel

<div align="center">

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)

**Полнофункциональная система поддержки клиентов через Telegram с современной веб-панелью**

</div>

---

## ✨ Возможности

| Категория | Функции |
|-----------|---------|
| 💬 **Telegram бот** | Приём сообщений, фото, видео, документов, голосовых, стикеров, пересланных сообщений |
| 🖥️ **Админ-панель** | Список чатов, статусы (новый/активный/закрыт), быстрые ответы, шаблоны |
| 📨 **Рассылки** | Массовая отправка с кнопками, медиа, таргетинг по статусам |
| ⚡ **Real-time** | WebSocket обновления — мгновенное получение сообщений |
| 🔐 **Безопасность** | JWT + WebAuthn , CSRF защита, rate limiting |
| 👥 **Мультиадмин** | Роли (admin/moderator), аудит действий |
| 📁 **Хранение файлов** | Локально или S3-совместимое хранилище |

---

## 🏗️ Архитектура

```
┌──────────────────────────────────────────────────────────────┐
│                        DOCKER COMPOSE                         │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│     db       │   backend    │     bot      │    frontend     │
│  PostgreSQL  │   FastAPI    │   aiogram    │  React + Caddy  │
│    :5432     │    :8000     │    :8081     │   :80 / :443    │
└──────────────┴──────────────┴──────────────┴─────────────────┘

frontend (Caddy) маршрутизация:
  /api/*      → backend:8000
  /static/*   → backend:8000
  /ws         → backend:8000 (WebSocket)
  /webhook/*  → bot:8081
  /*          → React SPA
```

```
techweb/
├── backend/          # FastAPI + SQLAlchemy + Alembic
│   ├── app/          # Основной код
│   ├── alembic/      # Миграции БД
│   └── keys/         # JWT ключи (создаются вручную)
├── bot/              # aiogram Telegram бот
├── frontend/         # React + Vite + Tailwind
│   ├── src/          # Исходники React
│   ├── Caddyfile     # Конфигурация Caddy (авто SSL)
│   └── Caddyfile.prod# Конфигурация Caddy (свои сертификаты)
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example      # Пример переменных окружения
└── README.md
```

---

## 🚀 Быстрый старт

### Шаг 1: Требования

| Компонент | Версия |
|-----------|--------|
| Docker | 20.10+ |
| Docker Compose | 2.0+ |
| Домен | С записью A/AAAA на сервер |
| Порты | 80, 443 (открыты) |

### Шаг 2: Клонирование / Загрузка

```bash
# Через Git
git clone <repo-url> /opt/techweb
cd /opt/techweb

# Или через SFTP
mkdir -p /opt/techweb
sftp user@server
put -r /local/techweb/* /opt/techweb/
exit
cd /opt/techweb
```

### Шаг 3: Генерация JWT ключей

```bash
mkdir -p backend/keys

# Приватный ключ
openssl genrsa -out backend/keys/jwt_private.pem 2048

# Публичный ключ
openssl rsa -in backend/keys/jwt_private.pem -pubout -out backend/keys/jwt_public.pem

# Права доступа
chmod 600 backend/keys/jwt_private.pem
chmod 644 backend/keys/jwt_public.pem
```

### Шаг 4: Настройка окружения

```bash
cp .env.example .env
nano .env  # или vim .env
```

### Важные файлы от владельца

Эти файлы специально не хранятся в репозитории. Без них панель не запустится.

Файлы и куда положить:
1. `frontend/src/main.tsx`
2. `frontend/src/App.tsx`
3. `backend/keys/jwt_private.pem`
4. `backend/keys/jwt_public.pem`
5. `.env`
6. `certs/fullchain.pem` (если используете свои SSL-сертификаты)
7. `certs/privkey.pem` (если используете свои SSL-сертификаты)

#### 📝 Обязательные переменные

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DOMAIN` | Ваш домен (без https://) | `support.example.com` |
| `SECRET_KEY` | Секретный ключ | `$(openssl rand -hex 32)` |
| `TELEGRAM_TOKEN` | Токен от @BotFather | `123456:ABC...` |
| `WEBHOOK_URL` | URL для Telegram вебхука | `https://support.example.com/webhook/telegram` |
| `POSTGRES_PASSWORD` | Пароль БД | `secure-password-123` |
| `BOT_INTERNAL_TOKEN` | Токен связи backend↔bot | `internal-secret-token` |
| `PANEL_ORIGIN` | URL панели с https:// | `https://support.example.com` |
| `RP_ID` | Домен для WebAuthn | `support.example.com` |
| `RP_ORIGIN` | URL для WebAuthn | `https://support.example.com` |
| `COOKIE_SECURE` | HTTPS cookies | `true` |

#### 📋 Пример заполненного .env

```bash
# === DOMAIN ===
DOMAIN=support.example.com

# === CORE ===
SECRET_KEY=a1b2c3d4e5f6789...  # openssl rand -hex 32

# === DATABASE ===
POSTGRES_USER=postgres
POSTGRES_PASSWORD=super-secure-password
POSTGRES_DB=support
POSTGRES_DSN=postgresql+asyncpg://postgres:super-secure-password@db:5432/support

# === TELEGRAM ===
TELEGRAM_TOKEN=7123456789:AAH...
WEBHOOK_URL=https://support.example.com/webhook/telegram
WEBHOOK_PATH=/webhook/telegram

# === INTERNAL ===
BOT_INTERNAL_TOKEN=my-internal-secret-token
BOT_BASE_URL=http://bot:8081

# === AUTH ===
PANEL_ORIGIN=https://support.example.com
COOKIE_SECURE=true
RP_ID=support.example.com
RP_ORIGIN=https://support.example.com
JWT_ISS=support-panel
JWT_AUD=support-panel
JWT_PRIVATE_KEY=/app/keys/jwt_private.pem
JWT_PUBLIC_KEY=/app/keys/jwt_public.pem

# === STORAGE ===
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=/data/uploads
STORAGE_PUBLIC_BASE_URL=/static
```

### Шаг 5: Запуск

```bash
# Сборка и запуск всех сервисов
docker compose up -d --build

# Проверка статуса
docker compose ps
```

Ожидаемый вывод:
```
NAME        STATUS          PORTS
db          Up              0.0.0.0:5432->5432/tcp
backend     Up              0.0.0.0:8000->8000/tcp
bot         Up              0.0.0.0:8081->8081/tcp
frontend    Up              0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

### Шаг 5a: Продакшен с вашими сертификатами

Если хотите использовать существующие SSL-сертификаты, положите их в папку `certs/`:

```
certs/
├── fullchain.pem
└── privkey.pem
```

Запуск:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Шаг 6: Первый вход

1. Откройте `https://ваш-домен.com`
2. Дождитесь получения SSL сертификата (до 1 минуты)
3. Войдите: **admin** / **admin**
4. Смените пароль при первом входе ✅

---

## 🔧 Управление

### Логи

```bash
# Все сервисы
docker compose logs -f

# Конкретный сервис
docker compose logs -f backend
docker compose logs -f bot
docker compose logs -f frontend
docker compose logs -f db
```

### Перезапуск

```bash
# Перезапуск одного сервиса
docker compose restart backend

# Полный перезапуск
docker compose down && docker compose up -d
```

### Обновление

```bash
# После загрузки новой версии
docker compose up -d --build

# Или для конкретного сервиса
docker compose up -d --build frontend
```

### Миграции БД

```bash
# Автоматически при старте, но можно вручную:
docker compose exec backend alembic upgrade head

# Посмотреть статус миграций
docker compose exec backend alembic current
```

### Бэкап и восстановление

```bash
# Бэкап базы
docker compose exec db pg_dump -U postgres support > backup_$(date +%Y%m%d).sql

# Восстановление
cat backup.sql | docker compose exec -T db psql -U postgres support

# Бэкап файлов (если локальное хранилище)
docker cp $(docker compose ps -q backend):/data/uploads ./uploads_backup
```

---

## 👥 Создание администраторов

### Через панель (рекомендуется)

1. Войдите как admin
2. Перейдите в раздел **Пользователи**
3. Нажмите **+ Добавить**
4. Заполните данные

### Через CLI

```bash
# С указанием Telegram ID (опционально)
docker compose exec backend python -m app.scripts.create_admin

# Или с переменной окружения
ADMIN_TELEGRAM_ID=123456789 docker compose exec backend python -m app.scripts.create_admin
```

---

## 🐛 Устранение неполадок

### ❌ Бот не получает сообщения

```bash
# Проверить статус вебхука
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Установить вебхук вручную
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://ваш-домен.com/webhook/telegram"

# Удалить вебхук (для polling)
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

### ❌ WebSocket не подключается

1. Проверьте логи frontend: `docker compose logs frontend`
2. Убедитесь, что Caddy корректно проксирует `/ws`
3. Проверьте `PANEL_ORIGIN` в .env

### ❌ SSL сертификат не получен

```bash
# Логи Caddy
docker compose logs frontend

# Убедитесь что:
# - Порты 80 и 443 открыты
# - Домен указывает на сервер
# - В .env указан DOMAIN=ваш-домен.com
```

Если используете `docker-compose.prod.yml`, проверьте что файлы
`certs/fullchain.pem` и `certs/privkey.pem` присутствуют на сервере.

### ❌ Ошибка авторизации / Passkey не работает

1. Проверьте совпадение `RP_ID` и домена
2. `COOKIE_SECURE=true` для HTTPS
3. `RP_ORIGIN` должен быть с `https://`
4. Очистите cookies в браузере

### ❌ Ошибка подключения к БД

```bash
# Проверьте что db запущена
docker compose ps db

# Проверьте логи
docker compose logs db

# Проверьте POSTGRES_DSN в .env
```

---

## 📁 Структура файлов

```
.env                    # Переменные окружения
docker-compose.yml      # Конфигурация Docker
docker-compose.prod.yml # Конфигурация Docker (production + свои certs)

backend/
├── keys/               # JWT ключи (создать вручную!)
│   ├── jwt_private.pem
│   └── jwt_public.pem
├── app/
│   ├── api/            # API endpoints
│   ├── models/         # SQLAlchemy модели
│   ├── schemas/        # Pydantic схемы
│   └── services/       # Бизнес-логика
└── alembic/versions/   # Миграции БД

bot/
├── app.py              # Главный файл бота
└── requirements.txt

frontend/
├── Caddyfile           # Конфигурация прокси
├── Caddyfile.prod       # Конфигурация прокси (свои сертификаты)
├── src/components/     # React компоненты
└── package.json
```

---

## 🔒 Безопасность

- ✅ Все пароли хешируются (bcrypt)
- ✅ JWT токены с RS256 подписью
- ✅ WebAuthn/Passkey поддержка
- ✅ TOTP (2FA) поддержка
- ✅ CSRF защита
- ✅ Rate limiting
- ✅ Secure cookies для HTTPS
- ✅ CORS настройка

---

## 📜 Лицензия

MIT

---

<div align="center">

**Made with ❤️ for support teams**

</div>
