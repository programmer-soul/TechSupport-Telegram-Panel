import hashlib
import hmac
import time

import pyotp

from app.auth.crypto import encrypt_totp
from app.auth.security import create_access_token, decode_token
from app.auth.service import totp_verify, verify_telegram_payload


def _build_telegram_payload(bot_token: str, auth_date: int) -> dict:
    payload = {
        "id": 123456789,
        "first_name": "Test",
        "username": "testuser",
        "auth_date": auth_date,
    }
    check_items = []
    for key in sorted(payload.keys()):
        check_items.append(f"{key}={payload[key]}")
    data_check = "\n".join(check_items)
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    digest = hmac.new(secret_key, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
    payload["hash"] = digest
    return payload


def test_verify_telegram_payload_ok():
    token = "bot-token"
    payload = _build_telegram_payload(token, int(time.time()))
    assert verify_telegram_payload(payload, token) is True


def test_verify_telegram_payload_expired():
    token = "bot-token"
    payload = _build_telegram_payload(token, int(time.time()) - 120)
    assert verify_telegram_payload(payload, token) is False


def test_totp_verify_roundtrip():
    secret = pyotp.random_base32()
    code = pyotp.TOTP(secret).now()
    encrypted = encrypt_totp(secret)
    assert totp_verify(encrypted, code) is True


def test_access_token_roundtrip():
    token = create_access_token("user-id", "administrator", "session-id", "webauthn", int(time.time()))
    payload = decode_token(token)
    assert payload["sub"] == "user-id"
    assert payload["role"] == "administrator"
    assert payload["type"] == "access"
