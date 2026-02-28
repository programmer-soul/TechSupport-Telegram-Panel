# Порог вывода (₽)
MIN_PARTNER_PAYOUT = 300

# Обход порога вывода при переводе в баланс бота
# Если True, то вывод в баланс бота возможен без ограничения MIN_PARTNER_PAYOUT
# Вывод на реквизиты (карты, кошельки) всегда требует соблюдения лимита
SKIP_PAYOUT_LIMIT_FOR_BALANCE = False
# Способы вывода
ENABLE_PAYOUT_CARD = True  # вывод на российскую карту
ENABLE_PAYOUT_USDT = True   # вывод USDT TRC20
ENABLE_PAYOUT_TON = False   # вывод TON
ENABLE_PAYOUT_SBP = True   # вывод по СБП
# Перевод партнёрских средств в основной баланс бота
ENABLE_WITHDRAW_TO_BALANCE = False
# Включить ручной ввод смены ссылки для клиента
ENABLE_PARTNER_CUSTOM_CODE_INPUT = True
# Режим ввода суммы вывода
# True = пользователь вводит сумму вручную
# False = выводится весь баланс (текущее поведение)
ENABLE_CUSTOM_WITHDRAW_AMOUNT = False
# Пагинация заявок (шт. на страницу)
PAGE_SIZE = 3

# Режим вознаграждений:
# "percent_only"      — процент с каждого пополнения приглашённых
# "flat_only"         — фиксированная сумма один раз за первый платёж приглашённого
# "flat_plus_percent" — фиксированная сумма за первый платёж + процент с пополнений
REFERRAL_REWARD_MODE = "percent_only"

# Бонусы по уровням — проценты (в долях: 0.3 = 30%)
PARTNER_BONUS_PERCENTAGES = {
    1: 0.3,
}

# Бонусы по уровням — фиксированные выплаты (₽)
PARTNER_FLAT_BONUSES = {
    1: 150.0,
}

QR_CODE = True  # Генерировать QR-код для партнёрской ссылки
# Комиссия на вывод партнёрских средств (в долях: 0.05 = 5%)
PARTNER_PAYOUT_FEE_RATE = 0.05

## Вы можете создать картинку partner.jpg в папке img бота и она будет использоваться в меню партнёрской программы.
