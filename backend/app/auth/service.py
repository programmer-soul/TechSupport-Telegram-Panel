from __future__ import annotations

import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.crypto import hash_secret, random_token, verify_secret
from app.auth.security import create_access_token, create_refresh_token, now_ts
from app.models.auth import PendingLogin, Session, User, WebAuthnCredential
from app.models.enums import UserRole


def _role_str(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def verify_telegram_payload(payload: dict, bot_token: str) -> bool:
    if "hash" not in payload or "auth_date" not in payload:
        return False
    auth_date = int(payload.get("auth_date", 0))
    if abs(now_ts() - auth_date) > 300:
        return False
    check_items = []
    for key in sorted(payload.keys()):
        if key == "hash":
            continue
        check_items.append(f"{key}={payload[key]}")
    data_check = "\n".join(check_items)
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    digest = hmac.new(secret_key, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, payload["hash"])


async def upsert_user(db: AsyncSession, telegram_user_id: int) -> User:
    result = await db.execute(select(User).where(User.telegram_user_id == telegram_user_id))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(
        telegram_user_id=telegram_user_id,
        role=UserRole.moderator,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def create_pending_login(db: AsyncSession, user_id: uuid.UUID, ip: str | None, user_agent: str | None) -> PendingLogin:
    pending = PendingLogin(
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
        consumed_at=None,
        ip=ip,
        user_agent=user_agent,
        created_at=datetime.now(timezone.utc),
    )
    db.add(pending)
    await db.commit()
    await db.refresh(pending)
    return pending


async def consume_pending_login(db: AsyncSession, pending: PendingLogin) -> None:
    pending.consumed_at = datetime.now(timezone.utc)
    await db.commit()


async def create_session(
    db: AsyncSession,
    user: User,
    ip: str | None,
    user_agent: str | None,
    device_id: str | None,
    mfa_level: str,
) -> tuple[Session, str, str, int]:
    session_id = uuid.uuid4()
    family_id = uuid.uuid4()
    refresh_token = create_refresh_token(str(user.id), str(session_id), str(family_id), mfa_level)
    refresh_hash = hash_secret(refresh_token)
    now = datetime.now(timezone.utc)
    session = Session(
        id=session_id,
        user_id=user.id,
        role=user.role,
        family_id=family_id,
        refresh_hash=refresh_hash,
        created_at=now,
        last_used_at=now,
        ip=ip,
        user_agent=user_agent,
        device_id=device_id,
        revoked_at=None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    mfa_at = now_ts()
    access_token = create_access_token(str(user.id), _role_str(user), str(session.id), mfa_level, mfa_at)
    return session, access_token, refresh_token, mfa_at


async def rotate_refresh(
    db: AsyncSession,
    session: Session,
    refresh_token: str,
    user: User,
    mfa_level: str,
) -> tuple[str, str, int]:
    refresh_hash = hash_secret(refresh_token)
    session.refresh_hash = refresh_hash
    session.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    mfa_at = now_ts()
    access_token = create_access_token(str(user.id), _role_str(user), str(session.id), mfa_level, mfa_at)
    return access_token, refresh_token, mfa_at


async def revoke_family(db: AsyncSession, family_id: uuid.UUID) -> None:
    await db.execute(update(Session).where(Session.family_id == family_id).values(revoked_at=datetime.now(timezone.utc)))
    await db.commit()


async def get_session(db: AsyncSession, session_id: uuid.UUID) -> Session | None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    return result.scalar_one_or_none()


async def verify_refresh_token(db: AsyncSession, session: Session, refresh_token: str) -> bool:
    return verify_secret(refresh_token, session.refresh_hash)


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
