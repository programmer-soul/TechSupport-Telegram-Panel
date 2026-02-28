from aiogram import Router
from aiogram.types import InlineKeyboardButton

from hooks.hooks import register_hook
from logger import logger

handle_partner_link = None
handle_payment_success = None
from .buttons import BTN_PARTNERS
from .stats_hook import partner_admin_stats_block


router = Router(name="partner_program")

try:
    from .handlers.user import handle_partner_link, router as user_router

    router.include_router(user_router)
except Exception as e:
    logger.error(f"[Partner] Не удалось подключить user_router: {e}")

try:
    from .handlers.admin import admin_router

    router.include_router(admin_router)
except Exception as e:
    logger.error(f"[Partner] Не удалось подключить admin_router: {e}")

try:
    from .handlers.payments import handle_payment_success
except Exception as e:
    logger.error(f"[Partner] Не удалось подключить payment hook: {e}")

logger.info("[Partner] Инициализация модуля партнёрской программы")


async def partner_profile_button(chat_id: int, admin: bool, session):
    return InlineKeyboardButton(text=BTN_PARTNERS, callback_data="partner")


def partner_admin_button(admin_role: str):
    from handlers.admin.panel.keyboard import AdminPanelCallback

    if admin_role != "superadmin":
        return None
    return InlineKeyboardButton(
        text=BTN_PARTNERS,
        callback_data=AdminPanelCallback(action="partner", page=1).pack(),
    )


async def handle_partner_start_link(message, state, session, user_data, part: str) -> bool:
    if handle_partner_link is None:
        return False

    if part.startswith("partner_"):
        partner_identifier = part.split("partner_")[1]
        
        if not partner_identifier:
            return False

        try:
            partner_id = int(partner_identifier)
            await handle_partner_link(partner_id, message, session, by_code=False)
        except ValueError:
            await handle_partner_link(partner_identifier, message, session, by_code=True)
        return True
    return False


def partner_admin_user_edit_button(tg_id: int, is_banned: bool, **kwargs):
    from handlers.admin.users.keyboard import AdminUserEditorCallback

    return InlineKeyboardButton(
        text=BTN_PARTNERS,
        callback_data=AdminUserEditorCallback(action="users_partner_percent", tg_id=tg_id).pack(),
    )


register_hook("start_link", handle_partner_start_link)
register_hook("profile_menu", partner_profile_button)
register_hook("admin_panel", partner_admin_button)
if handle_payment_success is not None:
    register_hook("payment_success", handle_payment_success)
register_hook("admin_user_edit", partner_admin_user_edit_button)
register_hook("admin_stats", partner_admin_stats_block) 
logger.info("[Partner] Хуки зарегистрированы")
