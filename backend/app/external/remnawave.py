import asyncio
from typing import Any

from app.external.openapi_client import OpenAPIClient, load_spec

SPEC_PATH = "app/external/specs/api-1.json"


class RemnawaveClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        self.spec = load_spec(SPEC_PATH)
        if not base_url:
            raise ValueError("base_url is required for RemnawaveClient")
        headers = {}
        if token:
            headers = {"Authorization": f"Bearer {token}"}
        base = base_url.rstrip("/")
        self.client = OpenAPIClient(base, self.spec, default_headers=headers)

    async def get_user_by_telegram(self, telegram_id: int) -> dict | None:
        path = "/api/users/by-telegram-id/{telegramId}"
        return await self._safe_request("get", path, params={"telegramId": telegram_id})

    async def get_hwid_devices(self, user_uuid: str) -> dict | None:
        path = "/api/hwid/devices/{userUuid}"
        return await self._safe_request("get", path, params={"userUuid": user_uuid})

    async def get_user(self, user_uuid: str) -> dict | None:
        path = "/api/users/{uuid}"
        return await self._safe_request("get", path, params={"uuid": user_uuid})

    async def delete_hwid_device(self, user_uuid: str, hwid: str) -> dict | None:
        path = "/api/hwid/devices/delete"
        return await self._safe_request("post", path, params={}, json_body={"userUuid": user_uuid, "hwid": hwid})

    async def _safe_request(self, method: str, path: str, params: dict[str, Any], json_body: Any | None = None) -> Any:
        for attempt in range(2):
            try:
                return await self.client.request(method, path, params=params, json_body=json_body)
            except Exception:
                if attempt == 1:
                    return None
                await asyncio.sleep(0.2)
