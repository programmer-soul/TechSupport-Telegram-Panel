from __future__ import annotations

from typing import Iterable
from urllib.parse import quote

from app.schemas.messages import AttachmentOut, MessageOut
from app.core.config import get_settings

settings = get_settings()

def _api_base() -> str:
    base = settings.storage_public_base_url.rstrip("/")
    if base.endswith("/static"):
        base = base[:-7]
    return base


def _proxy_telegram_url(url: str | None, telegram_file_id: str | None = None) -> str | None:
    if not url:
        if telegram_file_id:
            encoded_file_id = quote(str(telegram_file_id), safe="")
            return f"{_api_base()}{settings.api_prefix}/files/telegram?file_id={encoded_file_id}"
        return url
    # Keep already-local/static URLs intact (e.g. generated sticker previews).
    if url.startswith("/static/") or "/static/" in url:
        return url
    # For Telegram direct links use file_id proxy when available (stable over time).
    if telegram_file_id and url.startswith("https://api.telegram.org/file/bot"):
        encoded_file_id = quote(str(telegram_file_id), safe="")
        return f"{_api_base()}{settings.api_prefix}/files/telegram?file_id={encoded_file_id}"
    if url.startswith("https://api.telegram.org/file/bot"):
        encoded = quote(url, safe="")
        return f"{_api_base()}{settings.api_prefix}/files/proxy?url={encoded}"
    return url


def serialize_message(message, attachments: Iterable | None = None) -> dict:
    if attachments is None:
        attachments_list = list(getattr(message, "attachments", []) or [])
    else:
        attachments_list = list(attachments)
    normalized = []
    for att in attachments_list:
        if isinstance(att, dict):
            if "id" not in att:
                att = {**att, "id": None}
            if not att.get("url") and att.get("local_path"):
                local_path = str(att.get("local_path"))
                base = settings.storage_local_path.rstrip("/")
                if local_path.startswith(base):
                    rel = local_path[len(base):].lstrip("/")
                    if rel:
                        att = {**att, "url": f"{settings.storage_public_base_url.rstrip('/')}/{rel}"}
            if att.get("url") or att.get("telegram_file_id"):
                att = {
                    **att,
                    "url": _proxy_telegram_url(
                        str(att.get("url")) if att.get("url") else None,
                        str(att.get("telegram_file_id")) if att.get("telegram_file_id") else None,
                    ),
                }
            normalized.append(att)
        else:
            if not hasattr(att, "id"):
                try:
                    data = att.model_dump()
                    data.setdefault("id", None)
                    if not data.get("url") and data.get("local_path"):
                        local_path = str(data.get("local_path"))
                        base = settings.storage_local_path.rstrip("/")
                        if local_path.startswith(base):
                            rel = local_path[len(base):].lstrip("/")
                            if rel:
                                data["url"] = f"{settings.storage_public_base_url.rstrip('/')}/{rel}"
                    if data.get("url") or data.get("telegram_file_id"):
                        data["url"] = _proxy_telegram_url(
                            str(data.get("url")) if data.get("url") else None,
                            str(data.get("telegram_file_id")) if data.get("telegram_file_id") else None,
                        )
                    normalized.append(data)
                except Exception:
                    normalized.append(att)
            else:
                if not getattr(att, "url", None) and getattr(att, "local_path", None):
                    local_path = str(att.local_path)
                    base = settings.storage_local_path.rstrip("/")
                    if local_path.startswith(base):
                        rel = local_path[len(base):].lstrip("/")
                        if rel:
                            att.url = f"{settings.storage_public_base_url.rstrip('/')}/{rel}"
                if getattr(att, "url", None) or getattr(att, "telegram_file_id", None):
                    att.url = _proxy_telegram_url(
                        str(att.url) if getattr(att, "url", None) else None,
                        str(att.telegram_file_id) if getattr(att, "telegram_file_id", None) else None,
                    )
                normalized.append(att)
    return MessageOut(
        id=message.id,
        chat_id=message.chat_id,
        direction=message.direction,
        type=message.type,
        text=message.text,
        telegram_message_id=message.telegram_message_id,
        reply_to_telegram_message_id=getattr(message, "reply_to_telegram_message_id", None),
        telegram_media_group_id=message.telegram_media_group_id,
        is_edited=getattr(message, "is_edited", None),
        edited_at=getattr(message, "edited_at", None),
        sent_by_user_id=getattr(message, "sent_by_user_id", None),
        created_at=message.created_at,
        attachments=[AttachmentOut.model_validate(a) for a in normalized],
        inline_buttons=getattr(message, "inline_buttons", None),
    ).model_dump()
