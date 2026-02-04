from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import PublicKeyCredentialDescriptor

from app.auth.audit import audit
from app.auth.cookies import clear_auth_cookies, set_access_cookie, set_auth_cookies
from app.auth.crypto import hash_secret, random_token, verify_secret
from app.auth.csrf import generate_csrf_token
from app.auth.deps import check_stepup, get_auth_context, require_auth, require_stepup
from app.auth.rate_limit import limiter
from app.auth.security import create_access_token, create_refresh_token, decode_token, now_ts
from app.auth.service import (
    create_pending_login,
    create_session,
    get_session,
    get_user_by_id,
    revoke_family,
    upsert_user,
    verify_telegram_payload,
)
from app.auth.webauthn_store import pop_challenge, set_challenge
from app.core.config import get_settings
from app.core.deps import get_current_admin, require_role
from app.db.session import get_db
from app.models.auth import PendingLogin, Session, User, WebAuthnCredential
from app.models.enums import UserRole
from app.models.setting import Setting
from app.schemas.auth import (
    LoginRequest,
    PendingLoginRequest,
    PendingLoginResponse,
    TelegramLoginRequest,
    UserMe,
    WebAuthnOptionsRequest,
    WebAuthnVerifyRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


@router.post("/login", response_model=dict)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Login with username and password"""
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Rate limiting
    ok = await limiter.hit(f"login:{ip}", limit=8, window_seconds=60)
    if not ok:
        raise HTTPException(status_code=429, detail="Too many attempts")
    
    # Find user by username
    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalar_one_or_none()
    
    if not user or not user.password_hash or not verify_secret(user.password_hash, payload.password):
        await audit(db, "login_failure", None, None, ip, user_agent, {"username": payload.username})
        raise HTTPException(
            status_code=401, 
            detail={"code": "invalid_credentials", "message": "Неверный логин или пароль"}
        )
    
    if not user.is_active:
        await audit(db, "login_failure", str(user.id), role_value(user), ip, user_agent, {"reason": "inactive"})
        raise HTTPException(
            status_code=403, 
            detail={"code": "user_inactive", "message": "Ваш аккаунт деактивирован. Обратитесь к администратору."}
        )
    
    # Create session
    session, access_token, refresh_token, _ = await create_session(
        db,
        user,
        ip,
        user_agent,
        request.headers.get("x-device-id"),
        "password",
    )
    
    csrf = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf)
    await audit(db, "login_success", str(user.id), role_value(user), ip, user_agent, {})
    
    return {"ok": True}


@router.post("/register", response_model=dict)
async def register(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Register new user with username and password"""
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Rate limiting
    ok = await limiter.hit(f"register:{ip}", limit=5, window_seconds=300)
    if not ok:
        raise HTTPException(status_code=429, detail="Too many registration attempts")
    
    # Check if username exists
    result = await db.execute(select(User).where(User.username == payload.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Check minimum password length
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Create new user with role moderator by default
    user = User(
        telegram_user_id=0,  # Placeholder, will use username as identifier
        username=payload.username,
        password_hash=hash_secret(payload.password),
        role=UserRole.moderator,
        is_active=True,
        telegram_oauth_enabled=True,
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create session
    session, access_token, refresh_token, _ = await create_session(
        db,
        user,
        ip,
        user_agent,
        request.headers.get("x-device-id"),
        "password",
    )
    
    csrf = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf)
    await audit(db, "register_success", str(user.id), role_value(user), ip, user_agent, {})
    
    return {"ok": True}


async def _get_pending(db: AsyncSession, pending_id: str) -> PendingLogin:
    try:
        pid = uuid.UUID(pending_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pending_login_id") from exc
    pending = await db.get(PendingLogin, pid)
    if not pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending login not found")
    if pending.consumed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pending login consumed")
    if pending.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pending login expired")
    return pending


@router.post("/telegram/verify", response_model=PendingLoginResponse)
async def telegram_verify(
    payload: TelegramLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PendingLoginResponse:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    ok = await limiter.hit(f"tg_login:{ip}", limit=8, window_seconds=60)
    if not ok:
        raise HTTPException(status_code=429, detail="Too many attempts")
    
    # Get bot token from settings
    result = await db.execute(select(Setting).where(Setting.key == "telegram_bot_token"))
    setting = result.scalar_one_or_none()
    bot_token = setting.value_json.get("token") if setting and setting.value_json else None
    
    if not bot_token:
        raise HTTPException(status_code=500, detail="Telegram bot token not configured")
    data = payload.model_dump(exclude_none=True)
    if not verify_telegram_payload(data, bot_token):
        await audit(db, "telegram_login_failure", None, None, ip, user_agent, {"telegram_id": payload.id})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid telegram payload")
    user = await upsert_user(db, payload.id)
    if not user.is_active:
        await audit(db, "telegram_login_failure", str(user.id), role_value(user), ip, user_agent, {"reason": "inactive"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User inactive")
    pending = await create_pending_login(db, user.id, ip, user_agent)
    await audit(db, "telegram_login_success", str(user.id), role_value(user), ip, user_agent, {})
    return PendingLoginResponse(pending_login_id=str(pending.id))


@router.post("/telegram/oauth")
async def telegram_oauth_login(
    payload: TelegramLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Telegram OAuth login - verify payload and create session directly"""
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    ok = await limiter.hit(f"tg_oauth:{ip}", limit=8, window_seconds=60)
    if not ok:
        raise HTTPException(status_code=429, detail="Too many attempts")
    
    # Get bot token from telegram_oauth settings (not support bot)
    result = await db.execute(select(Setting).where(Setting.key == "telegram_oauth"))
    setting = result.scalar_one_or_none()
    if not setting or not setting.value_json:
        raise HTTPException(
            status_code=500, 
            detail={"code": "not_configured", "message": "Вход через Telegram не настроен администратором."}
        )
    
    if not setting.value_json.get("enabled"):
        raise HTTPException(
            status_code=403, 
            detail={"code": "globally_disabled", "message": "Вход через Telegram отключён администратором."}
        )
    
    bot_token = setting.value_json.get("bot_token")
    if not bot_token:
        raise HTTPException(
            status_code=500, 
            detail={"code": "bot_not_configured", "message": "Бот для входа через Telegram не настроен."}
        )
    
    data = payload.model_dump(exclude_none=True)
    if not verify_telegram_payload(data, bot_token):
        await audit(db, "telegram_oauth_failure", None, None, ip, user_agent, {"telegram_id": payload.id})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail={"code": "invalid_payload", "message": "Ошибка проверки данных Telegram. Попробуйте ещё раз."}
        )
    
    # Check if user with this telegram_id exists and is admin/moderator
    result = await db.execute(select(User).where(User.telegram_user_id == payload.id))
    user = result.scalar_one_or_none()
    
    if not user:
        # User not found - deny access
        await audit(db, "telegram_oauth_failure", None, None, ip, user_agent, {"telegram_id": payload.id, "reason": "not_found"})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail={"code": "user_not_found", "message": "Пользователь не найден. Обратитесь к администратору для добавления вашего Telegram ID."}
        )
    
    if not user.is_active:
        await audit(db, "telegram_oauth_failure", str(user.id), role_value(user), ip, user_agent, {"reason": "inactive"})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail={"code": "user_inactive", "message": "Ваш аккаунт деактивирован. Обратитесь к администратору."}
        )
    
    if not user.telegram_oauth_enabled:
        await audit(db, "telegram_oauth_failure", str(user.id), role_value(user), ip, user_agent, {"reason": "oauth_disabled"})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail={"code": "oauth_disabled", "message": "Вход через Telegram отключён для вашего аккаунта. Включите его в настройках профиля или войдите по логину и паролю."}
        )
    
    # Create session
    session, access_token, refresh_token, _ = await create_session(
        db,
        user,
        ip,
        user_agent,
        request.headers.get("x-device-id"),
        "telegram_oauth",
    )
    
    csrf = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf)
    await audit(db, "telegram_oauth_success", str(user.id), role_value(user), ip, user_agent, {})
    
    return {"ok": True}


@router.get("/telegram/bot_id")
async def telegram_bot_id(db: AsyncSession = Depends(get_db)) -> dict:
    # Get bot token from settings
    result = await db.execute(select(Setting).where(Setting.key == "telegram_bot_token"))
    setting = result.scalar_one_or_none()
    bot_token = setting.value_json.get("token") if setting and setting.value_json else None
    
    if not bot_token:
        raise HTTPException(status_code=500, detail="Telegram bot token not configured")
    bot_id = bot_token.split(":", 1)[0]
    if not bot_id.isdigit():
        raise HTTPException(status_code=500, detail="Invalid bot token")
    return {"bot_id": int(bot_id)}


@router.post("/webauthn/auth/options")
async def webauthn_auth_options(payload: WebAuthnOptionsRequest, db: AsyncSession = Depends(get_db)) -> dict:
    if not payload.pending_login_id:
        raise HTTPException(status_code=400, detail="Missing pending_login_id")
    pending = await _get_pending(db, payload.pending_login_id)
    user = await get_user_by_id(db, pending.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    creds = await db.execute(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
    credentials = creds.scalars().all()
    valid_transports = {"usb", "nfc", "ble", "internal", "hybrid", "smart-card"}
    allow_list = []
    for c in credentials:
        transports = None
        raw_transports = c.transports
        # Handle various formats: list, string (JSON), single string
        if isinstance(raw_transports, str):
            try:
                raw_transports = json.loads(raw_transports)
            except Exception:
                raw_transports = [raw_transports] if raw_transports in valid_transports else None
        if isinstance(raw_transports, list) and raw_transports:
            filtered = [t for t in raw_transports if t in valid_transports]
            transports = filtered if filtered else None
        allow_list.append(PublicKeyCredentialDescriptor(
            id=c.credential_id,
            type="public-key",
            transports=transports,
        ))
    options = generate_authentication_options(
        rp_id=settings.rp_id,
        allow_credentials=allow_list or None,
        user_verification="preferred",
    )
    set_challenge(f"webauthn-auth:{pending.id}", {"challenge": options.challenge, "user_id": str(user.id)}, ttl_seconds=120)
    # Convert to dict and remove null transports to avoid browser TypeError
    options_dict = options.model_dump() if hasattr(options, "model_dump") else dict(options)
    if "allow_credentials" in options_dict and options_dict["allow_credentials"]:
        for cred in options_dict["allow_credentials"]:
            if cred.get("transports") is None:
                cred.pop("transports", None)
    return {"options": options_dict, "has_credentials": bool(credentials)}


@router.post("/webauthn/auth/verify")
async def webauthn_auth_verify(
    payload: WebAuthnVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not payload.pending_login_id:
        raise HTTPException(status_code=400, detail="Missing pending_login_id")
    pending = await _get_pending(db, payload.pending_login_id)
    stored = pop_challenge(f"webauthn-auth:{pending.id}")
    if not stored:
        raise HTTPException(status_code=400, detail="Challenge expired")
    user = await get_user_by_id(db, uuid.UUID(stored["user_id"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    credential_id = base64url_to_bytes(payload.credential.get("id"))
    result = await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    try:
        verified = verify_authentication_response(
            credential=payload.credential,
            expected_challenge=stored["challenge"],
            expected_rp_id=settings.rp_id,
            expected_origin=settings.rp_origin,
            credential_public_key=cred.public_key,
            credential_current_sign_count=cred.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        await audit(db, "mfa_webauthn_failure", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {})
        raise HTTPException(status_code=401, detail="Invalid WebAuthn") from exc
    cred.sign_count = verified.new_sign_count
    cred.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    session, access_token, refresh_token, _ = await create_session(
        db,
        user,
        request.client.host if request.client else None,
        request.headers.get("user-agent"),
        request.headers.get("x-device-id"),
        "webauthn",
    )
    csrf = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf)
    pending.consumed_at = datetime.now(timezone.utc)
    await db.commit()
    await audit(db, "session_created", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {"session_id": str(session.id)})
    await audit(db, "mfa_webauthn_success", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {"session_id": str(session.id)})
    return {"ok": True}


@router.post("/webauthn/register/options")
async def webauthn_register_options(
    request: Request,
    payload: WebAuthnOptionsRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user: User | None = None
    if payload and payload.pending_login_id:
        pending = await _get_pending(db, payload.pending_login_id)
        user = await get_user_by_id(db, pending.user_id)
    if not user and request is not None:
        try:
            user, _, payload = await get_auth_context(request, db)
            check_stepup(payload)
        except Exception:
            user = None
    if not user:
        raise HTTPException(status_code=401, detail="stepup_required")
    options = generate_registration_options(
        rp_id=settings.rp_id,
        rp_name="Support Panel",
        user_id=str(user.id),
        user_name=str(user.telegram_user_id),
        user_display_name=str(user.telegram_user_id),
        attestation="none",
    )
    set_challenge(f"webauthn-reg:{user.id}", {"challenge": options.challenge, "user_id": str(user.id)}, ttl_seconds=120)
    return {"options": options}


@router.post("/webauthn/register/verify")
async def webauthn_register_verify(
    payload: WebAuthnVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user: User | None = None
    pending: PendingLogin | None = None
    is_initial_login = False
    if payload.pending_login_id:
        pending = await _get_pending(db, payload.pending_login_id)
        user = await get_user_by_id(db, pending.user_id)
        is_initial_login = True
    if not user:
        try:
            user, _, jwt_payload = await get_auth_context(request, db)
            check_stepup(jwt_payload)
        except Exception:
            user = None
    if not user:
        raise HTTPException(status_code=401, detail="stepup_required")
    stored = pop_challenge(f"webauthn-reg:{user.id}")
    if not stored:
        raise HTTPException(status_code=400, detail="Challenge expired")
    try:
        verified = verify_registration_response(
            credential=payload.credential,
            expected_challenge=stored["challenge"],
            expected_rp_id=settings.rp_id,
            expected_origin=settings.rp_origin,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid registration") from exc
    credential = WebAuthnCredential(
        user_id=user.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        transports=payload.credential.get("transports"),
        aaguid=verified.aaguid,
        created_at=datetime.now(timezone.utc),
        last_used_at=None,
    )
    db.add(credential)
    await db.commit()

    if is_initial_login and pending:
        session, access_token, refresh_token, _ = await create_session(
            db,
            user,
            request.client.host if request.client else None,
            request.headers.get("user-agent"),
            request.headers.get("x-device-id"),
            "webauthn",
        )
        csrf = generate_csrf_token()
        set_auth_cookies(response, access_token, refresh_token, csrf)
        pending.consumed_at = datetime.now(timezone.utc)
        await db.commit()
        await audit(db, "session_created", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {"session_id": str(session.id), "via": "webauthn_register"})

    return {"ok": True}


@router.delete("/webauthn/credential/{credential_id}")
async def delete_webauthn_credential(
    credential_id: str,
    user: User = Depends(require_stepup()),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        cred_id_bytes = base64url_to_bytes(credential_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid credential_id")
    
    result = await db.execute(
        select(WebAuthnCredential).where(
            WebAuthnCredential.user_id == user.id,
            WebAuthnCredential.credential_id == cred_id_bytes
        )
    )
    credential = result.scalar_one_or_none()
    
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    
    await db.delete(credential)
    await db.commit()
    await audit(db, "webauthn_credential_deleted", str(user.id), role_value(user), None, None, {})
    return {"ok": True}


@router.post("/security/status")
async def security_status(ctx=Depends(require_auth), db: AsyncSession = Depends(get_db)) -> dict:
    user, session, jwt_payload = ctx
    # Get WebAuthn credentials
    creds_result = await db.execute(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
    credentials = creds_result.scalars().all()
    passkeys_count = len(credentials)
    
    # Format credentials with base64url encoding
    passkeys_list = []
    for cred in credentials:
        try:
            # Ensure credential_id is bytes
            cred_id = cred.credential_id
            if isinstance(cred_id, str):
                cred_id = cred_id.encode('utf-8') if isinstance(cred_id, str) else cred_id
            elif not isinstance(cred_id, bytes):
                cred_id = bytes(cred_id)
            
            encoded_id = bytes_to_base64url(cred_id)
            # Convert bytes to string for JSON serialization
            if isinstance(encoded_id, bytes):
                encoded_id = encoded_id.decode('utf-8')
            
            created_str = cred.created_at.strftime('%Y-%m-%d %H:%M:%S') if cred.created_at else None
            passkeys_list.append({
                "id": encoded_id,
                "created_at": created_str,
            })
        except Exception as e:
            print(f"Error encoding credential {cred.id}: {e}")
            continue
    
    return {
        "passkeys": {
            "enabled": passkeys_count > 0,
            "count": passkeys_count,
            "list": passkeys_list
        }
    }


@router.post("/refresh")
async def refresh_session(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    print(f"Refresh: All cookies: {request.cookies}")
    print(f"Refresh: Looking for cookie '{settings.refresh_cookie_name}'")
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token:
        print(f"Refresh: Token not found!")
        raise HTTPException(status_code=401, detail="Missing refresh token")
    print(f"Refresh: Token found, length={len(token)}")
    try:
        payload = decode_token(token)
        print(f"Refresh: Payload decoded: sub={payload.get('sub')}, sid={payload.get('sid')}, type={payload.get('type')}")
    except Exception as exc:  # noqa: BLE001
        import traceback
        print(f"Refresh: Failed to decode token: {exc}")
        print(f"Refresh: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc
    if payload.get("type") != "refresh":
        print(f"Refresh: Wrong token type: {payload.get('type')}")
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    session = await get_session(db, uuid.UUID(payload["sid"]))
    print(f"Refresh: Session found: {session is not None}, revoked: {session.revoked_at if session else 'N/A'}")
    if not session or session.revoked_at is not None:
        print(f"Refresh: Session revoked or not found")
        raise HTTPException(status_code=401, detail="Session revoked")
    user = await get_user_by_id(db, uuid.UUID(payload["sub"]))
    print(f"Refresh: User found: {user is not None}")
    if not user:
        print(f"Refresh: User not found")
        raise HTTPException(status_code=401, detail="User not found")
    hash_ok = verify_secret(session.refresh_hash, token)
    print(f"Refresh: Hash verification: {hash_ok}")
    if not hash_ok:
        await audit(db, "refresh_replay_detected", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {"session_id": str(session.id)})
        await revoke_family(db, session.family_id)
        print(f"Refresh: Replay detected! Family revoked.")
        raise HTTPException(status_code=401, detail="Refresh replay detected")
    mfa_level = payload.get("mfa_level") or "totp"
    new_refresh = create_refresh_token(str(user.id), str(session.id), str(session.family_id), mfa_level)
    session.refresh_hash = hash_secret(new_refresh)
    session.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    access_token = create_access_token(str(user.id), role_value(user), str(session.id), mfa_level, now_ts())
    csrf = generate_csrf_token()
    set_auth_cookies(response, access_token, new_refresh, csrf)
    await audit(db, "session_refreshed", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {"session_id": str(session.id)})
    print(f"Refresh: Success!")
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    token = request.cookies.get(settings.access_cookie_name)
    if token:
        try:
            payload = decode_token(token)
            session = await get_session(db, uuid.UUID(payload["sid"]))
            if session:
                session.revoked_at = datetime.now(timezone.utc)
                await db.commit()
                await audit(db, "session_revoked", payload.get("sub"), payload.get("role"), request.client.host if request.client else None, request.headers.get("user-agent"), {"session_id": str(session.id)})
        except Exception:
            pass
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/logout_all")
async def logout_all(ctx=Depends(require_auth), response: Response = None, db: AsyncSession = Depends(get_db)) -> dict:
    user, _, _ = ctx
    result = await db.execute(select(Session).where(Session.user_id == user.id))
    for session in result.scalars().all():
        session.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    await audit(db, "logout_all", str(user.id), role_value(user), None, None, {})
    if response:
        clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserMe)
async def me(ctx=Depends(require_auth)) -> UserMe:
    user, _, _ = ctx
    return UserMe(
        id=str(user.id),
        telegram_user_id=user.telegram_user_id,
        role=role_value(user),
        must_change_password=bool(user.must_change_password),
        username=user.username,
    )


@router.post("/stepup/webauthn/options")
async def stepup_webauthn_options(ctx=Depends(require_auth), db: AsyncSession = Depends(get_db)) -> dict:
    user, _, _ = ctx
    creds = await db.execute(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
    credentials = creds.scalars().all()
    valid_transports = {"usb", "nfc", "ble", "internal", "hybrid", "smart-card"}
    allow_list = []
    for c in credentials:
        transports = None
        raw_transports = c.transports
        # Handle various formats: list, string (JSON), single string
        if isinstance(raw_transports, str):
            try:
                raw_transports = json.loads(raw_transports)
            except Exception:
                raw_transports = [raw_transports] if raw_transports in valid_transports else None
        if isinstance(raw_transports, list) and raw_transports:
            filtered = [t for t in raw_transports if t in valid_transports]
            transports = filtered if filtered else None
        # Encode credential_id to base64url for JSON serialization
        encoded_id = bytes_to_base64url(c.credential_id)
        if isinstance(encoded_id, bytes):
            encoded_id = encoded_id.decode('utf-8')
        allow_list.append(PublicKeyCredentialDescriptor(
            id=encoded_id,
            type="public-key",
            transports=transports,
        ))
    options = generate_authentication_options(
        rp_id=settings.rp_id,
        allow_credentials=allow_list or None,
        user_verification="preferred",
    )
    set_challenge(f"stepup-webauthn:{user.id}", {"challenge": options.challenge, "user_id": str(user.id)}, ttl_seconds=120)
    # Convert to dict and remove null transports to avoid browser TypeError
    options_dict = options.model_dump() if hasattr(options, "model_dump") else dict(options)
    if "allow_credentials" in options_dict and options_dict["allow_credentials"]:
        for cred in options_dict["allow_credentials"]:
            if cred.get("transports") is None:
                cred.pop("transports", None)
    return {"options": options_dict, "has_credentials": bool(credentials)}


@router.post("/stepup/webauthn/verify")
async def stepup_webauthn_verify(
    payload: WebAuthnVerifyRequest,
    request: Request,
    response: Response,
    ctx=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user, session, _ = ctx
    stored = pop_challenge(f"stepup-webauthn:{user.id}")
    if not stored:
        raise HTTPException(status_code=400, detail="Challenge expired")
    credential_id = base64url_to_bytes(payload.credential.get("id"))
    result = await db.execute(select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    try:
        verified = verify_authentication_response(
            credential=payload.credential,
            expected_challenge=stored["challenge"],
            expected_rp_id=settings.rp_id,
            expected_origin=settings.rp_origin,
            credential_public_key=cred.public_key,
            credential_current_sign_count=cred.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        await audit(db, "mfa_webauthn_failure", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {"stepup": True})
        raise HTTPException(status_code=401, detail="Invalid WebAuthn") from exc
    cred.sign_count = verified.new_sign_count
    cred.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    access_token = create_access_token(str(user.id), role_value(user), str(session.id), "webauthn", now_ts())
    csrf = generate_csrf_token()
    set_access_cookie(response, access_token, csrf)
    await audit(db, "mfa_webauthn_success", str(user.id), role_value(user), request.client.host if request.client else None, request.headers.get("user-agent"), {"stepup": True, "session_id": str(session.id)})
    return {"ok": True}


@router.post("/telegram-oauth/toggle")
async def toggle_telegram_oauth(
    payload: dict,
    ctx=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Toggle Telegram OAuth for current user"""
    user, _, _ = ctx
    enabled = payload.get("enabled", False)
    
    user.telegram_oauth_enabled = enabled
    await db.commit()
    return {"ok": True, "telegram_oauth_enabled": enabled}


@router.get("/telegram-oauth/status")
async def get_telegram_oauth_status(
    ctx=Depends(require_auth),
) -> dict:
    """Get Telegram OAuth status for current user"""
    user, _, _ = ctx
    return {"telegram_oauth_enabled": user.telegram_oauth_enabled}


@router.post("/change-password")
async def change_password(
    payload: dict,
    request: Request,
    response: Response,
    ctx=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Change user password and/or username"""
    user, _, _ = ctx
    old_password = payload.get("old_password", "")
    new_password = payload.get("new_password", "")
    new_username = payload.get("new_username")
    
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Handle password change
    if new_password:
        # Validate new password
        if len(new_password) < 6:
            raise HTTPException(
                status_code=400, 
                detail={"code": "password_too_short", "message": "Пароль должен содержать минимум 6 символов"}
            )
        
        # Verify old password if user already has one (not must_change_password)
        if not user.must_change_password:
            if not user.password_hash or not verify_secret(user.password_hash, old_password):
                raise HTTPException(
                    status_code=401, 
                    detail={"code": "invalid_password", "message": "Неверный текущий пароль"}
                )
        
        # Update password
        user.password_hash = hash_secret(new_password)
        user.must_change_password = False
        await audit(db, "password_changed", str(user.id), role_value(user), ip, user_agent, {})
    
    # Update username if provided
    if new_username and new_username != user.username:
        # Check if new username is available
        result = await db.execute(select(User).where(User.username == new_username))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=400, 
                detail={"code": "username_taken", "message": "Этот логин уже занят"}
            )
        user.username = new_username
        await audit(db, "username_changed", str(user.id), role_value(user), ip, user_agent, {"new_username": new_username})
    
    await db.commit()
    
    return {"ok": True}

