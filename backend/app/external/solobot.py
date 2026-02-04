import asyncio
import logging
from typing import Any

from app.external.openapi_client import OpenAPIClient, load_spec

SPEC_PATH = "app/external/specs/solobotapi.json"
logger = logging.getLogger(__name__)


class SolobotClient:
    def __init__(self, base_url: str | None = None, token: str | None = None, admin_tg_id: int | None = None, tls_verify: bool = True) -> None:
        self.spec = load_spec(SPEC_PATH)
        if not base_url:
            raise ValueError("base_url is required for SolobotClient")
        base = base_url.rstrip("/")
        headers = {"X-Token": token} if token else {}
        self.client = OpenAPIClient(base, self.spec, default_headers=headers)
        self.client.verify_tls = tls_verify
        self.tls_verify = tls_verify
        self.admin_tg_id = admin_tg_id

    async def get_user(self, tg_id: int) -> dict | None:
        path = "/api/users/{tg_id}"
        return await self._safe_request("get", path, params=self._admin_params(tg_id), path_params={"tg_id": tg_id})

    async def get_keys(self, tg_id: int) -> list | None:
        path = "/api/keys/{tg_id}"
        return await self._safe_request("get", path, params=self._admin_params(tg_id), path_params={"tg_id": tg_id})

    async def get_all_keys(self, tg_id: int) -> list | None:
        path = "/api/keys/all/{tg_id}"
        return await self._safe_request("get", path, params=self._admin_params(tg_id), path_params={"tg_id": tg_id})

    async def get_payments(self, tg_id: int) -> list | None:
        path = "/api/payments/by_tg_id/{tg_id}"
        return await self._safe_request("get", path, params=self._admin_params(tg_id), path_params={"tg_id": tg_id})

    async def get_tariffs(self, tg_id: int) -> list | None:
        path = "/api/tariffs/"
        return await self._safe_request("get", path, params=self._admin_params(tg_id))

    async def get_referrals(self, tg_id: int) -> list | None:
        path = "/api/referrals/all/{tg_id}"
        return await self._safe_request("get", path, params=self._admin_params(tg_id), path_params={"tg_id": tg_id})

    def _admin_params(self, target_tg_id: int) -> dict[str, Any]:
        return {"tg_id": self.admin_tg_id} if self.admin_tg_id is not None else {"tg_id": target_tg_id}

    async def _safe_request(self, method: str, path: str, params: dict[str, Any], path_params: dict[str, Any] | None = None) -> Any:
        for attempt in range(2):
            try:
                return await self.client.request(
                    method,
                    path,
                    params=params,
                    path_params=path_params,
                    keep_path_params=False,
                    verify=self.tls_verify,
                )
            except Exception as e:
                if attempt == 1:
                    logger.warning("Solobot request failed: %s %s params=%s path_params=%s error=%s", method, path, params, path_params, str(e))
                    return None
                await asyncio.sleep(0.2)
