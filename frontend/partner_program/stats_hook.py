from __future__ import annotations

from datetime import datetime
from typing import Optional

import pytz
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Partner, PayoutRequest, ExtendedUser

PAYOUT_STATUS_PENDING = "pending"
PAYOUT_STATUS_PAID = "approved" 


async def partner_admin_stats_block(*, session: AsyncSession, now: datetime, **_) -> Optional[str]:
    """
    Возвращает текстовый блок для admin_stats с метриками партнёрки.
    Если что-то падает/нет таблиц — вернёт None, чтобы не ломать общий экран.
    """
    try:
        moscow_tz = pytz.timezone("Europe/Moscow")
        if now.tzinfo is None:
            now = moscow_tz.localize(now)

        month_start_msk = moscow_tz.localize(datetime(now.year, now.month, 1, 0, 0, 0))
        month_start_utc = month_start_msk.astimezone(pytz.UTC).replace(tzinfo=None)
        today_start_msk = moscow_tz.localize(datetime(now.year, now.month, now.day, 0, 0, 0))
        today_start_utc = today_start_msk.astimezone(pytz.UTC).replace(tzinfo=None)

        total_referrals = await session.scalar(select(func.count()).select_from(Partner)) or 0

        total_partners_with_refs = await session.scalar(
            select(func.count(distinct(Partner.partner_tg_id)))
        ) or 0

        total_partner_balance = await session.scalar(
            select(func.coalesce(func.sum(ExtendedUser.partner_balance), 0.0))
        ) or 0.0

        result = await session.execute(
            select(
                func.count().label("cnt"),
                func.coalesce(func.sum(PayoutRequest.amount), 0.0).label("sum"),
            ).where(PayoutRequest.status == PAYOUT_STATUS_PENDING)
        )
        row = result.first()
        pending_cnt_val = int(row.cnt) if row and row.cnt is not None else 0
        pending_sum_val = float(row.sum) if row and row.sum is not None else 0.0

        month_paid_sum = await session.scalar(
            select(func.coalesce(func.sum(PayoutRequest.amount), 0.0)).where(
                PayoutRequest.status == PAYOUT_STATUS_PAID,
                PayoutRequest.created_at >= month_start_utc,
            )
        ) or 0.0

        today_paid_sum = await session.scalar(
            select(func.coalesce(func.sum(PayoutRequest.amount), 0.0)).where(
                PayoutRequest.status == PAYOUT_STATUS_PAID,
                PayoutRequest.created_at >= today_start_utc,
            )
        ) or 0.0

        top_partner_row = await session.execute(
            select(
                Partner.partner_tg_id.label("pid"),
                func.count().label("cnt"),
            )
            .group_by(Partner.partner_tg_id)
            .order_by(func.count().desc())
            .limit(1)
        )
        top = top_partner_row.first()
        if top:
            top_line = f"├ 🏆 Топ партнёр: <b>{top.pid}</b> — <b>{top.cnt}</b> рефералов\n"
        else:
            top_line = ""

        text = (
            "🤝 <b>Партнёрская программа</b>\n"
            "<blockquote>"
            f"├ 👥 Партнёров с рефералами: <b>{total_partners_with_refs}</b>\n"
            f"├ 👥 Всего привлечено: <b>{total_referrals}</b>\n"
            f"├ 💼 Суммарный партнёрский баланс: <b>{round(float(total_partner_balance), 2)} ₽</b>\n"
            f"├ ⏳ Выводов в ожидании: <b>{pending_cnt_val}</b> на <b>{round(float(pending_sum_val), 2)} ₽</b>\n"
            f"├ 💸 Выплачено сегодня: <b>{round(float(today_paid_sum), 2)} ₽</b>\n"
            f"└ 📆 Выплачено за месяц: <b>{round(float(month_paid_sum), 2)} ₽</b>\n"
            f"{top_line}"
            "</blockquote>"
        )

        return text

    except Exception:
        return None
