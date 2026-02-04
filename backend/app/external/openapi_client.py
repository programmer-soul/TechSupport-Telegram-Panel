import json
from pathlib import Path
from typing import Any

import httpx


class OpenAPIError(RuntimeError):
    pass


def load_spec(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _find_path(spec: dict, path: str) -> dict | None:
    return spec.get("paths", {}).get(path)


def _ensure_operation(spec: dict, path: str, method: str) -> dict:
    node = _find_path(spec, path)
    if not node or method.lower() not in node:
        raise OpenAPIError(f"Operation not found: {method} {path}")
    return node[method.lower()]


def _format_path(path: str, params: dict[str, Any] | None, pop_params: bool = True) -> str:
    if not params:
        return path
    for key, value in list(params.items()):
        token = "{" + key + "}"
        if token in path:
            path = path.replace(token, str(value))
            if pop_params:
                params.pop(key, None)
    return path


class OpenAPIClient:
    def __init__(self, base_url: str, spec: dict, default_headers: dict[str, str] | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.spec = spec
        self.default_headers = default_headers or {}
        self.verify_tls = True

    async def request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_body: Any | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 10.0,
        keep_path_params: bool = False,
        path_params: dict[str, Any] | None = None,
        verify: bool | None = None,
    ) -> Any:
        _ensure_operation(self.spec, path, method)
        params = params.copy() if params else {}
        final_path = _format_path(
            path,
            path_params.copy() if path_params else params,
            pop_params=False if path_params else not keep_path_params,
        )
        url = f"{self.base_url}{final_path}"
        combined_headers = {**self.default_headers, **(headers or {})}
        verify_tls = self.verify_tls if verify is None else verify
        async with httpx.AsyncClient(timeout=timeout, verify=verify_tls) as client:
            resp = await client.request(method, url, params=params, json=json_body, headers=combined_headers)
        resp.raise_for_status()
        if resp.text:
            return resp.json()
        return None
