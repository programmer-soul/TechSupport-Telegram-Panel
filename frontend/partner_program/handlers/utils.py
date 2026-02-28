import re
import secrets
import string

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import buttons as B
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message


METHOD_LABELS = {
    B.METHOD_CARD: B.BTN_METHOD_CARD,
    B.METHOD_USDT: B.BTN_METHOD_USDT,
    B.METHOD_TON: B.BTN_METHOD_TON,
    B.METHOD_SBP: B.BTN_METHOD_SBP,
}


def method_label(method: str | None) -> str:
    return METHOD_LABELS.get(method or B.METHOD_CARD, B.BTN_METHOD_CARD)


def mask_requisites(method: str | None, value: str | None) -> str:
    if not value:
        return "не указаны"
    v = value.strip()
    if method == B.METHOD_CARD:
        digits = re.sub(r"\D+", "", v)
        return "**** **** **** " + (digits[-4:] if len(digits) >= 4 else "****")
    if method == B.METHOD_SBP:
        return re.sub(r"\d", "•", v)
    return (v[:6] + "…" + v[-6:]) if len(v) > 14 else v


def validate_requisites(method: str, value: str) -> bool:
    v = (value or "").strip()
    if method == B.METHOD_CARD:
        v_clean = re.sub(r"\s+", "", v)
        return v_clean.isdigit() and len(v_clean) == 16 and v_clean[0] in "2456"
    if method == B.METHOD_USDT:
        return v.startswith("T") and 26 <= len(v) <= 40
    if method == B.METHOD_TON:
        return (v.startswith(("UQ", "EQ", "kQ", "0Q", "-Q")) and len(v) >= 36) or len(v) >= 48
    if method == B.METHOD_SBP:
        digits = re.sub(r"\D+", "", v)
        phone_ok = 10 <= len(digits) <= 15
        has_letters = any(ch.isalpha() for ch in v)
        return phone_ok and has_letters
    return False


def _parse_percent(text: str) -> float | None:
    s = text.strip().replace(",", ".")
    try:
        val = float(s)
    except ValueError:
        return None

    if 0.0 <= val <= 1.0:
        val *= 100.0

    if 0.0 <= val <= 100.0:
        return val
    return None


def method_label_safe(method: str | None) -> str:
    if not method:
        return "не задан"
    return METHOD_LABELS.get(method, "не задан")


async def safe_edit_text(message: Message, text: str, reply_markup=None):
    try:
        await message.edit_text(text, reply_markup=reply_markup)
    except TelegramBadRequest as e:
        if "message is not modified" in str(e):
            await message.edit_text(text + "\u2060", reply_markup=reply_markup)
        else:
            raise


async def generate_unique_partner_code(session: AsyncSession, length: int = 8, max_attempts: int = 20) -> str:
    from ..models import ExtendedUser
    
    alphabet = string.ascii_lowercase + string.digits
    for _ in range(max_attempts):
        candidate = "".join(secrets.choice(alphabet) for _ in range(length))
        code_exists = await session.scalar(
            select(exists().where(ExtendedUser.partner_code == candidate))
        )
        if not code_exists:
            return candidate
    raise RuntimeError("Не удалось сгенерировать уникальный partner_code после нескольких попыток")
