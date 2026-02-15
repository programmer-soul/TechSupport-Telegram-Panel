import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.external.remnawave import RemnawaveClient
from app.external.solobot import SolobotClient
from app.schemas.external import ExternalProfile
from app.models.setting import Setting
from app.services.panel_mode import is_test_mode, TEST_CHAT_FIRST_NAME, TEST_CHAT_LAST_NAME, TEST_CHAT_USERNAME

router = APIRouter(prefix="/external", tags=["external"])


@router.get("/solobot/profile/{tg_id}", response_model=ExternalProfile)
async def solobot_profile(tg_id: int, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> ExternalProfile:
    if await is_test_mode(db):
        return ExternalProfile(
            user={
                "id": tg_id,
                "username": TEST_CHAT_USERNAME,
                "first_name": TEST_CHAT_FIRST_NAME,
                "last_name": TEST_CHAT_LAST_NAME,
                "created_at": "2024-01-01T00:00:00Z",
                "status": "active",
                "balance": 0,
            },
            keys=[
                {
                    "id": "TEST-KEY-001",
                    "name": "Test Key",
                    "status": "active",
                    "created_at": "2024-01-10T12:00:00Z",
                    "expire_at": "2026-01-01T00:00:00Z",
                }
            ],
            payments=[
                {
                    "id": "TEST-PAY-001",
                    "amount": 0,
                    "currency": "RUB",
                    "status": "paid",
                    "created_at": "2024-01-15T09:00:00Z",
                }
            ],
            ban_status={"status": "ok"},
            tariffs=[
                {
                    "id": "TEST-TARIFF-001",
                    "name": "Test Plan",
                    "status": "active",
                    "traffic": "безлимит",
                }
            ],
            referrals=[
                {
                    "referred_tg_id": 111222333,
                    "created_at": "2024-02-01T10:00:00Z",
                    "reward_issued": False,
                }
            ],
            remnawave=[{"id": "TEST-REM-001", "username": TEST_CHAT_USERNAME, "status": "active"}],
            remnawave_devices=[
                {
                    "id": "TEST-DEVICE-001",
                    "hwid": "TEST-HWID",
                    "subscription_uuid": "TEST-REM-001",
                    "subscription_username": TEST_CHAT_USERNAME,
                    "subscription_status": "active",
                }
            ],
            summary={
                "trial": 0,
                "total_payments_amount": 0,
                "total_payments_count": 1,
                "referral_count": 1,
                "source_invite": "test",
            },
        )
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
    
    remnawave = None
    if rem_base:
        remnawave = RemnawaveClient(
            base_url=rem_base,
            token=rem_token,
        )

    user_task = solobot.get_user(tg_id)
    keys_task = solobot.get_all_keys(tg_id)
    payments_task = solobot.get_payments(tg_id)
    tariffs_task = solobot.get_tariffs(tg_id)
    referrals_task = solobot.get_referrals(tg_id)
    rem_task = remnawave.get_user_by_telegram(tg_id) if remnawave else asyncio.sleep(0, result=None)

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
        if not remnawave:
            return []
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

    def _to_int(value: Any) -> int | None:
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            digits = value.strip()
            if digits.startswith("-"):
                body = digits[1:]
                return -int(body) if body.isdigit() else None
            return int(digits) if digits.isdigit() else None
        return None

    # Pull per-key Remnawave details when key has explicit client UUID
    rem_user_map: dict[str, dict] = {}
    if rem_users:
        for rem_user in rem_users:
            if not isinstance(rem_user, dict):
                continue
            for key_name in ("uuid", "id", "email", "username"):
                key_value = rem_user.get(key_name)
                if key_value:
                    rem_user_map[str(key_value)] = rem_user

    key_details_map: dict[str, dict] = {}
    key_ids: list[str] = []
    if remnawave and isinstance(keys, list):
        for key_item in keys:
            if not isinstance(key_item, dict):
                continue
            client_id = key_item.get("client_id")
            if client_id:
                key_ids.append(str(client_id))
        key_ids = list(dict.fromkeys(key_ids))[:50]
        if key_ids:
            key_details = await asyncio.gather(*[remnawave.get_user(kid) for kid in key_ids], return_exceptions=True)
            for kid, detail in zip(key_ids, key_details):
                if isinstance(detail, Exception) or not isinstance(detail, dict):
                    continue
                response = detail.get("response")
                if isinstance(response, dict):
                    key_details_map[kid] = response

    tariffs_by_id: dict[int, dict] = {}
    if isinstance(tariffs, list):
        for tariff in tariffs:
            if not isinstance(tariff, dict):
                continue
            tariff_id = _to_int(tariff.get("id"))
            if tariff_id is not None:
                tariffs_by_id[tariff_id] = tariff

    enriched_keys: list[dict] | None = None
    if isinstance(keys, list):
        enriched_keys = []
        for key_item in keys:
            if not isinstance(key_item, dict):
                continue
            item = dict(key_item)
            key_client_id = item.get("client_id")
            rem_detail = key_details_map.get(str(key_client_id)) if key_client_id else None
            if not rem_detail:
                for candidate in (
                    item.get("email"),
                    item.get("username"),
                    item.get("client_id"),
                    item.get("subscription_uuid"),
                    item.get("uuid"),
                ):
                    if candidate and str(candidate) in rem_user_map:
                        rem_detail = rem_user_map[str(candidate)]
                        break

            tariff_id = _to_int(item.get("tariff_id"))
            tariff = tariffs_by_id.get(tariff_id) if tariff_id is not None else None
            used_bytes = _to_int((rem_detail or {}).get("userTraffic", {}).get("usedTrafficBytes"))
            limit_bytes = _to_int((rem_detail or {}).get("trafficLimitBytes"))
            if used_bytes is not None:
                item["used_traffic_bytes"] = used_bytes
                item["used_traffic_gb"] = round(used_bytes / 1073741824, 2)
            if limit_bytes is not None:
                item["traffic_limit_bytes"] = limit_bytes
                item["traffic_limit_gb"] = round(limit_bytes / 1073741824, 2) if limit_bytes > 0 else None
            device_limit = (
                item.get("current_device_limit")
                if item.get("current_device_limit") is not None
                else item.get("selected_device_limit")
            )
            if device_limit is None and tariff:
                device_limit = tariff.get("device_limit")
            if device_limit is None and rem_detail:
                device_limit = rem_detail.get("hwidDeviceLimit")
            item["resolved_device_limit"] = device_limit
            if tariff:
                item["tariff_name"] = tariff.get("name")
                item["group_name"] = tariff.get("subgroup_title")
            if rem_detail:
                item["remnawave"] = rem_detail
            enriched_keys.append(item)

    successful_payments = []
    if isinstance(payments, list):
        successful_payments = [
            p for p in payments
            if isinstance(p, dict) and str(p.get("status", "")).lower() == "success"
        ]
    total_payments_amount = round(sum(float(p.get("amount", 0) or 0) for p in successful_payments), 2)
    source_invite = (
        user.get("source_code") if isinstance(user, dict) and user.get("source_code")
        else None
    )
    if not source_invite and isinstance(user, dict):
        source_invite = user.get("referrer_code") or user.get("inviter") or user.get("invited_by")

    return ExternalProfile(
        user=user,
        keys=enriched_keys if enriched_keys is not None else keys,
        payments=payments,
        ban_status=None,
        tariffs=tariffs,
        referrals=enriched_referrals,
        remnawave=rem_users,
        remnawave_devices=devices,
        summary={
            "trial": user.get("trial") if isinstance(user, dict) else None,
            "total_payments_amount": total_payments_amount,
            "total_payments_count": len(successful_payments),
            "referral_count": len(enriched_referrals) if isinstance(enriched_referrals, list) else 0,
            "source_invite": source_invite or "-",
            "created_at": user.get("created_at") if isinstance(user, dict) else None,
        },
    )


@router.post("/remnawave/devices/delete")
async def delete_hwid_device(payload: dict, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict:
    if await is_test_mode(db):
        return {"ok": True, "result": {"status": "test_mode"}}
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
