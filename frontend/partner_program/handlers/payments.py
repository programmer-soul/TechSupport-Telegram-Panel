from sqlalchemy import select, text as sql_text, func

from logger import logger
from ..models import Partner, ExtendedUser
from ..settings import REFERRAL_REWARD_MODE, PARTNER_BONUS_PERCENTAGES, PARTNER_FLAT_BONUSES
from database.models import Payment


PAYMENT_SUCCESS_STATUSES = ("success", "paid")


async def handle_payment_success(user_id: int, amount: float, session, **kwargs):
    res = await session.execute(select(Partner).where(Partner.joined_tg_id == user_id))
    referral = res.scalar_one_or_none()
    if not referral:
        return

    need_first_check = REFERRAL_REWARD_MODE in {"flat_only", "flat_plus_percent"} or any(PARTNER_FLAT_BONUSES.values())
    first_payment = False
    if need_first_check:
        cnt = await session.scalar(
            select(func.count())
            .select_from(Payment)
            .where(Payment.tg_id == user_id, Payment.status.in_(PAYMENT_SUCCESS_STATUSES))
        )
        first_payment = bool(cnt and int(cnt) == 1)
        if REFERRAL_REWARD_MODE == "flat_only" and not first_payment:
            logger.info(f"[Partner] Пропуск: не первый платёж реферала {user_id}")
            return

    max_level = max((set(PARTNER_BONUS_PERCENTAGES.keys()) | set(PARTNER_FLAT_BONUSES.keys())) or {0})
    if max_level <= 0:
        return

    visited = set()
    current_joined = user_id
    payouts: list[tuple[int, float]] = []

    for level in range(1, max_level + 1):
        r = await session.execute(select(Partner).where(Partner.joined_tg_id == current_joined))
        link = r.scalar_one_or_none()
        if not link:
            break

        referrer_id = link.partner_tg_id
        if not referrer_id or referrer_id in visited:
            break
        visited.add(referrer_id)

        ref_user = await session.scalar(select(ExtendedUser).where(ExtendedUser.tg_id == referrer_id))

        if (
            ref_user
            and getattr(ref_user, "partner_percent_custom", False)
            and getattr(ref_user, "partner_percent", None) is not None
        ):
            pct = float(ref_user.partner_percent) / 100.0
            if pct > 0.0:
                bonus = round(float(amount) * pct, 2)
                if bonus > 0.0:
                    payouts.append((referrer_id, bonus))
            break

        bonus = 0.0

        if REFERRAL_REWARD_MODE in {"flat_only", "flat_plus_percent"} and first_payment:
            flat = float(PARTNER_FLAT_BONUSES.get(level, 0.0) or 0.0)
            if flat > 0.0:
                bonus += round(flat, 2)

        if REFERRAL_REWARD_MODE in {"percent_only", "flat_plus_percent"}:
            pct = float(PARTNER_BONUS_PERCENTAGES.get(level, 0.0) or 0.0)
            if pct > 0.0:
                bonus += round(float(amount) * pct, 2)

        if bonus > 0.0:
            payouts.append((referrer_id, bonus))

        current_joined = referrer_id

    if not payouts:
        return

    for referrer_id, bonus in payouts:
        await session.execute(
            sql_text("UPDATE users SET partner_balance = partner_balance + :bonus WHERE tg_id = :tg_id"),
            {"bonus": bonus, "tg_id": referrer_id},
        )

    await session.commit()
    logger.info(f"[Partner] Начислены бонусы: {payouts} за платёж от {user_id}")


async def move_partner_to_main(session, tg_id: int, amount: float) -> None:
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise ValueError("Сумма должна быть числом.")
    if amount <= 0:
        raise ValueError("Сумма должна быть больше 0.")

    result = await session.execute(
        select(ExtendedUser).where(ExtendedUser.tg_id == tg_id).with_for_update()
    )
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("Пользователь не найден.")

    partner_balance = float(user.partner_balance or 0.0)
    if partner_balance < amount:
        raise ValueError("Недостаточно средств на партнёрском балансе.")

    user.partner_balance = partner_balance - amount
    user.balance = float(getattr(user, "balance", 0.0) or 0.0) + amount

    await session.commit()
