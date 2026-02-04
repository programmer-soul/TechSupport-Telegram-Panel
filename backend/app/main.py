import logging
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.api import admins, auth, bot, broadcast, chats, external, files, messages, settings as settings_api, templates, uploads
from app.core.config import get_settings
from app.auth.security import decode_token
from app.auth.crypto import hash_secret
from app.ws.manager import manager
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.csrf import CSRFMiddleware
from app.db.session import AsyncSessionLocal
from app.models.auth import User
from app.models.enums import UserRole
from app.services.broadcast_worker import start_broadcast_worker
from sqlalchemy import select

logger = logging.getLogger(__name__)
settings = get_settings()


async def init_admin():
    """Initialize admin user on startup"""
    try:
        async with AsyncSessionLocal() as session:
            # Check if admin already exists
            result = await session.execute(select(User).where(User.username == "admin"))
            if result.scalar_one_or_none():
                logger.info("✅ Admin user already exists")
                return
            
            # Create admin user
            user = User(
                telegram_user_id=1,
                username="admin",
                password_hash=hash_secret("admin"),
                role=UserRole.administrator,
                is_active=True,
                must_change_password=True,
                telegram_oauth_enabled=False,
            )
            session.add(user)
            await session.commit()
            logger.info("✅ Admin user created: admin / admin (must change password on first login)")
    except Exception as e:
        logger.error(f"❌ Failed to create admin user: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_admin()
    # Start broadcast worker
    broadcast_task = await start_broadcast_worker()
    logger.info("✅ Broadcast worker started")
    yield
    # Shutdown
    broadcast_task.cancel()
    try:
        await broadcast_task
    except Exception:
        pass


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)
app.add_middleware(
    CSRFMiddleware,
    exempt_paths=[
        f"{settings.api_prefix}/auth/login",
        f"{settings.api_prefix}/auth/telegram/oauth",
        f"{settings.api_prefix}/auth/telegram/verify",
        f"{settings.api_prefix}/auth/change-password",
        f"{settings.api_prefix}/auth/refresh",
        f"{settings.api_prefix}/bot/",
    ],
)
app.add_middleware(SecurityHeadersMiddleware)

app.mount("/static", StaticFiles(directory=settings.storage_local_path), name="static")

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(admins.router, prefix=settings.api_prefix)
app.include_router(chats.router, prefix=settings.api_prefix)
app.include_router(messages.router, prefix=settings.api_prefix)
app.include_router(uploads.router, prefix=settings.api_prefix)
app.include_router(files.router, prefix=settings.api_prefix)
app.include_router(templates.router, prefix=settings.api_prefix)
app.include_router(broadcast.router, prefix=settings.api_prefix)
app.include_router(settings_api.router, prefix=settings.api_prefix)
app.include_router(external.router, prefix=settings.api_prefix)
app.include_router(bot.router, prefix=settings.api_prefix)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        token = websocket.cookies.get(settings.access_cookie_name)
    if not token:
        logger.error("WebSocket: No token found in query params or cookies")
        logger.error(f"Query params: {websocket.query_params}")
        logger.error(f"Cookies: {dict(websocket.cookies)}")
        await websocket.close(code=4401)
        return
    try:
        decode_token(token)
    except Exception as e:
        logger.error(f"WebSocket: Token decode failed: {e}")
        await websocket.close(code=4401)
        return
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
