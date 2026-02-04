from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime


def encode_cursor(dt: datetime, ident: str) -> str:
    payload = f"{dt.isoformat()}|{ident}".encode("utf-8")
    return urlsafe_b64encode(payload).decode("utf-8")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    raw = urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
    ts, ident = raw.split("|", 1)
    return datetime.fromisoformat(ts), ident
