from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from jose import jwt

from app.core.config import get_settings

settings = get_settings()

_key_cache: dict[str, str] = {}


def _load_key(path_or_value: str | None) -> str | None:
    """Load key from file path or return value directly if it's a PEM key."""
    if not path_or_value:
        return None
    if path_or_value.startswith("-----BEGIN"):
        return path_or_value
    if path_or_value in _key_cache:
        return _key_cache[path_or_value]
    path = Path(path_or_value)
    if path.exists():
        content = path.read_text()
        _key_cache[path_or_value] = content
        return content
    return path_or_value


def _jwt_key_pair() -> tuple[str, str, str]:
    private = _load_key(settings.jwt_private_key)
    public = _load_key(settings.jwt_public_key)
    if private and public:
        return private, public, "RS256"
    return settings.secret_key, settings.secret_key, settings.jwt_algorithm or "HS256"


def create_access_token(subject: str, role: str, session_id: str, mfa_level: str, mfa_at: int) -> str:
    private_key, _, alg = _jwt_key_pair()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.access_token_exp_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "sid": session_id,
        "mfa_level": mfa_level,
        "mfa_at": mfa_at,
        "type": "access",
        "iss": settings.jwt_iss,
        "aud": settings.jwt_aud,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, private_key, algorithm=alg)


def create_refresh_token(subject: str, session_id: str, family_id: str, mfa_level: str | None = None) -> str:
    private_key, _, alg = _jwt_key_pair()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.refresh_token_exp_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "sid": session_id,
        "fid": family_id,
        "mfa_level": mfa_level,
        "type": "refresh",
        "iss": settings.jwt_iss,
        "aud": settings.jwt_aud,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, private_key, algorithm=alg)


def decode_token(token: str) -> dict[str, Any]:
    _, public_key, alg = _jwt_key_pair()
    return jwt.decode(token, public_key, algorithms=[alg], audience=settings.jwt_aud, issuer=settings.jwt_iss)


def now_ts() -> int:
    return int(time.time())
