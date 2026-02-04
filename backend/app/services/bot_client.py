import httpx

from app.core.config import get_settings

settings = get_settings()


class BotClient:
    def __init__(self) -> None:
        self.base_url = settings.bot_base_url.rstrip("/")
        self.token = settings.bot_internal_token

    async def send_to_user(self, tg_id: int, message, attachments) -> int | None:
        """Send message to user. Returns telegram_message_id if successful."""
        payload = {
            "tg_id": tg_id,
            "message_id": str(message.id),  # Backend message ID for callback
            "text": message.text,
            "type": message.type.value if hasattr(message.type, "value") else message.type,
            "reply_to_telegram_message_id": getattr(message, "reply_to_telegram_message_id", None),
            "inline_buttons": getattr(message, "inline_buttons", None),
            "attachments": [
                {
                    "local_path": a.local_path,
                    "url": a.url,
                    "telegram_file_id": a.telegram_file_id,
                    "mime": a.mime,
                    "name": a.name,
                    "size": a.size,
                    "meta": a.meta,
                }
                for a in attachments
            ],
        }
        headers = {"X-Internal-Token": self.token}
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(f"{self.base_url}/internal/send", json=payload, headers=headers)
                data = resp.json()
                return data.get("telegram_message_id")
            except Exception:
                return None

    async def delete_message(self, tg_id: int, telegram_message_id: int) -> None:
        payload = {"tg_id": tg_id, "telegram_message_id": telegram_message_id}
        headers = {"X-Internal-Token": self.token}
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                await client.post(f"{self.base_url}/internal/delete", json=payload, headers=headers)
            except Exception:
                pass
