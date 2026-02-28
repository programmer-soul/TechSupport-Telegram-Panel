from . import buttons as B
from .handlers.utils import method_label
from .settings import MIN_PARTNER_PAYOUT

PARTNER_TITLE = "<b>👥 Партнёрская программа</b>"

PARTNER_INTRO = (
    "💼 <b>Зарабатывай на рекомендациях</b>\n"
    "<blockquote>"
    "1) Приглашай друзей по своей <b>уникальной ссылке</b> и получай {reward_line}.\n"
    "2) Доход начисляется автоматически — выводи средства удобным способом.\n\n"
    "📄 <a href=\"https://telegra.ph/Pravila-partnyorskoj-programmy-02-13\">Правила партнёрской программы</a>"
    "</blockquote>"
)

PARTNER_LINK_LABEL = (
    "<b>🔗 Твоя партнёрская ссылка:</b>\n"
    "<code>{referral_link}</code>"
)

PARTNER_STATS_TITLE = "<b>📊 Твоя статистика</b>"

PARTNER_STATS_BLOCK = (
    "<blockquote>"
    "👤 Приглашено: <b>{invited_count}</b>\n"
    "💰 Баланс: <b>{partner_balance:.2f} ₽</b>\n"
    "🏦 Способ вывода: <b>{method_text}</b>\n"
    "🧾 Реквизиты: <b>{req_text}</b>"
    "</blockquote>"
)

PARTNER_WITHDRAW_NOTE = (
    "💸 <i>Минимальная сумма для вывода — {min_payout} ₽</i>"
)

REWARD_LINE_PERCENT = (
    "<b>{percent}%</b> с <b>каждого пополнения</b>"
)

REWARD_LINE_FLAT = (
    "<b>{flat} ₽</b> за <b>первый платёж приглашённого</b>"
)

REWARD_LINE_BOTH = (
    "<b>{percent}%</b> с пополнений + <b>{flat} ₽</b> бонусом"
)

RATE_SINGLE_TITLE = (
    "<b>📈 Текущая ставка: {rate_text}</b>"
)

RATE_SINGLE_EXAMPLE = (
    "<blockquote>"
    "<b>Пример:</b> платёж {example_amount} ₽ → твой доход <b>{earned} ₽</b>"
    "</blockquote>"
)

LEVELS_TITLE_PERCENT = "<b>📈 Ставки по уровням:</b>"
LEVELS_TITLE_FLAT = "<b>🎁 Единовременные бонусы по уровням:</b>"
LEVELS_TITLE_BOTH = "<b>📈 Бонусы по уровням:</b>"
LEVEL_LINE_PERCENT = "Уровень {lvl}: <b>{percent}%</b> <i>(пример: {earned}₽)</i>"
LEVEL_LINE_FLAT = "Уровень {lvl}: <b>{flat}₽</b> за первый платёж"
LEVEL_LINE_BOTH = "Уровень {lvl}: <b>{parts}</b> <i>(пример: {earned}₽)</i>"

PARTNER_SHARE_TEXT = (
    "Привет. Подключись к VPN по моей ссылке:\n\n{link}\n\n"
    "Работает быстро и стабильно."
)
PARTNER_INLINE_TITLE = "🤝 Приглашение"
PARTNER_INLINE_DESCRIPTION = "Друг, перешедший по этой кнопке станет вашим рефералом."

NOT_CONFIGURED = "<i>Бонус не настроен.</i>"
DASH = "—"

def ask_requisites_caption(method: str) -> str:
    if method == B.METHOD_CARD:
        return (
            "<b>💳 Введите номер вашей российской банковской карты</b>\n\n"
            "⚠️ Это должен быть номер из 16 цифр, начинающийся с 2, 4, 5 или 6.\n"
            "Пример: <code>5469000012345678</code>\n\n"
            "⛔ Любой другой формат не принимается."
        )
    if method == B.METHOD_USDT:
        return (
            "<b>🪙 Введите адрес кошелька USDT (TRC20)</b>\n\n"
            "Пример: <code>TJ3C4...Gf9x1</code>\n"
            "⛔ Убедитесь, что сеть именно TRC20."
        )
    if method == B.METHOD_TON:
        return "<b>💎 Введите адрес TON</b>\n\nПример: <code>UQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>"
    if method == B.METHOD_SBP:
        return (
            "<b>🏦 Введите данные для перевода по СБП</b>\n\n"
            "Нужно указать <b>номер телефона и банк</b> в одной строке.\n"
            "Формат: <code>+79991234567, Тинькофф</code>\n"
            "или: <code>Сбербанк +79991234567</code>"
        )
    return "<b>Введите реквизиты для вывода</b>"


CARD_INVALID = "❌ Неверные реквизиты. Проверьте формат и попробуйте снова."
CARD_SAVED = "✅ Реквизиты сохранены. Теперь вы можете запросить вывод средств."
ALERT_NO_REQUISITES = "🧾 Сначала укажите реквизиты для выбранного способа"

def alert_min_payout(min_amount: float | None = None) -> str:
    return f"❌ Минимальная сумма вывода — {MIN_PARTNER_PAYOUT if min_amount is None else min_amount}₽"

def withdraw_created_caption(
    balance: float,
    method: str,
    requisites: str,
    net_amount: float | None = None,
    fee_amount: float | None = None,
) -> str:
    gross = round(balance, 2)
    base = (
        f"✅ Заявка на вывод <b>{gross} ₽</b> создана.\n"
        f"🏦 Способ: <b>{method_label(method)}</b>\n"
        f"🧾 На: <code>{requisites}</code>\n"
    )
    if net_amount is not None and fee_amount is not None and fee_amount > 0:
        net = round(net_amount, 2)
        fee = round(fee_amount, 2)
        base += f"💸 К выплате: <b>{net} ₽</b>\n💼 Комиссия: <b>{fee} ₽</b>\n\n"
    else:
        base += "\n"
    return base + "⏳ Ожидайте подтверждения от администратора."


def admin_withdraw_notification(
    tg_id: int,
    balance: float,
    method: str,
    requisites: str,
    net_amount: float | None = None,
    fee_amount: float | None = None,
) -> str:
    gross = round(balance, 2)
    base = (
        "📤 <b>Новая заявка на вывод</b>\n\n"
        f"👤 Пользователь: <code>{tg_id}</code>\n"
        f"💰 Сумма (баланс): <b>{gross} ₽</b>\n"
        f"🏦 Способ: <b>{method_label(method)}</b>\n"
        f"🧾 Реквизиты: <code>{requisites}</code>\n"
    )
    if net_amount is not None and fee_amount is not None and fee_amount > 0:
        net = round(net_amount, 2)
        fee = round(fee_amount, 2)
        base += f"💸 К выплате: <b>{net} ₽</b>\n💼 Комиссия: <b>{fee} ₽</b>\n"
    return base

ASK_METHODS_DISABLED = "Сейчас способы вывода временно недоступны. Попробуйте позже."

def ask_method_caption(current_method: str) -> str:
    return (
        f"Выберите способ вывода. Текущий: <b>{method_label(current_method)}</b>\n\n"
        f"После выбора я попрошу ввести реквизиты. "
        f"Метод применится только после успешной проверки."
    )

SELF_LINK = "❌ Нельзя использовать свою собственную партнёрскую ссылку."
ALREADY_REGISTERED = "❌ Нельзя использовать партнёрскую ссылку после регистрации."
ALREADY_PARTICIPATED = "❌ Вы уже участвовали в партнёрской программе."
JOINED_SUCCESS = "✅ Вы успешно присоединились по партнёрской ссылке."

ADMIN_NO_REQUESTS = "📭 Нет активных заявок на вывод."

def admin_request_block(r, method: str, requisites: str) -> str:
    try:
        created = r.created_at.strftime("%d.%m.%Y %H:%M")
    except Exception:
        created = "-"
    full_req = requisites or "-"
    return (
        f"📤 <b>Заявка #{r.id}</b>\n"
        f"👤 <code>{r.tg_id}</code>\n"
        f"💰 <b>{round(r.amount, 2)} ₽</b>\n"
        f"🏦 Способ: <b>{method_label(method)}</b>\n"
        f"🧾 Реквизиты: <code>{full_req}</code>\n"
        f"🕒 <i>{created}</i>"
    )

def admin_confirm_text(action: str) -> str:
    return (
        "✅ Подтвердите одобрение заявки на вывод."
        if action == "confirm_approve"
        else "❌ Подтвердите отклонение заявки на вывод."
    )

ADMIN_APPROVED_ALERT = "✅ Заявка одобрена"
ADMIN_REJECTED_ALERT = "❌ Заявка отклонена"
ADMIN_APPROVED_SCREEN = "✅ Заявка успешно одобрена."
ADMIN_REJECTED_SCREEN = "❌ Заявка была отклонена."

def user_payout_approved(amount: float) -> str:
    return (
        f"✅ Ваша заявка на вывод <b>{round(amount, 2)} ₽</b> одобрена.\n"
        f"💳 Средства будут зачислены на указанные реквизиты."
    )

def user_payout_rejected(amount: float) -> str:
    return (
        f"❌ Ваша заявка на вывод <b>{round(amount, 2)} ₽</b> была отклонена.\n"
        f"💰 Сумма возвращена на партнёрский баланс."
    )

ALERT_ZERO_BALANCE = "На вашем партнёрском балансе 0 ₽ — выводить нечего."
ZERO_BALANCE_SCREEN = (
    "ℹ️ На вашем партнёрском балансе 0 ₽ — пока выводить нечего.\n"
    "Приглашайте друзей по партнёрской ссылке — бонусы будут копиться здесь."
)

CHANGE_CODE_WARNING = (
    "⚠️ <b>Внимание! Смена кода партнёрской ссылки</b>\n\n"
    "Вы получите новую ссылку с уникальным кодом (например: <code>partner_abc12345</code>).\n"
    "Старая ссылка продолжит работать.\n\n"
    "Обе ссылки будут активны и засчитывать партнеров.\n\n"
    "Вы уверены, что хотите сгенерировать новый код?"
)

WITHDRAW_TO_BALANCE_SUCCESS = (
    "✅ <b>Перевод выполнен</b>\n\n"
    "🔁 Переведено: <b>{amount:.2f} ₽</b>\n"
    "💰 Основной баланс: <b>{main_balance:.2f} ₽</b>\n"
    "🤝 Партнёрский баланс: <b>{partner_balance:.2f} ₽</b>"
)
