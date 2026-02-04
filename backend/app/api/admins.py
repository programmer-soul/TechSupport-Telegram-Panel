import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_stepup
from app.auth.crypto import hash_secret
from app.core.deps import require_role
from app.db.session import get_db
from app.models.auth import User
from app.models.enums import UserRole
from app.schemas.admins import AdminCreate, AdminOut, AdminUpdate

router = APIRouter(prefix="/admins", tags=["admins"], dependencies=[Depends(require_role(UserRole.administrator))])


@router.get("", response_model=list[AdminOut])
async def list_admins(db: AsyncSession = Depends(get_db)) -> list[AdminOut]:
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [AdminOut.model_validate(user) for user in users]


@router.post("", response_model=AdminOut)
async def create_admin(
    payload: AdminCreate,
    db: AsyncSession = Depends(get_db),
) -> AdminOut:
    existing = await db.execute(select(User).where(User.telegram_user_id == payload.telegram_user_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram user already exists")
    
    # Generate username if not provided
    username = payload.username or f"user_{payload.telegram_user_id}"
    
    # Check if username already exists
    existing_username = await db.execute(select(User).where(User.username == username))
    if existing_username.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    
    user = User(
        telegram_user_id=payload.telegram_user_id,
        username=username,
        password_hash="placeholder",  # Will be set by user
        role=payload.role,
        is_active=payload.is_active,
    )
    if payload.temp_password:
        user.password_hash = hash_secret(payload.temp_password)
        user.must_change_password = True
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return AdminOut.model_validate(user)


@router.patch("/{admin_id}", response_model=AdminOut)
async def update_admin(
    admin_id: str,
    payload: AdminUpdate,
    db: AsyncSession = Depends(get_db),
) -> AdminOut:
    try:
        uid = uuid.UUID(admin_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid id") from exc
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    
    # Update fields
    if payload.username:
        # Check if new username is unique
        existing = await db.execute(select(User).where((User.username == payload.username) & (User.id != uid)))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        user.username = payload.username
    
    if payload.telegram_user_id is not None:
        # Check if new tg_id is unique
        existing = await db.execute(select(User).where((User.telegram_user_id == payload.telegram_user_id) & (User.id != uid)))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram ID already in use")
        user.telegram_user_id = payload.telegram_user_id
    
    if payload.role:
        user.role = payload.role
    
    if payload.is_active is not None:
        user.is_active = payload.is_active
    
    if payload.telegram_oauth_enabled is not None:
        user.telegram_oauth_enabled = payload.telegram_oauth_enabled
    
    if payload.temp_password is not None:
        if payload.temp_password == "":
            # Don't clear password, keep existing
            pass
        else:
            user.password_hash = hash_secret(payload.temp_password)
            user.must_change_password = True
    
    await db.commit()
    await db.refresh(user)
    return AdminOut.model_validate(user)


@router.delete("/{admin_id}", status_code=204)
async def delete_admin(
    admin_id: str,
    db: AsyncSession = Depends(get_db),
    _stepup=Depends(require_stepup()),
) -> None:
    from app.models.auth import Session as UserSession, WebAuthnCredential, AuditLog
    from sqlalchemy import delete
    
    try:
        uid = uuid.UUID(admin_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid id") from exc
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    
    # Delete related records first
    await db.execute(delete(UserSession).where(UserSession.user_id == uid))
    await db.execute(delete(WebAuthnCredential).where(WebAuthnCredential.user_id == uid))
    
    await db.delete(user)
    await db.commit()
