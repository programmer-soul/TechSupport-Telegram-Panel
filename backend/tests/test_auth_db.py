import os
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.service import create_session, revoke_family
from app.db.session import Base
from app.models.auth import User
from app.models.enums import UserRole


TEST_DSN = os.getenv("TEST_POSTGRES_DSN")


@pytest.mark.asyncio
async def test_session_rotation_revoke_family():
    if not TEST_DSN:
        pytest.skip("TEST_POSTGRES_DSN not set")
    engine = create_async_engine(TEST_DSN, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        user = User(telegram_user_id=999001, role=UserRole.administrator, is_active=True)
        db.add(user)
        await db.commit()
        await db.refresh(user)

        session, access, refresh, _ = await create_session(db, user, "127.0.0.1", "pytest", None, "webauthn")
        assert access
        assert refresh
        assert session.family_id is not None

        await revoke_family(db, session.family_id)
        await db.refresh(session)
        assert session.revoked_at is not None

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
