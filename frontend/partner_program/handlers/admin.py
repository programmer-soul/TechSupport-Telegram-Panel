from datetime import datetime
import re

import pytz
from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy import func, select

from handlers.admin.panel.keyboard import AdminPanelCallback
from handlers.admin.users.keyboard import AdminUserEditorCallback
from config import USERNAME_BOT

from .. import (
    buttons as B,
    texts as T,
)
from ..models import ExtendedUser, Partner, PayoutRequest
from ..settings import PAGE_SIZE, PARTNER_BONUS_PERCENTAGES
from ..stats_hook import partner_admin_stats_block
from .utils import _parse_percent, safe_edit_text


admin_router = Router(name="partner_program_admin")


class PartnerPercentStates(StatesGroup):
    waiting_for_value = State()


class PartnerCodeStates(StatesGroup):
    waiting_for_value = State()


@admin_router.callback_query(AdminPanelCallback.filter(F.action == "partner"))
async def partner_admin_menu(callback: CallbackQuery):
    text = "<b>🤝 Партнёрская программа</b>\nВыберите раздел:"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=B.BTN_PARTNER_STATS, callback_data="admin_panel:partner_stats")],
            [
                InlineKeyboardButton(
                    text=B.BTN_PARTNER_REQUESTS,
                    callback_data=AdminPanelCallback(action="partner_requests", page=1).pack(),
                )
            ],
            [InlineKeyboardButton(text=B.BTN_BACK_TO_ADMIN, callback_data="admin")],
        ]
    )
    await callback.answer()
    await safe_edit_text(callback.message, text, reply_markup=kb)


@admin_router.callback_query(F.data == "admin_panel:partner_stats")
async def show_partner_stats(callback: CallbackQuery, session):
    now = datetime.now(pytz.timezone("Europe/Moscow"))
    block = await partner_admin_stats_block(session=session, now=now) or "Нет данных по партнёрке."
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=B.BTN_BACK_TO_PARTNER,
                    callback_data=AdminPanelCallback(action="partner").pack(),
                )
            ],
            [InlineKeyboardButton(text=B.BTN_BACK_TO_ADMIN, callback_data="admin")],
        ]
    )
    await callback.answer()
    await safe_edit_text(callback.message, block, reply_markup=kb)


@admin_router.callback_query(AdminPanelCallback.filter(F.action == "partner_requests"))
async def show_partner_requests(callback: CallbackQuery, callback_data: AdminPanelCallback, session):
    from handlers.utils import edit_or_send_message
    from .. import buttons as B, texts as T
    from ..models import ExtendedUser

    await callback.answer()

    page = max(1, int(callback_data.page or 1))
    offset = (page - 1) * PAGE_SIZE

    stmt = (
        select(PayoutRequest)
        .where(PayoutRequest.status == "pending")
        .order_by(PayoutRequest.created_at.asc())
        .offset(offset)
        .limit(PAGE_SIZE)
    )
    result = await session.execute(stmt)
    requests = result.scalars().all()

    total_stmt = select(func.count()).select_from(PayoutRequest).where(PayoutRequest.status == "pending")
    total = await session.scalar(total_stmt) or 0

    if not requests:
        kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=B.BTN_BACK_TO_PARTNER,
                        callback_data=AdminPanelCallback(action="partner").pack(),
                    )
                ],
                [InlineKeyboardButton(text=B.BTN_BACK_TO_ADMIN, callback_data="admin")],
            ]
        )
        await edit_or_send_message(
            target_message=callback.message,
            text=T.ADMIN_NO_REQUESTS,
            reply_markup=kb,
        )
        return

    tg_ids = [r.tg_id for r in requests]
    users_map = {}
    if tg_ids:
        ures = await session.execute(
            select(ExtendedUser.tg_id, ExtendedUser.payout_method, ExtendedUser.card_number).where(
                ExtendedUser.tg_id.in_(tg_ids)
            )
        )
        for tg_id, payout_method, card_number in ures.all():
            users_map[tg_id] = {
                "payout_method": payout_method,
                "card_number": (card_number or "").strip(),
            }

    text_blocks = []
    keyboard_buttons = []

    for r in requests:
        u = users_map.get(r.tg_id, {})
        method = u.get("payout_method") or B.METHOD_CARD
        requisites = u.get("card_number") or ""

        text_blocks.append(T.admin_request_block(r, method, requisites))

        keyboard_buttons.append(
            [
                InlineKeyboardButton(text=f"✅ #{r.id}", callback_data=f"confirm_approve:{r.id}"),
                InlineKeyboardButton(text=f"❌ #{r.id}", callback_data=f"confirm_reject:{r.id}"),
            ]
        )

    nav_row = []
    if page > 1:
        nav_row.append(
            InlineKeyboardButton(
                text=B.BTN_NAV_PREV,
                callback_data=AdminPanelCallback(action="partner_requests", page=page - 1).pack(),
            )
        )
    if offset + PAGE_SIZE < total:
        nav_row.append(
            InlineKeyboardButton(
                text=B.BTN_NAV_NEXT,
                callback_data=AdminPanelCallback(action="partner_requests", page=page + 1).pack(),
            )
        )
    if nav_row:
        keyboard_buttons.append(nav_row)

    keyboard_buttons.append(
        [
            InlineKeyboardButton(
                text=B.BTN_BACK_TO_PARTNER,
                callback_data=AdminPanelCallback(action="partner").pack(),
            )
        ]
    )
    keyboard_buttons.append([InlineKeyboardButton(text=B.BTN_BACK_TO_ADMIN, callback_data="admin")])

    await edit_or_send_message(
        target_message=callback.message,
        text="\n\n".join(text_blocks),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard_buttons),
    )


@admin_router.callback_query(
    lambda c: c.data.startswith("confirm_approve:") or c.data.startswith("confirm_reject:")
)
async def confirm_payout_action(callback: CallbackQuery):
    action, payout_id = callback.data.split(":")
    confirm_text = T.admin_confirm_text(action)
    confirm_kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=B.BTN_CONFIRM, callback_data=f"{action.split('_')[1]}:{payout_id}"),
                InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="admin_panel:partner:1"),
            ]
        ]
    )
    await callback.answer()
    await callback.message.edit_text(confirm_text, reply_markup=confirm_kb)


@admin_router.callback_query(F.data.startswith("approve:"))
async def approve_payout(callback: CallbackQuery, session):
    payout_id = int(callback.data.split(":")[1])

    stmt = select(PayoutRequest).where(PayoutRequest.id == payout_id, PayoutRequest.status == "pending")
    result = await session.execute(stmt)
    req = result.scalar_one_or_none()

    if not req:
        await callback.answer("❌ Заявка не найдена или уже обработана", show_alert=True)
        return

    req.status = "approved"
    await session.commit()

    await callback.answer(T.ADMIN_APPROVED_ALERT)

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=B.BTN_TO_PROFILE, callback_data="profile")]]
    )

    await callback.bot.send_message(
        chat_id=req.tg_id,
        text=T.user_payout_approved(req.amount),
        reply_markup=keyboard,
    )

    await callback.message.edit_text(
        T.ADMIN_APPROVED_SCREEN,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text=B.BTN_BACK_TO_REQUESTS, callback_data="admin_panel:partner:1")]
            ]
        ),
    )


@admin_router.callback_query(F.data.startswith("reject:"))
async def reject_payout(callback: CallbackQuery, session):
    payout_id = int(callback.data.split(":")[1])

    stmt = select(PayoutRequest).where(PayoutRequest.id == payout_id, PayoutRequest.status == "pending")
    result = await session.execute(stmt)
    req = result.scalar_one_or_none()

    if not req:
        await callback.answer("❌ Заявка не найдена или уже обработана", show_alert=True)
        return

    req.status = "rejected"

    user_stmt = select(ExtendedUser).where(ExtendedUser.tg_id == req.tg_id)
    user_result = await session.execute(user_stmt)
    user = user_result.scalar_one_or_none()
    if user:
        user.partner_balance += req.amount

    await session.commit()

    await callback.answer(T.ADMIN_REJECTED_ALERT)

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=B.BTN_TO_PROFILE, callback_data="profile")]]
    )

    await callback.bot.send_message(
        chat_id=req.tg_id,
        text=T.user_payout_rejected(req.amount),
        reply_markup=keyboard,
    )

    await callback.message.edit_text(
        T.ADMIN_REJECTED_SCREEN,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text=B.BTN_BACK_TO_REQUESTS, callback_data="admin_panel:partner:1")]
            ]
        ),
    )


async def build_partner_summary(
    session,
    u: ExtendedUser,
    tg_id: int,
) -> tuple[str, InlineKeyboardMarkup]:
    default_percent = float(PARTNER_BONUS_PERCENTAGES.get(1, 0.0)) * 100.0

    if getattr(u, "partner_percent_custom", False) and getattr(u, "partner_percent", None) is not None:
        percent = u.partner_percent
    else:
        percent = default_percent

    balance = u.partner_balance or 0.0

    referred_count = (
        await session.scalar(select(func.count()).select_from(Partner).where(Partner.partner_tg_id == tg_id)) or 0
    )

    withdrawn_total = (
        await session.scalar(
            select(func.coalesce(func.sum(PayoutRequest.amount), 0.0)).where(
                PayoutRequest.tg_id == tg_id, PayoutRequest.status == "approved"
            )
        )
        or 0.0
    )

    partner_code = getattr(u, "partner_code", None)
    partner_code_display = partner_code if partner_code else "—"
    partner_identifier = partner_code if partner_code else str(tg_id)
    referral_link = f"https://t.me/{USERNAME_BOT}?start=partner_{partner_identifier}"

    lines = [
        "<b>🤝 Партнёрская программа</b>\n",
        f"👤 <code>{tg_id}</code>",
        f"🔗 Код: <code>{partner_code_display}</code>",
        f"📎 Ссылка: <code>{referral_link}</code>",
        f"📈 Процент: <b>{percent:.2f}%</b>",
        f"💰 Баланс: <b>{balance:.2f} ₽</b>",
        f"👥 Привёл: <b>{referred_count}</b>",
        f"🏦 Вывел: <b>{withdrawn_total:.2f} ₽</b>",
    ]
    text = "\n".join(lines)

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✏️ Изменить %",
                    callback_data=AdminUserEditorCallback(action="users_partner_percent_set", tg_id=tg_id).pack(),
                )
            ],
            [
                InlineKeyboardButton(
                    text="🔗 Сменить ссылку",
                    callback_data=AdminUserEditorCallback(action="users_partner_code_set", tg_id=tg_id).pack(),
                )
            ],
            [
                InlineKeyboardButton(
                    text="🔄 Сбросить к дефолту",
                    callback_data=AdminUserEditorCallback(action="users_partner_percent_reset", tg_id=tg_id).pack(),
                )
            ],
            [InlineKeyboardButton(text=B.BTN_BACK_TO_ADMIN, callback_data="admin")],
        ]
    )
    return text, kb


@admin_router.callback_query(AdminUserEditorCallback.filter(F.action == "users_partner_percent"))
async def show_user_partner_percent(callback: CallbackQuery, callback_data: AdminUserEditorCallback, session):
    tg_id = callback_data.tg_id

    u = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == tg_id))
    if not u:
        await callback.answer("Пользователь не найден", show_alert=True)
        return

    text, kb = await build_partner_summary(session, u, tg_id)
    await callback.answer()
    await safe_edit_text(callback.message, text, reply_markup=kb)


@admin_router.callback_query(AdminUserEditorCallback.filter(F.action == "users_partner_percent_set"))
async def ask_partner_percent_value(callback: CallbackQuery, callback_data: AdminUserEditorCallback, state: FSMContext):
    tg_id = callback_data.tg_id

    await state.set_state(PartnerPercentStates.waiting_for_value)
    await state.update_data(
        tg_id=tg_id,
        chat_id=callback.message.chat.id,
        msg_id=callback.message.message_id,
    )

    text = (
        "✏️ Введите новый процент партнёра.\n"
        "Допустимо: <b>0–100</b> (в процентах) или коэффициент <b>0.0–1.0</b>.\n\n"
        "Напр.: <code>30</code>, <code>30.5</code> или <code>0.3</code>.\n\n"
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="↩️ Отмена", callback_data="admin")]])

    await callback.answer()
    await callback.message.edit_text(text, reply_markup=kb)


@admin_router.message(PartnerPercentStates.waiting_for_value)
async def set_partner_percent_value(message: Message, state: FSMContext, session):
    txt = (message.text or "").strip().lower()
    if txt in {"отмена", "/cancel", "cancel"}:
        data = await state.get_data()
        tg_id = data.get("tg_id")
        chat_id = data.get("chat_id")
        msg_id = data.get("msg_id")
        await state.clear()

        if tg_id and chat_id and msg_id:
            u = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == tg_id))
            if u:
                summary, kb = await build_partner_summary(session, u, tg_id)
                await message.bot.edit_message_text(chat_id=chat_id, message_id=msg_id, text=summary, reply_markup=kb)
        return

    percent = _parse_percent(message.text or "")
    if percent is None:
        await message.answer("❌ Неверный формат. Введите число в диапазоне 0–100 (или коэффициент 0.0–1.0).")
        return

    data = await state.get_data()
    tg_id = data.get("tg_id")
    chat_id = data.get("chat_id")
    msg_id = data.get("msg_id")
    if not tg_id or not chat_id or not msg_id:
        await state.clear()
        await message.answer("Не удалось определить контекст. Откройте экран заново из админки.")
        return

    u = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == tg_id))
    if not u:
        await state.clear()
        await message.answer("Пользователь не найден.")
        return

    u.partner_percent = float(percent)
    u.partner_percent_custom = True
    await session.commit()
    await state.clear()

    summary, kb = await build_partner_summary(session, u, tg_id)
    try:
        await message.bot.edit_message_text(chat_id=chat_id, message_id=msg_id, text=summary, reply_markup=kb)
    except TelegramBadRequest as e:
        if "message is not modified" not in str(e):
            raise
    try:
        await message.delete()
    except Exception:
        pass


@admin_router.callback_query(AdminUserEditorCallback.filter(F.action == "users_partner_code_set"))
async def ask_partner_code_value(callback: CallbackQuery, callback_data: AdminUserEditorCallback, state: FSMContext):
    tg_id = callback_data.tg_id

    await state.set_state(PartnerCodeStates.waiting_for_value)
    await state.update_data(
        tg_id=tg_id,
        chat_id=callback.message.chat.id,
        msg_id=callback.message.message_id,
    )

    text = (
        "🔗 Введите новый код для партнёрской ссылки.\n"
        "Только латиница/цифры и подчёркивание.\n"
        "Диапазон: <b>3–32</b> символа.\n\n"
        "Пример: <code>solonet</code>\n\n"
        "Чтобы отменить: <code>отмена</code>\n"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="↩️ Отмена",
                    callback_data=AdminUserEditorCallback(action="users_partner_percent", tg_id=tg_id).pack(),
                )
            ]
        ]
    )

    await callback.answer()
    await callback.message.edit_text(text, reply_markup=kb)


@admin_router.message(PartnerCodeStates.waiting_for_value)
async def set_partner_code_value(message: Message, state: FSMContext, session):
    raw = (message.text or "").strip()
    low = raw.lower()

    if low in {"отмена", "/cancel", "cancel"}:
        data = await state.get_data()
        tg_id = data.get("tg_id")
        chat_id = data.get("chat_id")
        msg_id = data.get("msg_id")
        await state.clear()

        if tg_id and chat_id and msg_id:
            u = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == tg_id))
            if u:
                summary, kb = await build_partner_summary(session, u, tg_id)
                await message.bot.edit_message_text(chat_id=chat_id, message_id=msg_id, text=summary, reply_markup=kb)
        return

    code = low
    if not re.fullmatch(r"[a-z0-9_]{3,32}", code or ""):
        await message.answer("❌ Неверный код. Разрешены: латинские буквы, цифры и _. Длина 3–32.")
        return

    data = await state.get_data()
    tg_id = data.get("tg_id")
    chat_id = data.get("chat_id")
    msg_id = data.get("msg_id")
    if not tg_id or not chat_id or not msg_id:
        await state.clear()
        await message.answer("Не удалось определить контекст. Откройте экран заново из админки.")
        return

    exists_code = await session.scalar(
        select(func.count())
        .select_from(ExtendedUser)
        .where(ExtendedUser.partner_code == code, ExtendedUser.tg_id != tg_id)
    )
    if (exists_code or 0) > 0:
        await message.answer("❌ Такой код уже занят. Выберите другой.")
        return

    u = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == tg_id))
    if not u:
        await state.clear()
        await message.answer("Пользователь не найден.")
        return

    u.partner_code = code
    await session.commit()
    await state.clear()

    summary, kb = await build_partner_summary(session, u, tg_id)
    try:
        await message.bot.edit_message_text(chat_id=chat_id, message_id=msg_id, text=summary, reply_markup=kb)
    except TelegramBadRequest as e:
        if "message is not modified" not in str(e):
            raise
    try:
        await message.delete()
    except Exception:
        pass


@admin_router.callback_query(AdminUserEditorCallback.filter(F.action == "users_partner_percent_reset"))
async def reset_partner_percent(callback: CallbackQuery, callback_data: AdminUserEditorCallback, session):
    tg_id = callback_data.tg_id

    u = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == tg_id))
    if not u:
        await callback.answer("Пользователь не найден", show_alert=True)
        return

    if not getattr(u, "partner_percent_custom", False):
        await callback.answer("Уже установлено значение по умолчанию.")
        return

    u.partner_percent_custom = False
    u.partner_percent = None
    await session.commit()
    await callback.answer("Процент сброшен к значению по умолчанию (из конфига).")

    text, kb = await build_partner_summary(session, u, tg_id)
    await safe_edit_text(callback.message, text, reply_markup=kb)
