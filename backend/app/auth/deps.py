from datetime import datetime, timezone
import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import decode_token
from app.core.config import get_settings
from app.db.session import get_db
from app.models.auth import Session, User
from app.models.enums import UserRole

settings = get_settings()


async def get_auth_context(request: Request, db: AsyncSession) -> tuple[User, Session, dict]:
    token = request.cookies.get(settings.access_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = decode_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    session = await db.get(Session, uuid.UUID(session_id))
    if not session or session.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")
    session_role = session.role.value if hasattr(session.role, "value") else str(session.role)
    if session_role != payload.get("role"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Role mismatch")
    return user, session, payload


async def require_auth(request: Request, db: AsyncSession = Depends(get_db)) -> tuple[User, Session, dict]:
    return await get_auth_context(request, db)


def require_role(*roles: UserRole):
    async def checker(ctx=Depends(require_auth)) -> User:
        user, _, _ = ctx
        user_role = user.role.value if hasattr(user.role, "value") else str(user.role)
        allowed = [r.value for r in roles]
        if user_role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return checker


def require_stepup(max_age_seconds: int = 300):
    async def checker(ctx=Depends(require_auth)) -> User:
        user, _, payload = ctx
        mfa_at = payload.get("mfa_at")
        if not mfa_at:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="stepup_required")
        now = int(datetime.now(timezone.utc).timestamp())
        if now - int(mfa_at) > max_age_seconds:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="stepup_required")
        return user

    return checker


def check_stepup(payload: dict, max_age_seconds: int = 300) -> None:
    mfa_at = payload.get("mfa_at")
    if not mfa_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="stepup_required")
    now = int(datetime.now(timezone.utc).timestamp())
    if now - int(mfa_at) > max_age_seconds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="stepup_required")
