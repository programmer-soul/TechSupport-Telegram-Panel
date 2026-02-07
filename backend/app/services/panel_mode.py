from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Chat
from app.models.enums import ChatStatus, MessageDirection, MessageType
from app.models.message import Message
from app.models.setting import Setting

PANEL_MODE_KEY = "panel_mode"
PANEL_MODE_TEST = "test"
PANEL_MODE_PROD = "prod"

TEST_CHAT_TG_ID = 999000111
TEST_CHAT_USERNAME = "test_user"
TEST_CHAT_FIRST_NAME = "Тестовый"
TEST_CHAT_LAST_NAME = "Пользователь"


async def get_panel_mode(db: AsyncSession) -> str:
    result = await db.execute(select(Setting).where(Setting.key == PANEL_MODE_KEY))
    setting = result.scalar_one_or_none()
    if setting and isinstance(setting.value_json, dict):
        mode = setting.value_json.get("mode")
        if mode in (PANEL_MODE_TEST, PANEL_MODE_PROD):
            return mode
    return PANEL_MODE_PROD


async def is_test_mode(db: AsyncSession) -> bool:
    return (await get_panel_mode(db)) == PANEL_MODE_TEST


async def ensure_test_chat(db: AsyncSession) -> Chat:
    result = await db.execute(select(Chat).where(Chat.tg_id == TEST_CHAT_TG_ID))
    chat = result.scalar_one_or_none()
    if not chat:
        chat = Chat(
            tg_id=TEST_CHAT_TG_ID,
            tg_username=TEST_CHAT_USERNAME,
            first_name=TEST_CHAT_FIRST_NAME,
            last_name=TEST_CHAT_LAST_NAME,
            language_code="ru",
            status=ChatStatus.new,
            unread_count=0,
            last_message_at=datetime.now(timezone.utc),
        )
        db.add(chat)
        await db.flush()
        seed_msg = Message(
            chat_id=chat.id,
            direction=MessageDirection.inbound,
            type=MessageType.text,
            text="Добро пожаловать в тестовый чат. Напишите сообщение — бот ответит шаблоном.",
        )
        db.add(seed_msg)
        chat.unread_count = 1
        chat.last_message_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(chat)
        return chat

    changed = False
    if chat.tg_username != TEST_CHAT_USERNAME:
        chat.tg_username = TEST_CHAT_USERNAME
        changed = True
    if chat.first_name != TEST_CHAT_FIRST_NAME:
        chat.first_name = TEST_CHAT_FIRST_NAME
        changed = True
    if chat.last_name != TEST_CHAT_LAST_NAME:
        chat.last_name = TEST_CHAT_LAST_NAME
        changed = True
    if chat.language_code != "ru":
        chat.language_code = "ru"
        changed = True
    if changed:
        await db.commit()
        await db.refresh(chat)
    existing = await db.execute(select(Message.id).where(Message.chat_id == chat.id).limit(1))
    if existing.scalar_one_or_none() is None:
        seed_msg = Message(
            chat_id=chat.id,
            direction=MessageDirection.inbound,
            type=MessageType.text,
            text="Добро пожаловать в тестовый чат. Напишите сообщение — бот ответит шаблоном.",
        )
        db.add(seed_msg)
        chat.unread_count = 1
        chat.last_message_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(chat)
    return chat


async def delete_test_chat(db: AsyncSession) -> str | None:
    result = await db.execute(select(Chat).where(Chat.tg_id == TEST_CHAT_TG_ID))
    chat = result.scalar_one_or_none()
    if not chat:
        return None
    chat_id = str(chat.id)
    await db.delete(chat)
    await db.commit()
    return chat_id
