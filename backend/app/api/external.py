import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.external.remnawave import RemnawaveClient
from app.external.solobot import SolobotClient
from app.schemas.external import ExternalProfile
from app.models.setting import Setting

router = APIRouter(prefix="/external", tags=["external"])


@router.get("/solobot/profile/{tg_id}", response_model=ExternalProfile)
async def solobot_profile(tg_id: int, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> ExternalProfile:
    solobot_cfg = None
    remnawave_cfg = None
    result = await db.execute(select(Setting).where(Setting.key.in_(["solobot_integration", "remnawave_integration"])))
    for setting in result.scalars().all():
        if setting.key == "solobot_integration":
            solobot_cfg = setting.value_json
        if setting.key == "remnawave_integration":
            remnawave_cfg = setting.value_json

    solobot_base = solobot_cfg.get("api_url") if isinstance(solobot_cfg, dict) else None
    solobot_token = solobot_cfg.get("api_key") if isinstance(solobot_cfg, dict) else None
    rem_base = remnawave_cfg.get("panel_url") if isinstance(remnawave_cfg, dict) else None
    rem_token = remnawave_cfg.get("api_token") if isinstance(remnawave_cfg, dict) else None

    solobot_admin_tg_id = solobot_cfg.get("admin_tg_id") if isinstance(solobot_cfg, dict) else None
    if isinstance(solobot_admin_tg_id, str) and solobot_admin_tg_id.isdigit():
        solobot_admin_tg_id = int(solobot_admin_tg_id)
    solobot_tls_verify = solobot_cfg.get("tls_verify", True) if isinstance(solobot_cfg, dict) else True
    
    if not solobot_base:
        raise HTTPException(status_code=503, detail="Solobot integration not configured")
    
    solobot = SolobotClient(
        base_url=solobot_base,
        token=solobot_token,
        admin_tg_id=solobot_admin_tg_id,
        tls_verify=solobot_tls_verify,
    )
    
    if not rem_base:
        raise HTTPException(status_code=503, detail="Remnawave integration not configured")
    
    remnawave = RemnawaveClient(
        base_url=rem_base,
        token=rem_token,
    )

    user_task = solobot.get_user(tg_id)
    keys_task = solobot.get_all_keys(tg_id)
    payments_task = solobot.get_payments(tg_id)
    tariffs_task = solobot.get_tariffs(tg_id)
    referrals_task = solobot.get_referrals(tg_id)
    rem_task = remnawave.get_user_by_telegram(tg_id)

    user, keys, payments, tariffs, referrals, rem = await asyncio.gather(
        user_task, keys_task, payments_task, tariffs_task, referrals_task, rem_task
    )

    enriched_referrals = referrals
    if isinstance(referrals, list) and referrals:
        unique_ids: list[int] = []
        for ref in referrals:
            if isinstance(ref, dict):
                value = ref.get("referred_tg_id")
                if isinstance(value, int) and value not in unique_ids:
                    unique_ids.append(value)
        unique_ids = unique_ids[:50]

        async def _fetch_ref_user(tg_id_value: int):
            return tg_id_value, await solobot.get_user(tg_id_value)

        if unique_ids:
            results = await asyncio.gather(*[_fetch_ref_user(tg) for tg in unique_ids])
            user_map = {tg: data for tg, data in results if data is not None}
            enriched_referrals = []
            for ref in referrals:
                if not isinstance(ref, dict):
                    enriched_referrals.append(ref)
                    continue
                ref_user = user_map.get(ref.get("referred_tg_id"))
                enriched_referrals.append({**ref, "user": ref_user})

    # Normalize Remnawave response shape {response: [...]} -> first item
    rem_users: list[dict] = []
    if isinstance(rem, dict) and isinstance(rem.get("response"), list):
        rem_users = [u for u in rem.get("response") if isinstance(u, dict)]
    elif isinstance(rem, dict):
        rem_users = [rem]

    async def _fetch_devices(user_item: dict) -> list[dict]:
        user_uuid = user_item.get("uuid") or user_item.get("id")
        if not user_uuid:
            return []
        raw = await remnawave.get_hwid_devices(str(user_uuid))
        if not isinstance(raw, dict):
            return []
        devices = raw.get("devices") or raw.get("data") or raw.get("items")
        if not devices:
            devices = raw.get("response", {}).get("devices")
        if not isinstance(devices, list):
            return []
        result = []
        for d in devices:
            if not isinstance(d, dict):
                continue
            enriched = {
                **d,
                "subscription_uuid": user_item.get("uuid"),
                "subscription_username": user_item.get("username"),
                "subscription_status": user_item.get("status"),
            }
            result.append(enriched)
        return result

    devices: list[dict] | None = None
    if rem_users:
        all_devices = await asyncio.gather(*[_fetch_devices(u) for u in rem_users])
        devices = [d for group in all_devices for d in group]

    return ExternalProfile(
        user=user,
        keys=keys,
        payments=payments,
        ban_status=None,
        tariffs=tariffs,
        referrals=enriched_referrals,
        remnawave=rem_users,
        remnawave_devices=devices,
    )


@router.post("/remnawave/devices/delete")
async def delete_hwid_device(payload: dict, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict:
    remnawave_cfg = None
    result = await db.execute(select(Setting).where(Setting.key == "remnawave_integration"))
    setting = result.scalar_one_or_none()
    if setting:
        remnawave_cfg = setting.value_json

    rem_base = remnawave_cfg.get("panel_url") if isinstance(remnawave_cfg, dict) else None
    rem_token = remnawave_cfg.get("api_token") if isinstance(remnawave_cfg, dict) else None
    remnawave = RemnawaveClient(
        base_url=rem_base or None,
        token=rem_token or None,
    )

    user_uuid = payload.get("userUuid")
    hwid = payload.get("hwid")
    if not user_uuid or not hwid:
        raise HTTPException(status_code=400, detail="Missing userUuid or hwid")
    result = await remnawave.delete_hwid_device(str(user_uuid), str(hwid))
    return {"ok": True, "result": result}
