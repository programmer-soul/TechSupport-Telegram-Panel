from io import BytesIO
import os
import qrcode
import re
from html import escape

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery, InlineQuery, InlineKeyboardButton, InlineKeyboardMarkup, InlineQueryResultArticle, InputTextMessageContent
from sqlalchemy import (
    exists,
    func,
    select,
    text as sql_text,
)
from sqlalchemy.ext.asyncio import AsyncSession
from aiogram.utils.keyboard import InlineKeyboardBuilder

from config import ADMIN_ID
from database.models import User
from handlers.utils import edit_or_send_message
from logger import logger

from .. import (
    buttons as B,
    texts as T,
)
from ..models import Partner, PayoutRequest
from ..settings import (
    ENABLE_PAYOUT_CARD,
    ENABLE_PAYOUT_TON,
    ENABLE_PAYOUT_USDT,
    ENABLE_PAYOUT_SBP,
    MIN_PARTNER_PAYOUT,
    PARTNER_BONUS_PERCENTAGES,
    PARTNER_FLAT_BONUSES,
    REFERRAL_REWARD_MODE,
    QR_CODE,
    PARTNER_PAYOUT_FEE_RATE,
    ENABLE_WITHDRAW_TO_BALANCE,
    SKIP_PAYOUT_LIMIT_FOR_BALANCE,
    ENABLE_CUSTOM_WITHDRAW_AMOUNT,
    ENABLE_PARTNER_CUSTOM_CODE_INPUT,
)
from .utils import (
    generate_unique_partner_code,
    mask_requisites,
    method_label,
    method_label_safe,
    validate_requisites,
)
from config import INLINE_MODE, USERNAME_BOT
from .payments import move_partner_to_main

from handlers.buttons import BACK, MAIN_MENU


router = Router(name="partner_program_user")


class PartnerStates(StatesGroup):
    waiting_for_requisites = State()
    confirming_code_change = State()
    waiting_for_partner_code = State()
    waiting_for_withdraw_amount = State()
    waiting_for_balance_amount = State()


@router.callback_query(F.data == "partner")
async def partner_callback(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    await callback.answer()
    await state.clear()
    if callback.message is None:
        return
    tg_id = callback.from_user.id
    bot_user = await callback.bot.get_me()
    await show_partner_menu(callback.message, tg_id, bot_user.username, session)


async def _load_user_map(session: AsyncSession, tg_id: int) -> dict:
    row = await session.execute(
        select("*").select_from(sql_text("users")).where(sql_text("tg_id = :tg_id")),
        {"tg_id": tg_id},
    )
    return row.mappings().first() or {}


async def show_partner_menu(message_or_callback, tg_id: int, bot_username: str, session: AsyncSession):
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
    from handlers.utils import edit_or_send_message

    user = await _load_user_map(session, tg_id)
    partner_balance = round(float(user.get("partner_balance", 0) or 0), 2)

    method_db = user.get("payout_method") or None
    requisites = (user.get("card_number") or "").strip()
    method_effective = method_db if requisites else None
    requisites_masked = mask_requisites(method_effective, requisites)

    invited_count = (
        await session.scalar(
            select(func.count()).select_from(Partner).where(Partner.partner_tg_id == tg_id)
        ) or 0
    )

    partner_code = user.get("partner_code")
    partner_identifier = partner_code if partner_code else str(tg_id)
    referral_link = f"https://t.me/{bot_username}?start=partner_{partner_identifier}"

    raw_percent = user.get("partner_percent")
    custom_flag_raw = user.get("partner_percent_custom")
    default_percent = float(PARTNER_BONUS_PERCENTAGES.get(1, 0.0)) * 100.0

    try:
        raw_percent_f = float(raw_percent) if raw_percent is not None else None
    except (TypeError, ValueError):
        raw_percent_f = None

    is_custom_flag = bool(custom_flag_raw)

    if is_custom_flag and raw_percent_f is not None:
        is_custom_bonus = True
        percent_val = raw_percent_f
    else:
        is_custom_bonus = False
        percent_val = default_percent

    partner_bonus_eff = max(0.0, min(100.0, percent_val)) / 100.0

    text = partner_menu_text(
        referral_link=referral_link,
        invited_count=invited_count,
        partner_balance=partner_balance,
        method=method_effective,
        requisites_masked=requisites_masked,
        bonus=partner_bonus_eff,
        is_custom=is_custom_bonus,
    )

    btn_method_text = f"Вывод: {method_label_safe(method_effective)}"
    invite_text = T.PARTNER_SHARE_TEXT.format(link=referral_link)

    if INLINE_MODE:
        invite_btn = InlineKeyboardButton(text=B.BTN_INVITE, switch_inline_query="partner")
    else:
        invite_btn = InlineKeyboardButton(text=B.BTN_INVITE, switch_inline_query=invite_text)

    rows = [
        [InlineKeyboardButton(text=B.BTN_WITHDRAW, callback_data="withdraw")],
        [InlineKeyboardButton(text=btn_method_text, callback_data="set_method")],
        [invite_btn],
    ]
    if QR_CODE:
        rows.append([InlineKeyboardButton(text=B.BTN_QR, callback_data="partner_qr")])

    if ENABLE_PARTNER_CUSTOM_CODE_INPUT or not partner_code:
        rows.append([InlineKeyboardButton(text=B.BTN_CHANGE_CODE, callback_data="partner_change_code")])

    rows.append([InlineKeyboardButton(text=B.BTN_BACK, callback_data="profile")])

    keyboard = InlineKeyboardMarkup(inline_keyboard=rows)

    target = message_or_callback.message if isinstance(message_or_callback, CallbackQuery) else message_or_callback

    await edit_or_send_message(
        target_message=target,
        text=text,
        reply_markup=keyboard,
        media_path="img/partner.jpg",
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "partner_qr")
async def show_partner_qr(callback_query: CallbackQuery, session: AsyncSession):
    try:
        tg_id = callback_query.from_user.id
        user = await _load_user_map(session, tg_id)
        partner_code = user.get("partner_code")
        partner_identifier = partner_code if partner_code else str(tg_id)
        referral_link = f"https://t.me/{USERNAME_BOT}?start=partner_{partner_identifier}"

        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(referral_link)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buffer = BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        qr_path = f"/tmp/qrcode_partner_{tg_id}.png"
        with open(qr_path, "wb") as f:
            f.write(buffer.read())

        builder = InlineKeyboardBuilder()
        builder.row(InlineKeyboardButton(text=BACK, callback_data="partner"))

        await edit_or_send_message(
            target_message=callback_query.message,
            text="📷 <b>Ваш QR-код партнёрской ссылки.</b>",
            reply_markup=builder.as_markup(),
            media_path=qr_path,
        )

        os.remove(qr_path)
    except Exception as e:
        logger.error(f"Ошибка при генерации QR-кода партнёрской ссылки: {e}", exc_info=True)
        await callback_query.message.answer("❌ Произошла ошибка при создании QR-кода.")


@router.inline_query(F.query == "partner")
async def inline_partner_handler(inline_query: InlineQuery, session: AsyncSession):
    tg_id = inline_query.from_user.id
    user = await _load_user_map(session, tg_id)
    partner_code = user.get("partner_code")
    partner_identifier = partner_code if partner_code else str(tg_id)
    referral_link = f"https://t.me/{USERNAME_BOT}?start=partner_{partner_identifier}"
    invite_text = T.PARTNER_SHARE_TEXT.format(link=referral_link)[:4096]

    kb = InlineKeyboardBuilder()
    kb.row(InlineKeyboardButton(text=B.BTN_PARTNER_CONNECT, url=referral_link))

    result = InlineQueryResultArticle(
        id="partner_invite",
        title=f"🤝 {T.PARTNER_INLINE_TITLE}",
        description=T.PARTNER_INLINE_DESCRIPTION,
        input_message_content=InputTextMessageContent(message_text=invite_text),
        reply_markup=kb.as_markup(),
    )

    await inline_query.answer(results=[result], cache_time=86400, is_personal=True)


def partner_menu_text(
    referral_link: str,
    invited_count: int,
    partner_balance: float,
    method: str | None,
    requisites_masked: str,
    bonus: float = 0.0,
    is_custom: bool = False,
) -> str:
    example_amount = 540

    def _p(v: float) -> str:
        v *= 100.0
        return f"{int(round(v))}" if abs(v - round(v)) < 1e-9 else f"{v:.2f}".rstrip("0").rstrip(".")

    def _r(v: float) -> str:
        return f"{round(v, 2)}"

    method_text = escape(method_label_safe(method))
    req_text = escape(requisites_masked or "—")
    referral_link_safe = escape(referral_link)

    levels_pct = PARTNER_BONUS_PERCENTAGES or {}
    levels_flat = PARTNER_FLAT_BONUSES or {}
    mode = (REFERRAL_REWARD_MODE or "").strip().lower()

    if is_custom:
        reward_line = T.REWARD_LINE_PERCENT.format(percent=_p(max(0.0, bonus)))
    elif mode == "flat_only":
        if len(levels_flat) == 1 and float(levels_flat.get(1, 0) or 0) > 0:
            reward_line = T.REWARD_LINE_FLAT.format(flat=_r(float(levels_flat[1])))
        else:
            reward_line = T.REWARD_LINE_FLAT.format(flat="{X}")
    elif mode == "percent_only":
        if levels_pct and float(levels_pct.get(1, 0) or 0) > 0:
            reward_line = T.REWARD_LINE_PERCENT.format(percent=_p(float(levels_pct[1])))
        else:
            reward_line = T.REWARD_LINE_PERCENT.format(percent="{X}")
    else:
        p = float(levels_pct.get(1, 0) or 0)
        f = float(levels_flat.get(1, 0) or 0)
        parts = []
        if p > 0:
            parts.append(f"{_p(p)}%")
        if f > 0:
            parts.append(f"{_r(f)}₽")
        reward_line = T.REWARD_LINE_BOTH.format(percent=_p(p), flat=_r(f)) if parts else T.NOT_CONFIGURED

    head = (
        f"{T.PARTNER_TITLE}\n\n"
        f"{T.PARTNER_INTRO.format(reward_line=reward_line)}\n\n"
        f"{T.PARTNER_LINK_LABEL.format(referral_link=referral_link_safe)}\n\n"
        f"{T.PARTNER_STATS_TITLE}\n"
        f"{T.PARTNER_STATS_BLOCK.format(invited_count=invited_count, partner_balance=partner_balance, method_text=method_text, req_text=req_text)}\n\n"
        f"{T.PARTNER_WITHDRAW_NOTE.format(min_payout=MIN_PARTNER_PAYOUT)}\n\n"
    )

    all_levels = sorted(set(levels_pct.keys()) | set(levels_flat.keys())) or [1]
    single_level = len(all_levels) == 1
    lvl = all_levels[0]

    if is_custom:
        eff = max(0.0, bonus)
        if eff <= 0:
            return head + T.NOT_CONFIGURED
        earned = _r(example_amount * eff)
        return head + (
            f"{T.RATE_SINGLE_TITLE.format(rate_text=f'{_p(eff)}%')}\n"
            f"{T.RATE_SINGLE_EXAMPLE.format(example_amount=example_amount, earned=earned)}"
        )

    if mode == "flat_only":
        if single_level:
            flat = float(levels_flat.get(lvl, 0) or 0)
            if flat <= 0:
                return head + T.NOT_CONFIGURED
            return head + (
                f"{T.RATE_SINGLE_TITLE.format(rate_text=f'{_r(flat)}₽')}\n"
                f"{T.RATE_SINGLE_EXAMPLE.format(example_amount=example_amount, earned=_r(flat))}"
            )
        lines = []
        for i in all_levels:
            fi = float(levels_flat.get(i, 0) or 0)
            if fi <= 0:
                continue
            lines.append(T.LEVEL_LINE_FLAT.format(lvl=i, flat=_r(fi)))
        return head + f"{T.LEVELS_TITLE_FLAT}\n<blockquote>{'\n'.join(lines) or T.DASH}</blockquote>"

    if mode == "percent_only":
        if single_level:
            pct = float(levels_pct.get(lvl, 0) or 0)
            if pct <= 0:
                return head + T.NOT_CONFIGURED
            earn = _r(example_amount * pct)
            return head + (
                f"{T.RATE_SINGLE_TITLE.format(rate_text=f'{_p(pct)}%')}\n"
                f"{T.RATE_SINGLE_EXAMPLE.format(example_amount=example_amount, earned=earn)}"
            )
        lines = []
        for i in all_levels:
            pi = float(levels_pct.get(i, 0) or 0)
            if pi <= 0:
                continue
            lines.append(T.LEVEL_LINE_PERCENT.format(lvl=i, percent=_p(pi), earned=_r(example_amount * pi)))
        return head + f"{T.LEVELS_TITLE_PERCENT}\n<blockquote>{'\n'.join(lines) or T.DASH}</blockquote>"

    if single_level:
        pct = float(levels_pct.get(lvl, 0) or 0)
        flat = float(levels_flat.get(lvl, 0) or 0)
        parts = []
        if pct > 0:
            parts.append(f"{_p(pct)}%")
        if flat > 0:
            parts.append(f"{_r(flat)}₽")
        if not parts:
            return head + T.NOT_CONFIGURED
        earn = _r(example_amount * pct + flat)
        return head + (
            f"{T.RATE_SINGLE_TITLE.format(rate_text=' + '.join(parts))}\n"
            f"{T.RATE_SINGLE_EXAMPLE.format(example_amount=example_amount, earned=earn)}"
        )

    lines = []
    for i in all_levels:
        pi = float(levels_pct.get(i, 0) or 0)
        fi = float(levels_flat.get(i, 0) or 0)
        parts = []
        if pi > 0:
            parts.append(f"{_p(pi)}%")
        if fi > 0:
            parts.append(f"{_r(fi)}₽")
        if not parts:
            continue
        earn = _r(example_amount * pi + fi)
        lines.append(T.LEVEL_LINE_BOTH.format(lvl=i, parts=" + ".join(parts), earned=earn))
    return head + f"{T.LEVELS_TITLE_BOTH}\n<blockquote>{'\n'.join(lines) or T.DASH}</blockquote>"


@router.callback_query(F.data == "set_method")
async def ask_set_method(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    from handlers.utils import edit_or_send_message

    await callback.answer()
    user = await _load_user_map(session, callback.from_user.id)
    current = user.get("payout_method") or B.METHOD_CARD

    rows: list[list[InlineKeyboardButton]] = []

    if ENABLE_PAYOUT_CARD:
        rows.append([
            InlineKeyboardButton(
                text=("✅ " if current == B.METHOD_CARD else "") + B.BTN_METHOD_CARD,
                callback_data=f"choose_method:{B.METHOD_CARD}",
            )
        ])
    if ENABLE_PAYOUT_USDT:
        rows.append([
            InlineKeyboardButton(
                text=("✅ " if current == B.METHOD_USDT else "") + B.BTN_METHOD_USDT,
                callback_data=f"choose_method:{B.METHOD_USDT}",
            )
        ])
    if ENABLE_PAYOUT_TON:
        rows.append([
            InlineKeyboardButton(
                text=("✅ " if current == B.METHOD_TON else "") + B.BTN_METHOD_TON,
                callback_data=f"choose_method:{B.METHOD_TON}",
            )
        ])
    if ENABLE_PAYOUT_SBP:
        rows.append([
            InlineKeyboardButton(
                text=("✅ " if current == B.METHOD_SBP else "") + B.BTN_METHOD_SBP,
                callback_data=f"choose_method:{B.METHOD_SBP}",
            )
        ])

    if not rows:
        await edit_or_send_message(
            target_message=callback.message,
            text=T.ASK_METHODS_DISABLED,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]]
            ),
            disable_web_page_preview=True,
        )
        return

    rows.append([InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")])

    await edit_or_send_message(
        target_message=callback.message,
        text=T.ask_method_caption(current),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        disable_web_page_preview=True,
    )


def _method_enabled(method: str) -> bool:
    return (
        (method == B.METHOD_CARD and ENABLE_PAYOUT_CARD)
        or (method == B.METHOD_USDT and ENABLE_PAYOUT_USDT)
        or (method == B.METHOD_TON and ENABLE_PAYOUT_TON)
        or (method == B.METHOD_SBP and ENABLE_PAYOUT_SBP)
    )


@router.callback_query(F.data.startswith("choose_method:"))
async def choose_method(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    _, method = callback.data.split(":", 1)
    if method not in {B.METHOD_CARD, B.METHOD_USDT, B.METHOD_TON, B.METHOD_SBP} or not _method_enabled(method):
        await callback.answer("Этот способ сейчас недоступен", show_alert=True)
        return

    await state.set_state(PartnerStates.waiting_for_requisites)
    await state.update_data(chosen_method=method)

    await callback.answer(f"Вы выбрали: {method_label(method)}")
    await edit_or_send_message(
        target_message=callback.message,
        text=T.ask_requisites_caption(method),
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="partner")]]
        ),
        disable_web_page_preview=True,
    )


@router.message(PartnerStates.waiting_for_requisites)
async def process_requisites_input(message: Message, state: FSMContext, session: AsyncSession):
    data = await state.get_data()
    chosen_method = data.get("chosen_method")
    text = (message.text or "").strip()

    if chosen_method not in {B.METHOD_CARD, B.METHOD_USDT, B.METHOD_TON, B.METHOD_SBP}:
        await edit_or_send_message(
            target_message=message,
            text="Произошла ошибка состояния. Начните заново: /partner",
            disable_web_page_preview=True,
        )
        await state.clear()
        return

    if not validate_requisites(chosen_method, text):
        await edit_or_send_message(
            target_message=message,
            text=T.CARD_INVALID,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="partner")]]
            ),
            disable_web_page_preview=True,
        )
        return

    await session.execute(
        sql_text("UPDATE users SET payout_method = :m, card_number = :req WHERE tg_id = :tg_id"),
        {"m": chosen_method, "req": text, "tg_id": message.from_user.id},
    )
    await session.commit()

    await state.clear()
    await edit_or_send_message(
        target_message=message,
        text=T.CARD_SAVED,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]]
        ),
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "withdraw")
async def withdraw_menu(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    await state.clear()
    tg_id = callback.from_user.id
    user = await _load_user_map(session, tg_id)
    partner_balance = float(user.get("partner_balance", 0) or 0)

    if partner_balance <= 0:
        try:
            await callback.answer((T.ALERT_ZERO_BALANCE or "Недостаточно средств"), show_alert=True)
        except Exception:
            pass

        await edit_or_send_message(
            target_message=callback.message,
            text=T.ZERO_BALANCE_SCREEN,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]]
            ),
            disable_web_page_preview=True,
        )
        return

    if partner_balance < MIN_PARTNER_PAYOUT:
        if ENABLE_WITHDRAW_TO_BALANCE and SKIP_PAYOUT_LIMIT_FOR_BALANCE:
            fee_rate = float(PARTNER_PAYOUT_FEE_RATE or 0.0)
            fee = round(partner_balance * fee_rate, 2) if fee_rate > 0 else 0.0
            net_amount = max(partner_balance - fee, 0.0) if fee_rate > 0 else partner_balance

            text = T.withdraw_menu_low_balance(
                partner_balance=partner_balance,
                min_payout=MIN_PARTNER_PAYOUT,
                fee_rate=fee_rate,
                fee=fee,
                net_amount=net_amount,
            )

            rows = [
                [InlineKeyboardButton(text=B.BTN_PAY_BALANCE, callback_data="withdraw_to_balance")],
                [InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]
            ]

            kb = InlineKeyboardMarkup(inline_keyboard=rows)
            await edit_or_send_message(
                target_message=callback.message,
                text=text,
                reply_markup=kb,
                disable_web_page_preview=True,
            )
            return
        else:
            try:
                await callback.answer(T.alert_min_payout(), show_alert=True)
            except Exception:
                pass

            await edit_or_send_message(
                target_message=callback.message,
                text=T.alert_min_payout(),
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]]
                ),
                disable_web_page_preview=True,
            )
            return

    fee_rate = float(PARTNER_PAYOUT_FEE_RATE or 0.0)
    text_lines = [
        "<b>Вывод средств</b>",
        "",
        f"Доступно: <b>{partner_balance:.2f} ₽</b>",
    ]

    if fee_rate > 0:
        fee = round(partner_balance * fee_rate, 2)
        net_amount = max(partner_balance - fee, 0.0)
        text_lines.append(f"Комиссия: <b>{fee_rate * 100:.2f}%</b> (~<b>{fee:.2f} ₽</b>)")
        text_lines.append(f"К выплате при выводе всего баланса: <b>{net_amount:.2f} ₽</b>")

    text_lines.append("")
    text_lines.append("Куда вывести?")

    text = "\n".join(text_lines)

    rows = [
        [InlineKeyboardButton(text=B.BTN_PAY, callback_data="withdraw_to_requisites")]
    ]
    if ENABLE_WITHDRAW_TO_BALANCE:
        rows.append([InlineKeyboardButton(text=B.BTN_PAY_BALANCE, callback_data="withdraw_to_balance")])

    rows.append([InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")])

    kb = InlineKeyboardMarkup(inline_keyboard=rows)
    await edit_or_send_message(
        target_message=callback.message,
        text=text,
        reply_markup=kb,
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "withdraw_to_balance")
async def withdraw_to_balance(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    if not ENABLE_WITHDRAW_TO_BALANCE:
        await callback.answer(T.WITHDRAW_TO_BALANCE_DISABLED, show_alert=True)
        return

    await state.clear()
    tg_id = callback.from_user.id
    user = await _load_user_map(session, tg_id)
    partner_balance = float(user.get("partner_balance", 0) or 0)

    if partner_balance <= 0:
        await callback.answer(T.ALERT_ZERO_BALANCE, show_alert=True)
        return

    if ENABLE_CUSTOM_WITHDRAW_AMOUNT:
        rows = [
            [InlineKeyboardButton(text=f"{B.BTN_TRANSFER_ALL} ({partner_balance:.2f} ₽)", callback_data="withdraw_all_balance")],
            [InlineKeyboardButton(text=B.BTN_CUSTOM_AMOUNT, callback_data="custom_amount_balance")],
            [InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw")],
        ]
        
        await edit_or_send_message(
            target_message=callback.message,
            text=T.withdraw_menu_balance(partner_balance),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
            disable_web_page_preview=True,
        )
        return

    await _process_balance_withdraw(callback, session, tg_id, partner_balance)


async def _process_balance_withdraw(callback: CallbackQuery, session: AsyncSession, tg_id: int, amount: float):
    user = await _load_user_map(session, tg_id)
    partner_balance = float(user.get("partner_balance", 0) or 0)

    if amount > partner_balance:
        await callback.answer(
            T.WITHDRAW_AMOUNT_TOO_HIGH.format(balance=partner_balance, amount=amount),
            show_alert=True
        )
        return

    if amount <= 0:
        await callback.answer(T.ALERT_ZERO_BALANCE, show_alert=True)
        return

    try:
        await move_partner_to_main(session, tg_id, amount)
    except ValueError as e:
        await callback.answer(str(e), show_alert=True)
        return

    new_user = await _load_user_map(session, tg_id)
    new_main = float(new_user.get("balance", 0) or 0)
    new_partner = float(new_user.get("partner_balance", 0) or 0)

    text = T.WITHDRAW_TO_BALANCE_SUCCESS.format(
        amount=amount,
        main_balance=new_main,
        partner_balance=new_partner,
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]
    ])
    await edit_or_send_message(
        target_message=callback.message,
        text=text,
        reply_markup=kb,
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "withdraw_to_requisites")
async def withdraw_to_requisites(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    await state.clear()
    tg_id = callback.from_user.id
    user = await _load_user_map(session, tg_id)

    method = user.get("payout_method") or B.METHOD_CARD
    requisites = (user.get("card_number") or "").strip()
    balance = float(user.get("partner_balance", 0) or 0)

    if balance <= 0:
        await callback.answer(T.ALERT_ZERO_BALANCE, show_alert=True)
        await edit_or_send_message(
            target_message=callback.message,
            text=T.ZERO_BALANCE_SCREEN,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]]
            ),
            disable_web_page_preview=True,
        )
        return

    if balance < MIN_PARTNER_PAYOUT:
        await callback.answer(T.alert_min_payout(), show_alert=True)
        return

    if not requisites:
        await callback.answer(T.ALERT_NO_REQUISITES, show_alert=True)
        return

    if ENABLE_CUSTOM_WITHDRAW_AMOUNT:
        rows = [
            [InlineKeyboardButton(text=f"{B.BTN_WITHDRAW_ALL} ({balance:.2f} ₽)", callback_data="withdraw_all_requisites")],
            [InlineKeyboardButton(text=B.BTN_CUSTOM_AMOUNT, callback_data="custom_amount_requisites")],
            [InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw")],
        ]
        
        await edit_or_send_message(
            target_message=callback.message,
            text=T.withdraw_menu_requisites(balance),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
            disable_web_page_preview=True,
        )
        return

    await _process_requisites_withdraw(callback, session, tg_id, balance)


async def _process_requisites_withdraw(callback: CallbackQuery, session: AsyncSession, tg_id: int, amount: float):
    from handlers.admin.panel.keyboard import AdminPanelCallback

    user = await _load_user_map(session, tg_id)
    method = user.get("payout_method") or B.METHOD_CARD
    requisites = (user.get("card_number") or "").strip()
    balance = float(user.get("partner_balance", 0) or 0)

    if amount > balance:
        await callback.answer(
            T.WITHDRAW_AMOUNT_TOO_HIGH.format(balance=balance, amount=amount),
            show_alert=True
        )
        return

    if amount < MIN_PARTNER_PAYOUT:
        await callback.answer(T.alert_min_payout(), show_alert=True)
        return

    fee_rate = float(PARTNER_PAYOUT_FEE_RATE or 0.0)
    fee = round(amount * fee_rate, 2) if fee_rate > 0 else 0.0
    net_amount = amount - fee

    if net_amount <= 0:
        await callback.answer("Сумма к выплате после комиссии равна 0. Увеличьте сумму.", show_alert=True)
        return

    result = await session.execute(
        sql_text("""
            UPDATE users 
            SET partner_balance = partner_balance - :amount 
            WHERE tg_id = :tg_id AND partner_balance >= :amount
        """),
        {"amount": amount, "tg_id": tg_id}
    )
    
    if result.rowcount == 0:
        await callback.answer("Недостаточно средств. Попробуйте снова.", show_alert=True)
        return

    payout = PayoutRequest(tg_id=tg_id, amount=net_amount)
    session.add(payout)
    await session.commit()

    await edit_or_send_message(
        target_message=callback.message,
        text=T.withdraw_created_caption(amount, method, requisites, net_amount, fee),
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK_TO_PARTNER, callback_data="partner")]]
        ),
        disable_web_page_preview=True,
    )

    for admin_id in ADMIN_ID if isinstance(ADMIN_ID, list) else [ADMIN_ID]:
        try:
            await callback.bot.send_message(
                chat_id=admin_id,
                text=T.admin_withdraw_notification(tg_id, amount, method, requisites, net_amount, fee),
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[
                        [InlineKeyboardButton(
                            text=B.BTN_ADMIN_PARTNER,
                            callback_data=AdminPanelCallback(action="partner").pack(),
                        )]
                    ]
                ),
            )
        except Exception as e:
            logger.exception(f"[Partner] Не удалось отправить уведомление админу {admin_id}: {e}")


@router.callback_query(F.data == "custom_amount_requisites")
async def custom_amount_requisites(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    tg_id = callback.from_user.id
    user = await _load_user_map(session, tg_id)
    balance = float(user.get("partner_balance", 0) or 0)

    if balance <= 0:
        await callback.answer(T.ALERT_ZERO_BALANCE, show_alert=True)
        return

    if balance < MIN_PARTNER_PAYOUT:
        await callback.answer(T.alert_min_payout(), show_alert=True)
        return

    await state.set_state(PartnerStates.waiting_for_withdraw_amount)
    
    rows = [
        [InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw_to_requisites")],
    ]
    
    await edit_or_send_message(
        target_message=callback.message,
        text=T.withdraw_amount_prompt_requisites(balance, MIN_PARTNER_PAYOUT),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "custom_amount_balance")
async def custom_amount_balance(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    tg_id = callback.from_user.id
    user = await _load_user_map(session, tg_id)
    balance = float(user.get("partner_balance", 0) or 0)

    if balance <= 0:
        await callback.answer(T.ALERT_ZERO_BALANCE, show_alert=True)
        return

    await state.set_state(PartnerStates.waiting_for_balance_amount)
    
    rows = [
        [InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw_to_balance")],
    ]
    
    await edit_or_send_message(
        target_message=callback.message,
        text=T.withdraw_amount_prompt_balance(balance),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        disable_web_page_preview=True,
    )


@router.message(PartnerStates.waiting_for_withdraw_amount)
async def process_withdraw_amount_requisites(message: Message, state: FSMContext, session: AsyncSession):
    text = (message.text or "").strip().replace(",", ".").replace(" ", "")
    
    try:
        amount = float(text)
        if amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        await state.clear()
        await edit_or_send_message(
            target_message=message,
            text=T.WITHDRAW_AMOUNT_INVALID,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw_to_requisites")]]
            ),
            disable_web_page_preview=True,
        )
        return

    tg_id = message.from_user.id
    user = await _load_user_map(session, tg_id)
    balance = float(user.get("partner_balance", 0) or 0)
    method = user.get("payout_method") or B.METHOD_CARD
    requisites = (user.get("card_number") or "").strip()

    if amount > balance:
        await state.clear()
        await edit_or_send_message(
            target_message=message,
            text=T.WITHDRAW_AMOUNT_TOO_HIGH.format(balance=balance, amount=amount),
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw_to_requisites")]]
            ),
            disable_web_page_preview=True,
        )
        return

    if amount < MIN_PARTNER_PAYOUT:
        await state.clear()
        await edit_or_send_message(
            target_message=message,
            text=T.WITHDRAW_AMOUNT_TOO_LOW.format(min_payout=MIN_PARTNER_PAYOUT),
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw_to_requisites")]]
            ),
            disable_web_page_preview=True,
        )
        return

    await state.update_data(withdraw_amount=amount)
    
    fee_rate = float(PARTNER_PAYOUT_FEE_RATE or 0.0)
    fee = round(amount * fee_rate, 2) if fee_rate > 0 else 0.0
    net_amount = amount - fee
    
    requisites_masked = mask_requisites(method, requisites)
    
    rows = [
        [InlineKeyboardButton(text=B.BTN_CONFIRM_WITHDRAW, callback_data="confirm_withdraw_requisites")],
        [InlineKeyboardButton(text=B.BTN_CHANGE_AMOUNT, callback_data="custom_amount_requisites")],
        [InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="partner")],
    ]
    
    await edit_or_send_message(
        target_message=message,
        text=T.withdraw_confirm_requisites(amount, method, requisites_masked, fee, net_amount),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        disable_web_page_preview=True,
    )


@router.message(PartnerStates.waiting_for_balance_amount)
async def process_withdraw_amount_balance(message: Message, state: FSMContext, session: AsyncSession):
    text = (message.text or "").strip().replace(",", ".").replace(" ", "")
    
    try:
        amount = float(text)
        if amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        await state.clear()
        await edit_or_send_message(
            target_message=message,
            text=T.WITHDRAW_AMOUNT_INVALID,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw_to_balance")]]
            ),
            disable_web_page_preview=True,
        )
        return

    tg_id = message.from_user.id
    user = await _load_user_map(session, tg_id)
    balance = float(user.get("partner_balance", 0) or 0)

    if amount > balance:
        await state.clear()
        await edit_or_send_message(
            target_message=message,
            text=T.WITHDRAW_AMOUNT_TOO_HIGH.format(balance=balance, amount=amount),
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=B.BTN_BACK, callback_data="withdraw_to_balance")]]
            ),
            disable_web_page_preview=True,
        )
        return

    await state.update_data(withdraw_amount=amount)
    
    rows = [
        [InlineKeyboardButton(text=B.BTN_CONFIRM_WITHDRAW, callback_data="confirm_withdraw_balance")],
        [InlineKeyboardButton(text=B.BTN_CHANGE_AMOUNT, callback_data="custom_amount_balance")],
        [InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="partner")],
    ]
    
    await edit_or_send_message(
        target_message=message,
        text=T.withdraw_confirm_balance(amount),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "withdraw_all_requisites")
async def withdraw_all_requisites(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    await state.clear()
    tg_id = callback.from_user.id
    user = await _load_user_map(session, tg_id)
    balance = float(user.get("partner_balance", 0) or 0)
    method = user.get("payout_method") or B.METHOD_CARD
    requisites = (user.get("card_number") or "").strip()

    if balance <= 0:
        await callback.answer(T.ALERT_ZERO_BALANCE, show_alert=True)
        return

    if balance < MIN_PARTNER_PAYOUT:
        await callback.answer(T.alert_min_payout(), show_alert=True)
        return

    await state.update_data(withdraw_amount=balance)
    
    fee_rate = float(PARTNER_PAYOUT_FEE_RATE or 0.0)
    fee = round(balance * fee_rate, 2) if fee_rate > 0 else 0.0
    net_amount = balance - fee
    
    requisites_masked = mask_requisites(method, requisites)
    
    rows = [
        [InlineKeyboardButton(text=B.BTN_CONFIRM_WITHDRAW, callback_data="confirm_withdraw_requisites")],
        [InlineKeyboardButton(text=B.BTN_CHANGE_AMOUNT, callback_data="custom_amount_requisites")],
        [InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="partner")],
    ]
    
    await edit_or_send_message(
        target_message=callback.message,
        text=T.withdraw_confirm_requisites(balance, method, requisites_masked, fee, net_amount),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "withdraw_all_balance")
async def withdraw_all_balance(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    await state.clear()
    tg_id = callback.from_user.id
    user = await _load_user_map(session, tg_id)
    balance = float(user.get("partner_balance", 0) or 0)

    if balance <= 0:
        await callback.answer(T.ALERT_ZERO_BALANCE, show_alert=True)
        return

    await state.update_data(withdraw_amount=balance)
    
    rows = [
        [InlineKeyboardButton(text=B.BTN_CONFIRM_WITHDRAW, callback_data="confirm_withdraw_balance")],
        [InlineKeyboardButton(text=B.BTN_CHANGE_AMOUNT, callback_data="custom_amount_balance")],
        [InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="partner")],
    ]
    
    await edit_or_send_message(
        target_message=callback.message,
        text=T.withdraw_confirm_balance(balance),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        disable_web_page_preview=True,
    )


@router.callback_query(F.data == "confirm_withdraw_requisites")
async def confirm_withdraw_requisites(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    data = await state.get_data()
    amount = data.get("withdraw_amount")
    
    if not amount:
        await callback.answer("Ошибка: сумма не найдена. Начните заново.", show_alert=True)
        await state.clear()
        return

    tg_id = callback.from_user.id
    await state.clear()
    await _process_requisites_withdraw(callback, session, tg_id, amount)


@router.callback_query(F.data == "confirm_withdraw_balance")
async def confirm_withdraw_balance(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    data = await state.get_data()
    amount = data.get("withdraw_amount")
    
    if not amount:
        await callback.answer("Ошибка: сумма не найдена. Начните заново.", show_alert=True)
        await state.clear()
        return

    tg_id = callback.from_user.id
    await state.clear()
    await _process_balance_withdraw(callback, session, tg_id, amount)


async def handle_partner_link(partner_identifier: int | str, message: Message, session: AsyncSession, by_code: bool = False):
    from ..models import ExtendedUser
    
    user_id = message.chat.id

    if by_code:
        partner_user = await session.scalar(
            select(ExtendedUser).where(ExtendedUser.partner_code == partner_identifier)
        )
        if not partner_user:
            try:
                partner_id = int(partner_identifier)
                partner_user = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == partner_id))
            except (ValueError, TypeError):
                pass
        
        if not partner_user:
            return
        
        partner_id = partner_user.tg_id
    else:
        partner_id = int(partner_identifier)
    
    if user_id == partner_id:
        await message.answer(T.SELF_LINK)
        return
    user_exists = await session.scalar(select(exists().where(User.tg_id == user_id)))
    if user_exists:
        await message.answer(T.ALREADY_REGISTERED)
        return
    already_joined = await session.scalar(select(exists().where(Partner.joined_tg_id == user_id)))
    if already_joined:
        await message.answer(T.ALREADY_PARTICIPATED)
        return
    session.add(Partner(partner_tg_id=partner_id, joined_tg_id=user_id))
    await session.commit()
    await message.answer(T.JOINED_SUCCESS)


@router.callback_query(F.data == "partner_change_code")
async def handle_change_code_request(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    from ..models import ExtendedUser
    
    tg_id = callback.from_user.id

    user = await session.scalar(
        select(ExtendedUser).where(ExtendedUser.tg_id == tg_id)
    )
    
    if not user:
        await callback.answer("Ошибка: пользователь не найден.", show_alert=True)
        return
    
    await state.set_state(PartnerStates.confirming_code_change)
    await state.update_data(tg_id=tg_id)
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Да, сменить", callback_data="partner_change_code_confirm")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="partner")],
    ])
    
    await callback.answer()
    await edit_or_send_message(
        target_message=callback.message,
        text=T.CHANGE_CODE_WARNING,
        reply_markup=kb,
    )


@router.callback_query(F.data == "partner_change_code_confirm")
async def handle_change_code_confirm(callback: CallbackQuery, session: AsyncSession, state: FSMContext):
    tg_id = callback.from_user.id

    if ENABLE_PARTNER_CUSTOM_CODE_INPUT:
        await state.set_state(PartnerStates.waiting_for_partner_code)
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
            inline_keyboard=[[InlineKeyboardButton(text=B.BTN_CANCEL, callback_data="partner")]]
        )

        await callback.answer()
        await edit_or_send_message(
            target_message=callback.message,
            text=text,
            reply_markup=kb,
            disable_web_page_preview=True,
        )
        return

    try:
        partner_code = await generate_unique_partner_code(session)
        result = await session.execute(
            sql_text("UPDATE users SET partner_code = :code WHERE tg_id = :tg_id AND partner_code IS NULL"),
            {"code": partner_code, "tg_id": tg_id},
        )
        await session.commit()

        if result.rowcount == 0:
            await callback.answer("Код уже был установлен.", show_alert=True)
        else:
            await callback.answer("✅ Код успешно сгенерирован!")

        await state.clear()
        bot_user = await callback.bot.get_me()
        await show_partner_menu(callback.message, tg_id, bot_user.username, session)
    except Exception as e:
        logger.error(f"[Partner] Ошибка при генерации partner_code для {tg_id}: {e}", exc_info=True)
        await callback.answer("❌ Произошла ошибка. Попробуйте позже.", show_alert=True)
        await state.clear()


@router.message(PartnerStates.waiting_for_partner_code)
async def process_partner_code_input(message: Message, state: FSMContext, session: AsyncSession):
    raw = (message.text or "").strip()
    code = raw.lower()

    data = await state.get_data()
    tg_id = data.get("tg_id")

    if not tg_id:
        await state.clear()
        await edit_or_send_message(
            target_message=message,
            text="Не удалось определить контекст. Откройте партнёрку заново.",
            disable_web_page_preview=True,
        )
        return

    if code in {"отмена", "/cancel", "cancel"}:
        await state.clear()
        bot_user = await message.bot.get_me()
        await show_partner_menu(message, tg_id, bot_user.username, session)
        try:
            await message.delete()
        except Exception:
            pass
        return

    if not re.fullmatch(r"[a-z0-9_]{3,32}", code or ""):
        await edit_or_send_message(
            target_message=message,
            text="❌ Неверный код. Разрешены: латинские буквы, цифры и _. Длина 3–32.",
            disable_web_page_preview=True,
        )
        return

    exists_code = await session.scalar(
        select(func.count()).select_from(sql_text("users")).where(
            sql_text("partner_code = :code AND tg_id != :tg_id")
        ),
        {"code": code, "tg_id": tg_id},
    )
    if (exists_code or 0) > 0:
        await edit_or_send_message(
            target_message=message,
            text="❌ Такой код уже занят. Выберите другой.",
            disable_web_page_preview=True,
        )
        return

    await session.execute(
        sql_text("UPDATE users SET partner_code = :code WHERE tg_id = :tg_id"),
        {"code": code, "tg_id": tg_id},
    )
    await session.commit()
    await state.clear()

    bot_user = await message.bot.get_me()
    await show_partner_menu(message, tg_id, bot_user.username, session)

    try:
        await message.delete()
    except Exception:
        pass
