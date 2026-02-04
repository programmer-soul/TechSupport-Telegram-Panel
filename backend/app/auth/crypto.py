import hashlib
import secrets

from argon2 import PasswordHasher

from app.core.config import get_settings

settings = get_settings()

_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=102400,
    parallelism=8,
    hash_len=32,
    salt_len=16,
)


def hash_secret(value: str) -> str:
    return _hasher.hash(value)


def verify_secret(hashed: str, value: str) -> bool:
    try:
        return _hasher.verify(hashed, value)
    except Exception:
        return False


def random_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)
