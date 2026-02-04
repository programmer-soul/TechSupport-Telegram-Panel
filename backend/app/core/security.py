from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


ALGORITHM = "HS256"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or settings.access_token_exp_minutes)
    to_encode: dict[str, Any] = {"sub": subject, "exp": exp, "type": "access"}
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str, expires_minutes: int | None = None) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or settings.refresh_token_exp_minutes)
    to_encode: dict[str, Any] = {"sub": subject, "exp": exp, "type": "refresh"}
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    if settings.jwt_private_key and settings.jwt_public_key:
        key = settings.jwt_public_key
        alg = settings.jwt_algorithm or "RS256"
    else:
        key = settings.secret_key
        alg = settings.jwt_algorithm or ALGORITHM
    return jwt.decode(token, key, algorithms=[alg], audience=settings.jwt_aud, issuer=settings.jwt_iss)
