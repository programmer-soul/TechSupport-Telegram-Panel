import asyncio
import html
import logging
import os
import io
import uuid
from typing import Any
from datetime import datetime

import httpx
from aiogram.exceptions import TelegramEntityTooLarge, TelegramBadRequest, TelegramForbiddenError
from aiogram import Bot, Dispatcher, Router, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ContentType, ParseMode, ChatAction
from aiogram.filters import CommandStart, Command
from aiogram.types import FSInputFile, Message, InputMediaPhoto, InputMediaVideo, InlineKeyboardMarkup, InlineKeyboardButton, ChatMemberUpdated
from aiohttp import web

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://backend:8000")
INTERNAL_TOKEN = os.getenv("BOT_INTERNAL_TOKEN", "change-me-bot")
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")
WEBHOOK_PATH = os.getenv("WEBHOOK_PATH", "/webhook/telegram")
PORT = int(os.getenv("BOT_PORT", "8081"))
MAX_TELEGRAM_FILE_BYTES = int(os.getenv("TELEGRAM_FILE_LIMIT_MB", "49")) * 1024 * 1024
UPLOADS_PATH = os.getenv("UPLOADS_PATH", "/data/uploads")


def convert_heic_to_jpeg(data: bytes) -> tuple[bytes, str]:
    """Convert HEIC/HEIF image to JPEG. Returns (data, new_filename)."""
    try:
        import pillow_heif
        from PIL import Image
        
        pillow_heif.register_heif_opener()
        img = Image.open(io.BytesIO(data))
        
        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=92)
        return output.getvalue(), f"{uuid.uuid4().hex}.jpg"
    except Exception as e:
        logger.error(f"HEIC conversion failed: {e}")
        return data, None


async def download_and_convert_heic(file_id: str, original_name: str) -> dict | None:
    """Download HEIC file from Telegram, convert to JPEG, save locally."""
    global bot
    if not bot:
        return None
    
    try:
        # Download file from Telegram
        file = await bot.get_file(file_id)
        if not file.file_path:
            return None
        
        file_bytes = await bot.download_file(file.file_path)
        if not file_bytes:
            return None
        
        data = file_bytes.read()
        
        # Convert HEIC to JPEG
        converted_data, new_filename = convert_heic_to_jpeg(data)
        if not new_filename:
            # Conversion failed, save as-is
            new_filename = f"{uuid.uuid4().hex}.heic"
            converted_data = data
            mime = "image/heic"
        else:
            mime = "image/jpeg"
        
        # Save to uploads folder
        os.makedirs(UPLOADS_PATH, exist_ok=True)
        local_path = os.path.join(UPLOADS_PATH, new_filename)
        with open(local_path, 'wb') as f:
            f.write(converted_data)
        
        return {
            "local_path": local_path,
            "url": f"/static/{new_filename}",
            "name": original_name.rsplit('.', 1)[0] + ('.jpg' if mime == 'image/jpeg' else '.heic'),
            "size": len(converted_data),
            "mime": mime,
        }
    except Exception as e:
        logger.error(f"Failed to download/convert HEIC: {e}")
        return None


async def download_telegram_file(file_id: str, target_name: str) -> dict | None:
    """Download Telegram file and save to local uploads. Returns file metadata."""
    global bot
    if not bot:
        return None
    try:
        file = await bot.get_file(file_id)
        if not file.file_path:
            return None
        file_bytes = await bot.download_file(file.file_path)
        if not file_bytes:
            return None
        data = file_bytes.read()
        os.makedirs(UPLOADS_PATH, exist_ok=True)
        filename = f"{uuid.uuid4().hex}_{target_name}"
        local_path = os.path.join(UPLOADS_PATH, filename)
        with open(local_path, "wb") as f:
            f.write(data)
        return {
            "local_path": local_path,
            "url": f"/static/{filename}",
            "size": len(data),
        }
    except Exception as e:
        logger.warning(f"Failed to download Telegram file {file_id}: {e}")
        return None


def build_inline_keyboard(buttons_data: list[list[dict]] | None) -> InlineKeyboardMarkup | None:
    """Build InlineKeyboardMarkup from button data."""
    if not buttons_data:
        return None
    keyboard = []
    for row in buttons_data:
        keyboard_row = []
        for btn in row:
            if btn.get("text") and btn.get("url"):
                keyboard_row.append(InlineKeyboardButton(text=btn["text"], url=btn["url"]))
        if keyboard_row:
            keyboard.append(keyboard_row)
    return InlineKeyboardMarkup(inline_keyboard=keyboard) if keyboard else None

DEFAULT_AUTOREPLY = os.getenv("BOT_AUTOREPLY", "Сообщение отправлено! Ожидайте ответа.")
DEFAULT_AUTOREPLY_DELETE_AFTER = int(os.getenv("BOT_AUTOREPLY_DELETE_AFTER", "5"))


def plain_text(value: str | None) -> str:
    """Keep text as plain user content, preserving all symbols and line breaks."""
    return value if isinstance(value, str) else ""


def classify_forbidden_reason(exc: Exception) -> str:
    text = str(exc).lower()
    if "blocked by the user" in text or "bot was blocked" in text:
        return "blocked"
    if "can't initiate conversation" in text or "have no rights to send a message" in text:
        return "stopped_or_never_started"
    if "user is deactivated" in text:
        return "deactivated"
    if "chat not found" in text:
        return "not_found"
    return "unknown"


def forbidden_response(exc: Exception) -> web.Response:
    reason = classify_forbidden_reason(exc)
    return web.json_response({"ok": False, "error": "forbidden", "reason": reason}, status=403)

# Bot will be initialized later when token is available
bot: Bot | None = None
TELEGRAM_TOKEN: str = ""
router = Router()
MEDIA_GROUP_FLUSH_DELAY_SEC = 0.75
_media_group_lock = asyncio.Lock()
_media_group_buffers: dict[str, dict[str, Any]] = {}


async def backend_request(method: str, path: str, json_body: dict | None = None) -> Any:
    headers = {"X-Internal-Token": INTERNAL_TOKEN}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.request(method, f"{BACKEND_BASE_URL}{path}", json=json_body, headers=headers)
        resp.raise_for_status()
        if resp.text:
            return resp.json()
        return None


async def fetch_bot_token() -> str | None:
    """Fetch Telegram bot token from panel settings."""
    try:
        data = await backend_request("GET", "/api/bot/settings/telegram_bot_token")
        if data and data.get("value_json"):
            token = data["value_json"].get("token")
            if token and isinstance(token, str) and ":" in token:
                return token
    except Exception as e:
        logger.debug(f"Could not fetch bot token from panel: {e}")
    return None


async def send_system_to_panel(tg_id: int, text: str) -> None:
    try:
        await backend_request(
            "POST",
            "/api/bot/outgoing",
            {
                "tg_id": tg_id,
                "text": text,
                "type": "system",
                "attachments": [],
            },
        )
    except Exception:
        pass


async def fetch_setting(key: str) -> dict | None:
    try:
        data = await backend_request("GET", f"/api/bot/settings/{key}")
        return data.get("value_json") if data else None
    except Exception:
        return None


async def fetch_user_photo_url(user_id: int, username: str | None = None) -> str | None:
    global bot, TELEGRAM_TOKEN
    if not bot:
        if username:
            return f"https://t.me/i/userpic/320/{username}.jpg"
        return None
    try:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        if not photos.photos:
            if username:
                return f"https://t.me/i/userpic/320/{username}.jpg"
            return None
        file_id = photos.photos[0][-1].file_id
        file = await bot.get_file(file_id)
        if not file.file_path:
            if username:
                return f"https://t.me/i/userpic/320/{username}.jpg"
            return None
        return f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}/{file.file_path}"
    except Exception:
        if username:
            return f"https://t.me/i/userpic/320/{username}.jpg"
        return None


@router.message(CommandStart())
async def handle_start(message: Message) -> None:
    # /start is not a support ticket message.
    # Ticket should be created only after the user's first regular message.
    # Fetch greeting from 'messages' settings (same as panel uses)
    messages_settings = await fetch_setting("messages")
    if not messages_settings:
        return
    # Check if greeting is enabled
    greeting_enabled = messages_settings.get("greeting_enabled", True)  # default to True for backwards compat
    if not greeting_enabled:
        return
    text = messages_settings.get("greeting")
    if not text:
        # If not configured in settings, don't send greeting
        return
    await message.answer(text, parse_mode=ParseMode.HTML)


@router.message(Command("link"))
async def handle_link(message: Message) -> None:
    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.answer("Пришлите код: /link ABCD1234")
        return
    code = parts[1].strip()
    await backend_request(
        "POST",
        "/api/bot/link",
        {"code": code, "tg_id": message.from_user.id, "tg_username": message.from_user.username},
    )
    await message.answer("Telegram аккаунт успешно привязан.")


@router.message(Command("login"))
async def handle_login(message: Message) -> None:
    data = await backend_request(
        "POST",
        "/api/bot/login-code",
        {"tg_id": message.from_user.id},
    )
    code = data.get("code")
    await message.answer(f"Код для входа: <code>{code}</code>")


@router.my_chat_member()
async def handle_my_chat_member(update: ChatMemberUpdated) -> None:
    chat = update.chat
    if not chat or chat.type != "private":
        return
    new_status = getattr(update.new_chat_member, "status", None)
    old_status = getattr(update.old_chat_member, "status", None)
    # Telegram can report private-chat delivery loss as:
    # - kicked: user blocked the bot
    # - left: user stopped the bot
    if new_status == "kicked":
        blocked = True
        reason = "blocked"
    elif new_status == "left":
        blocked = True
        reason = "stopped_or_never_started"
    else:
        blocked = False
        reason = None
    # In private chats Telegram does not always distinguish stop vs block reliably.
    # We still track delivery availability to proactively lock composer in panel.
    try:
        await backend_request(
            "POST",
            "/api/bot/chat-delivery-state",
            {"tg_id": chat.id, "blocked": blocked, "reason": reason},
        )
    except Exception as e:
        logger.debug(f"Failed to update chat delivery state: {e}")
    logger.info(f"my_chat_member chat={chat.id} old={old_status} new={new_status} blocked={blocked}")


async def _file_url(file_id: str) -> str | None:
    global bot, TELEGRAM_TOKEN
    if not bot:
        return None
    try:
        file = await bot.get_file(file_id)
        if not file.file_path:
            return None
        return f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}/{file.file_path}"
    except Exception:
        return None


async def extract_attachment(message: Message) -> tuple[str, dict | None]:
    if message.content_type == ContentType.PHOTO and message.photo:
        photo = message.photo[-1]
        return "photo", {
            "telegram_file_id": photo.file_id,
            "url": await _file_url(photo.file_id),
            "name": "photo.jpg",
            "size": photo.file_size,
            "mime": "image/jpeg",
            "meta": {"file_unique_id": photo.file_unique_id},
        }
    if message.content_type == ContentType.DOCUMENT and message.document:
        doc = message.document
        filename = doc.file_name or ""
        mime = doc.mime_type or ""
        
        # Check if it's a HEIC/HEIF file - convert it
        if mime in ('image/heic', 'image/heif') or filename.lower().endswith(('.heic', '.heif')):
            converted = await download_and_convert_heic(doc.file_id, filename)
            if converted:
                return "photo", {
                    "telegram_file_id": doc.file_id,
                    "local_path": converted["local_path"],
                    "url": converted["url"],
                    "name": converted["name"],
                    "size": converted["size"],
                    "mime": converted["mime"],
                    "meta": {"file_unique_id": doc.file_unique_id},
                }
        
        return "document", {
            "telegram_file_id": doc.file_id,
            "url": await _file_url(doc.file_id),
            "name": filename,
            "size": doc.file_size,
            "mime": mime,
            "meta": {"file_unique_id": doc.file_unique_id},
        }
    if message.content_type == ContentType.VIDEO and message.video:
        video = message.video
        return "video", {
            "telegram_file_id": video.file_id,
            "url": await _file_url(video.file_id),
            "name": "video.mp4",
            "size": video.file_size,
            "mime": video.mime_type,
            "meta": {"file_unique_id": video.file_unique_id},
        }
    if message.content_type == ContentType.VIDEO_NOTE and message.video_note:
        note = message.video_note
        return "video_note", {
            "telegram_file_id": note.file_id,
            "url": await _file_url(note.file_id),
            "name": "video_note.mp4",
            "size": note.file_size,
            "mime": "video/mp4",
            "meta": {"file_unique_id": note.file_unique_id},
        }
    if message.content_type == ContentType.ANIMATION and message.animation:
        anim = message.animation
        return "animation", {
            "telegram_file_id": anim.file_id,
            "url": await _file_url(anim.file_id),
            "name": "animation.gif",
            "size": anim.file_size,
            "mime": anim.mime_type or "image/gif",
            "meta": {"file_unique_id": anim.file_unique_id},
        }
    if message.content_type == ContentType.VOICE and message.voice:
        voice = message.voice
        return "voice", {
            "telegram_file_id": voice.file_id,
            "url": await _file_url(voice.file_id),
            "name": "voice.ogg",
            "size": voice.file_size,
            "mime": voice.mime_type or "audio/ogg",
            "meta": {"file_unique_id": voice.file_unique_id},
        }
    if message.content_type == ContentType.AUDIO and message.audio:
        audio = message.audio
        return "audio", {
            "telegram_file_id": audio.file_id,
            "url": await _file_url(audio.file_id),
            "name": audio.file_name,
            "size": audio.file_size,
            "mime": audio.mime_type or "audio/mpeg",
            "meta": {"file_unique_id": audio.file_unique_id},
        }
    if message.content_type == ContentType.STICKER and message.sticker:
        sticker = message.sticker
        is_animated = bool(getattr(sticker, "is_animated", False))
        is_video = bool(getattr(sticker, "is_video", False))
        if is_animated:
            sticker_name = "sticker.tgs"
            sticker_mime = "application/x-tgsticker"
        elif is_video:
            sticker_name = "sticker.webm"
            sticker_mime = "video/webm"
        else:
            sticker_name = "sticker.webp"
            sticker_mime = "image/webp"

        local = await download_telegram_file(sticker.file_id, sticker_name)
        preview_local = None
        if (is_animated or is_video) and getattr(sticker, "thumbnail", None):
            preview_local = await download_telegram_file(sticker.thumbnail.file_id, "sticker_preview.webp")
        return "sticker", {
            "telegram_file_id": sticker.file_id,
            "local_path": (preview_local or local or {}).get("local_path"),
            "url": (preview_local or local or {}).get("url") or await _file_url(sticker.file_id),
            "name": "sticker_preview.webp" if preview_local else sticker_name,
            "size": (preview_local or local or {}).get("size") or sticker.file_size,
            "mime": "image/webp" if preview_local else sticker_mime,
            "meta": {
                "file_unique_id": sticker.file_unique_id,
                "is_animated": is_animated,
                "is_video": is_video,
                "source_mime": sticker_mime,
            },
        }
    return "text", None


@router.message()
async def handle_any(message: Message) -> None:
    if message.text and message.text.startswith("/"):
        return
    photo_url = await fetch_user_photo_url(message.from_user.id, message.from_user.username)
    msg_type, attachment = await extract_attachment(message)
    if attachment is not None:
        meta = dict(attachment.get("meta") or {})
        meta["telegram_message_id"] = message.message_id
        attachment["meta"] = meta
    
    # Extract forward info
    forward_from_name = None
    forward_from_username = None
    forward_date = None
    
    if message.forward_from:
        # Forwarded from a user
        forward_from_name = message.forward_from.full_name
        forward_from_username = message.forward_from.username
        forward_date = message.forward_date.isoformat() if message.forward_date else None
    elif message.forward_from_chat:
        # Forwarded from a channel/group
        forward_from_name = message.forward_from_chat.title
        forward_from_username = message.forward_from_chat.username
        forward_date = message.forward_date.isoformat() if message.forward_date else None
    elif message.forward_sender_name:
        # Forwarded from a hidden user
        forward_from_name = message.forward_sender_name
        forward_date = message.forward_date.isoformat() if message.forward_date else None
    
    payload = {
        "tg_id": message.from_user.id,
        "tg_username": message.from_user.username,
        "first_name": message.from_user.first_name,
        "last_name": message.from_user.last_name,
        "language_code": message.from_user.language_code,
        "photo_url": photo_url,
        "text": message.text or message.caption,
        "type": msg_type,
        "telegram_message_id": message.message_id,
        "reply_to_telegram_message_id": message.reply_to_message.message_id if message.reply_to_message else None,
        "telegram_media_group_id": message.media_group_id,
        "attachments": [attachment] if attachment else [],
        "forward_from_name": forward_from_name,
        "forward_from_username": forward_from_username,
        "forward_date": forward_date,
    }
    async def send_incoming(incoming_payload: dict[str, Any]) -> Any:
        return await backend_request("POST", "/api/bot/incoming", incoming_payload)

    media_group_id = message.media_group_id
    if media_group_id:
        async def flush_media_group(group_key: str) -> None:
            await asyncio.sleep(MEDIA_GROUP_FLUSH_DELAY_SEC)
            async with _media_group_lock:
                bucket = _media_group_buffers.pop(group_key, None)
            if not bucket:
                return
            items = bucket.get("items", [])
            if not items:
                return
            base = dict(items[0])
            # Merge all attachments from the album into one payload.
            merged_attachments: list[dict[str, Any]] = []
            for item in items:
                for att in item.get("attachments", []) or []:
                    if att:
                        merged_attachments.append(att)
            # Keep caption/text from the first item that has it.
            merged_text = next((it.get("text") for it in items if it.get("text")), None)
            base["text"] = merged_text
            base["attachments"] = merged_attachments
            # Stable representative message id for the grouped payload.
            msg_ids = [it.get("telegram_message_id") for it in items if it.get("telegram_message_id")]
            base["telegram_message_id"] = min(msg_ids) if msg_ids else base.get("telegram_message_id")
            try:
                resp_local = await send_incoming(base)
            except Exception:
                return
            if resp_local and resp_local.get("send_autoreply"):
                messages_settings = await fetch_setting("messages") or {}
                autoreply_enabled = messages_settings.get("autoreply_enabled", True)
                autoreply_text = messages_settings.get("autoreply")
                delete_after = messages_settings.get("autoreply_delete_sec")

                if not autoreply_enabled:
                    return
                if not autoreply_text:
                    autoreply_text = DEFAULT_AUTOREPLY
                if delete_after is None:
                    delete_after = DEFAULT_AUTOREPLY_DELETE_AFTER

                safe_autoreply = plain_text(str(autoreply_text))
                try:
                    reply = await message.answer(html.escape(safe_autoreply))
                except TelegramBadRequest:
                    reply = await message.answer(safe_autoreply)

                async def delete_later_group() -> None:
                    try:
                        delay = int(delete_after) if str(delete_after).isdigit() else DEFAULT_AUTOREPLY_DELETE_AFTER
                    except Exception:
                        delay = DEFAULT_AUTOREPLY_DELETE_AFTER
                    if delay <= 0:
                        return
                    await asyncio.sleep(delay)
                    try:
                        await bot.delete_message(chat_id=message.chat.id, message_id=reply.message_id)
                    except Exception:
                        pass

                asyncio.create_task(delete_later_group())

        async with _media_group_lock:
            bucket = _media_group_buffers.get(media_group_id)
            if not bucket:
                bucket = {"items": [], "task": None}
                _media_group_buffers[media_group_id] = bucket
            bucket["items"].append(payload)
            if not bucket.get("task"):
                bucket["task"] = asyncio.create_task(flush_media_group(media_group_id))
        return

    resp = await send_incoming(payload)
    if resp and resp.get("send_autoreply"):
        messages_settings = await fetch_setting("messages") or {}
        autoreply_enabled = messages_settings.get("autoreply_enabled", True)
        autoreply_text = messages_settings.get("autoreply")
        delete_after = messages_settings.get("autoreply_delete_sec")

        if not autoreply_enabled:
            return

        if not autoreply_text:
            autoreply_text = DEFAULT_AUTOREPLY
        if delete_after is None:
            delete_after = DEFAULT_AUTOREPLY_DELETE_AFTER

        safe_autoreply = plain_text(str(autoreply_text))
        try:
            reply = await message.answer(html.escape(safe_autoreply))
        except TelegramBadRequest:
            reply = await message.answer(safe_autoreply)

        async def delete_later() -> None:
            try:
                delay = int(delete_after) if str(delete_after).isdigit() else DEFAULT_AUTOREPLY_DELETE_AFTER
            except Exception:
                delay = DEFAULT_AUTOREPLY_DELETE_AFTER
            if delay <= 0:
                return
            await asyncio.sleep(delay)
            try:
                await bot.delete_message(chat_id=message.chat.id, message_id=reply.message_id)
            except Exception:
                pass

        asyncio.create_task(delete_later())


@router.edited_message()
async def handle_edited(message: Message) -> None:
    payload = {
        "tg_id": message.from_user.id,
        "telegram_message_id": message.message_id,
        "text": message.text or message.caption,
        "edited_at": datetime.utcnow().isoformat(),
    }
    await backend_request("POST", "/api/bot/edited", payload)


async def handle_internal_delete(request: web.Request) -> web.Response:
    global bot
    token = request.headers.get("X-Internal-Token")
    if token != INTERNAL_TOKEN:
        return web.json_response({"error": "unauthorized"}, status=401)
    if not bot:
        return web.json_response({"error": "bot_not_initialized"}, status=503)
    data = await request.json()
    tg_id = int(data.get("tg_id"))
    telegram_message_id = int(data.get("telegram_message_id"))
    try:
        await bot.delete_message(chat_id=tg_id, message_id=telegram_message_id)
    except TelegramBadRequest as e:
        return web.json_response({"ok": False, "error": "bad_request", "detail": str(e)}, status=400)
    except TelegramForbiddenError as e:
        return web.json_response({"ok": False, "error": "forbidden", "detail": str(e)}, status=403)
    except Exception as e:
        return web.json_response({"ok": False, "error": "delete_failed", "detail": str(e)}, status=500)
    return web.json_response({"ok": True})


async def handle_internal_send(request: web.Request) -> web.Response:
    global bot
    token = request.headers.get("X-Internal-Token")
    if token != INTERNAL_TOKEN:
        return web.json_response({"error": "unauthorized"}, status=401)
    if not bot:
        return web.json_response({"error": "bot_not_initialized"}, status=503)
    data = await request.json()
    tg_id = int(data.get("tg_id"))
    text = plain_text(data.get("text"))
    msg_type = data.get("type", "text")
    reply_to = data.get("reply_to_telegram_message_id")
    attachments = data.get("attachments", [])
    inline_buttons = data.get("inline_buttons")
    
    # Track sent message IDs (for media groups / multi-attachments)
    sent_telegram_message_id = None
    sent_telegram_message_ids: list[int] = []
    
    # Build inline keyboard if buttons provided
    reply_markup = build_inline_keyboard(inline_buttons)
    
    # Send typing action and wait a bit for natural feel
    try:
        if attachments:
            # Choose appropriate action based on content type
            first_att = attachments[0] if attachments else {}
            mime = (first_att.get("mime") or "").lower()
            if mime.startswith("video/") or msg_type in ("video", "video_note", "animation"):
                await bot.send_chat_action(tg_id, ChatAction.UPLOAD_VIDEO)
            elif mime.startswith("audio/") or msg_type in ("audio", "voice"):
                await bot.send_chat_action(tg_id, ChatAction.UPLOAD_VOICE)
            elif mime.startswith("image/") or msg_type == "photo":
                await bot.send_chat_action(tg_id, ChatAction.UPLOAD_PHOTO)
            else:
                await bot.send_chat_action(tg_id, ChatAction.UPLOAD_DOCUMENT)
        else:
            await bot.send_chat_action(tg_id, ChatAction.TYPING)
        # Small delay for natural typing feel (0.5-1.5 seconds based on text length)
        delay = min(1.5, max(0.5, len(text) / 100)) if text else 0.5
        await asyncio.sleep(delay)
    except Exception as e:
        logger.debug(f"Could not send chat action: {e}")

    if attachments:
        def to_file_input(att: dict):
            file_id = att.get("telegram_file_id")
            local_path = att.get("local_path")
            url = att.get("url")
            if local_path and os.path.exists(local_path):
                return FSInputFile(local_path, filename=att.get("name"))
            if url:
                return url
            if file_id:
                return file_id
            return None

        def local_size(att: dict) -> int | None:
            local_path = att.get("local_path")
            if local_path and os.path.exists(local_path):
                try:
                    return os.path.getsize(local_path)
                except Exception:
                    return None
            return None

        def ensure_size(att: dict) -> bool:
            size = local_size(att)
            if size is None:
                return True
            return size <= MAX_TELEGRAM_FILE_BYTES

        def infer_kind(att: dict):
            mime = (att.get("mime") or "").lower()
            name = (att.get("name") or "").lower()
            if mime.startswith("image/") or name.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")):
                return "photo"
            if mime.startswith("video/") or name.endswith((".mp4", ".mov", ".mkv")):
                return "video"
            if mime.startswith("audio/") or name.endswith((".mp3", ".wav", ".ogg")):
                return "audio"
            return "document"

        if len(attachments) > 1:
            media = []
            all_media = True
            for idx, att in enumerate(attachments):
                if not ensure_size(att):
                    await send_system_to_panel(
                        tg_id,
                        f"Файл слишком большой для Telegram: {att.get('name') or 'file'}",
                    )
                    all_media = False
                    break
                kind = infer_kind(att)
                file_input = to_file_input(att)
                if kind == "photo":
                    media.append(InputMediaPhoto(media=file_input, caption=text if idx == 0 else None))
                elif kind == "video":
                    media.append(InputMediaVideo(media=file_input, caption=text if idx == 0 else None))
                else:
                    all_media = False
                    break
            if all_media and media:
                try:
                    sent_group = await bot.send_media_group(tg_id, media=media, reply_to_message_id=reply_to)
                    sent_telegram_message_ids = [m.message_id for m in sent_group if getattr(m, "message_id", None)]
                    if sent_telegram_message_ids:
                        sent_telegram_message_id = sent_telegram_message_ids[0]
                except TelegramForbiddenError as e:
                    return forbidden_response(e)
                except TelegramEntityTooLarge:
                    await send_system_to_panel(
                        tg_id,
                        "Файлы слишком большие для Telegram. Отправка отменена.",
                    )
                    return web.json_response({"ok": False, "error": "too_large"}, status=413)
            else:
                for idx, att in enumerate(attachments):
                    if not ensure_size(att):
                        await send_system_to_panel(
                            tg_id,
                            f"Файл слишком большой для Telegram: {att.get('name') or 'file'}",
                        )
                        continue
                    file_input = to_file_input(att)
                    caption = text if idx == 0 else None
                    kind = infer_kind(att)
                    # Only add reply_markup to last item
                    is_last = idx == len(attachments) - 1
                    markup = reply_markup if is_last else None
                    try:
                        if kind == "photo":
                            sent_msg = await bot.send_photo(tg_id, photo=file_input, caption=caption, reply_to_message_id=reply_to, reply_markup=markup)
                        elif kind == "video":
                            sent_msg = await bot.send_video(tg_id, video=file_input, caption=caption, reply_to_message_id=reply_to, reply_markup=markup)
                        elif kind == "audio":
                            sent_msg = await bot.send_audio(tg_id, audio=file_input, caption=caption, reply_to_message_id=reply_to, reply_markup=markup)
                        else:
                            sent_msg = await bot.send_document(tg_id, document=file_input, caption=caption, reply_to_message_id=reply_to, reply_markup=markup)
                        if sent_msg and getattr(sent_msg, "message_id", None):
                            sent_telegram_message_ids.append(sent_msg.message_id)
                    except TelegramForbiddenError as e:
                        return forbidden_response(e)
                    except TelegramEntityTooLarge:
                        await send_system_to_panel(
                            tg_id,
                            f"Файл слишком большой для Telegram: {att.get('name') or 'file'}",
                        )
                if sent_telegram_message_ids:
                    sent_telegram_message_id = sent_telegram_message_ids[0]
        else:
            attachment = attachments[0]
            if not ensure_size(attachment):
                await send_system_to_panel(
                    tg_id,
                    f"Файл слишком большой для Telegram: {attachment.get('name') or 'file'}",
                )
                return web.json_response({"ok": False, "error": "too_large"}, status=413)
            file_input = to_file_input(attachment)
            
            async def send_single_attachment(markup, caption_override=None):
                cap = caption_override if caption_override is not None else (text if text else None)
                if msg_type == "photo":
                    return await bot.send_photo(tg_id, photo=file_input, caption=cap, reply_to_message_id=reply_to, reply_markup=markup)
                elif msg_type == "video":
                    return await bot.send_video(tg_id, video=file_input, caption=cap, reply_to_message_id=reply_to, reply_markup=markup)
                elif msg_type == "video_note":
                    return await bot.send_video_note(tg_id, video_note=file_input, reply_to_message_id=reply_to, reply_markup=markup)
                elif msg_type == "animation":
                    return await bot.send_animation(tg_id, animation=file_input, caption=cap, reply_to_message_id=reply_to, reply_markup=markup)
                elif msg_type == "audio":
                    return await bot.send_audio(tg_id, audio=file_input, caption=cap, reply_to_message_id=reply_to, reply_markup=markup)
                elif msg_type == "voice":
                    return await bot.send_voice(tg_id, voice=file_input, reply_to_message_id=reply_to, reply_markup=markup)
                elif msg_type == "sticker":
                    return await bot.send_sticker(tg_id, sticker=file_input, reply_to_message_id=reply_to, reply_markup=markup)
                else:
                    return await bot.send_document(tg_id, document=file_input, caption=cap, reply_to_message_id=reply_to, reply_markup=markup)
            
            try:
                sent_msg = await send_single_attachment(reply_markup)
                sent_telegram_message_id = sent_msg.message_id
            except TelegramForbiddenError as e:
                return forbidden_response(e)
            except TelegramBadRequest as e:
                if "can't parse entities" in str(e).lower():
                    logger.warning(f"HTML parse error in caption, retrying with escaped text: {e}")
                    sent_msg = await send_single_attachment(reply_markup, caption_override=html.escape(text))
                    sent_telegram_message_id = sent_msg.message_id
                elif "inline keyboard" in str(e).lower() or "url" in str(e).lower():
                    # Invalid inline keyboard URL - send without buttons
                    logger.warning(f"Invalid inline keyboard URL, sending without buttons: {e}")
                    await send_system_to_panel(tg_id, f"⚠️ Кнопка не добавлена: неверный URL")
                    sent_msg = await send_single_attachment(None)
                    sent_telegram_message_id = sent_msg.message_id
                else:
                    raise
            except TelegramEntityTooLarge:
                await send_system_to_panel(
                    tg_id,
                    f"Файл слишком большой для Telegram: {attachment.get('name') or 'file'}",
                )
                return web.json_response({"ok": False, "error": "too_large"}, status=413)
    else:
        try:
            sent_msg = await bot.send_message(tg_id, text, reply_to_message_id=reply_to, reply_markup=reply_markup)
            sent_telegram_message_id = sent_msg.message_id
        except TelegramForbiddenError as e:
            return forbidden_response(e)
        except TelegramBadRequest as e:
            if "can't parse entities" in str(e).lower():
                logger.warning(f"HTML parse error, retrying with escaped text: {e}")
                sent_msg = await bot.send_message(tg_id, html.escape(text), reply_to_message_id=reply_to, reply_markup=reply_markup)
                sent_telegram_message_id = sent_msg.message_id
            elif "inline keyboard" in str(e).lower() or "url" in str(e).lower():
                # Invalid inline keyboard URL - send without buttons
                logger.warning(f"Invalid inline keyboard URL, sending without buttons: {e}")
                await send_system_to_panel(tg_id, f"⚠️ Кнопка не добавлена: неверный URL")
                sent_msg = await bot.send_message(tg_id, html.escape(text), reply_to_message_id=reply_to)
                sent_telegram_message_id = sent_msg.message_id
            else:
                raise

    return web.json_response(
        {
            "ok": True,
            "telegram_message_id": sent_telegram_message_id,
            "telegram_message_ids": sent_telegram_message_ids,
        }
    )


async def wait_for_token() -> str:
    """Wait until a valid bot token is available from the panel."""
    global TELEGRAM_TOKEN
    logger.info("Waiting for Telegram bot token from panel settings...")
    
    while True:
        token = await fetch_bot_token()
        if token:
            TELEGRAM_TOKEN = token
            logger.info("Bot token received from panel!")
            return token
        logger.info("No valid bot token in panel yet. Retrying in 10 seconds...")
        await asyncio.sleep(10)


async def initialize_bot(token: str) -> Bot:
    """Initialize the bot with the given token."""
    global bot
    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    logger.info("Bot initialized successfully!")
    return bot


async def on_startup(app: web.Application) -> None:
    global bot
    if not bot:
        logger.warning("Bot not initialized yet, skipping webhook/polling setup")
        return
    allowed_updates = app["dispatcher"].resolve_used_update_types()
    if WEBHOOK_URL:
        await bot.set_webhook(
            f"{WEBHOOK_URL}{WEBHOOK_PATH}",
            allowed_updates=allowed_updates,
            drop_pending_updates=False,
        )
    else:
        app["polling_task"] = asyncio.create_task(
            app["dispatcher"].start_polling(bot, allowed_updates=allowed_updates)
        )


async def on_shutdown(app: web.Application) -> None:
    task = app.get("polling_task")
    if task:
        task.cancel()
    if bot:
        await bot.session.close()


async def health_check(request: web.Request) -> web.Response:
    """Health check endpoint that returns bot status."""
    return web.json_response({
        "ok": True,
        "bot_initialized": bot is not None,
        "token_configured": bool(TELEGRAM_TOKEN),
    })


async def create_app() -> web.Application:
    global bot
    
    app = web.Application()
    dp = Dispatcher()
    dp.include_router(router)
    app["dispatcher"] = dp

    # Add health check endpoint (works without token)
    app.router.add_get("/health", health_check)
    app.router.add_post("/internal/send", handle_internal_send)
    app.router.add_post("/internal/delete", handle_internal_delete)
    
    app.on_shutdown.append(on_shutdown)
    return app


async def run_bot():
    """Main entry point that waits for token before starting."""
    global bot
    
    # Create the web app first (for health checks)
    app = await create_app()
    
    # Wait for token from panel BEFORE starting the server
    token = await wait_for_token()
    
    # Initialize bot
    bot = await initialize_bot(token)
    
    # Register webhook handler BEFORE starting the web server
    from aiogram.webhook.aiohttp_server import SimpleRequestHandler
    SimpleRequestHandler(dispatcher=app["dispatcher"], bot=bot).register(app, path=WEBHOOK_PATH)
    
    # NOW start web server (after all handlers are registered)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"HTTP server started on port {PORT}")
    
    # Setup webhook or polling
    allowed_updates = app["dispatcher"].resolve_used_update_types()
    if WEBHOOK_URL:
        await bot.set_webhook(
            f"{WEBHOOK_URL}{WEBHOOK_PATH}",
            allowed_updates=allowed_updates,
            drop_pending_updates=False,
        )
        logger.info(f"Webhook set to {WEBHOOK_URL}{WEBHOOK_PATH}, allowed_updates={allowed_updates}")
        # Keep running
        while True:
            await asyncio.sleep(3600)
    else:
        logger.info("Starting polling...")
        await app["dispatcher"].start_polling(bot, allowed_updates=allowed_updates)


if __name__ == "__main__":
    asyncio.run(run_bot())
