from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.setting import Setting
from app.schemas.settings import SettingOut, SettingUpsert

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/public/branding")
async def get_public_branding(db: AsyncSession = Depends(get_db)) -> dict:
    """Public endpoint for app branding (no auth required)"""
    result = await db.execute(select(Setting).where(Setting.key == "app_branding"))
    setting = result.scalar_one_or_none()
    if setting and setting.value_json:
        return {
            "name": setting.value_json.get("name", "Support Bot Console"),
            "description": setting.value_json.get("description", "Premium support console"),
            "page_title": setting.value_json.get("page_title", ""),
            "favicon_url": setting.value_json.get("favicon_url", ""),
        }
    return {"name": "Support Bot Console", "description": "Premium support console", "page_title": "", "favicon_url": ""}


@router.get("/public/telegram-oauth")
async def get_public_telegram_oauth(db: AsyncSession = Depends(get_db)) -> dict:
    """Public endpoint for Telegram OAuth settings (only enabled status, bot username and bot_id)"""
    result = await db.execute(select(Setting).where(Setting.key == "telegram_oauth"))
    setting = result.scalar_one_or_none()
    if setting and setting.value_json:
        bot_token = setting.value_json.get("bot_token", "")
        # Extract bot_id from token (format: BOT_ID:HASH)
        bot_id = bot_token.split(":")[0] if ":" in bot_token else ""
        return {
            "enabled": setting.value_json.get("enabled", False),
            "bot_username": setting.value_json.get("bot_username", ""),
            "bot_id": bot_id,
        }
    return {"enabled": False, "bot_username": "", "bot_id": ""}


@router.get("", response_model=list[SettingOut], dependencies=[Depends(require_role(UserRole.administrator))])
async def list_settings(db: AsyncSession = Depends(get_db)) -> list[Setting]:
    result = await db.execute(select(Setting))
    return list(result.scalars().all())


@router.get("/{key}", response_model=SettingOut, dependencies=[Depends(require_role(UserRole.administrator))])
async def get_setting(key: str, db: AsyncSession = Depends(get_db)) -> Setting:
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Not found")
    return setting


@router.post("", response_model=SettingOut, dependencies=[Depends(require_role(UserRole.administrator))])
async def upsert_setting(
    payload: SettingUpsert,
    db: AsyncSession = Depends(get_db),
) -> Setting:
    result = await db.execute(select(Setting).where(Setting.key == payload.key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value_json = payload.value_json
    else:
        setting = Setting(key=payload.key, value_json=payload.value_json)
        db.add(setting)
    await db.commit()
    await db.refresh(setting)
    return setting


@router.delete("/{key}", status_code=204, dependencies=[Depends(require_role(UserRole.administrator))])
async def delete_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(setting)
    await db.commit()
