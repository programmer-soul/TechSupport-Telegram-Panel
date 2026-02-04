import time
from typing import Any

_store: dict[str, tuple[dict[str, Any], float]] = {}


def set_challenge(key: str, data: dict[str, Any], ttl_seconds: int = 120) -> None:
    _store[key] = (data, time.time() + ttl_seconds)


def get_challenge(key: str) -> dict[str, Any] | None:
    entry = _store.get(key)
    if not entry:
        return None
    data, exp = entry
    if time.time() > exp:
        _store.pop(key, None)
        return None
    return data


def pop_challenge(key: str) -> dict[str, Any] | None:
    data = get_challenge(key)
    _store.pop(key, None)
    return data
