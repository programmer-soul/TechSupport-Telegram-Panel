from __future__ import annotations

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.db.session import get_db
from app.models.setting import Setting


router = APIRouter(prefix="/files", tags=["files"])


@router.get("/proxy")
async def proxy_file(url: str = Query(..., description="Remote file URL")):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid URL")
    if parsed.netloc not in {"api.telegram.org"}:
        raise HTTPException(status_code=403, detail="Forbidden host")

    async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
        resp = await client.get(url)
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail="Upstream error")
        headers = {}
        ct = resp.headers.get("content-type")
        if ct:
            headers["content-type"] = ct
        return StreamingResponse(resp.aiter_bytes(), headers=headers)


@router.get("/telegram")
async def proxy_telegram_file(
    file_id: str = Query(..., description="Telegram file_id"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Setting).where(Setting.key == "telegram_bot_token"))
    setting = result.scalar_one_or_none()
    token = None
    if setting and isinstance(setting.value_json, dict):
        token = setting.value_json.get("token")
    if not token:
        raise HTTPException(status_code=503, detail="Telegram bot token is not configured")

    file_url = f"https://api.telegram.org/bot{token}/getFile"
    async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
        get_file_resp = await client.get(file_url, params={"file_id": file_id})
        if get_file_resp.status_code >= 400:
            raise HTTPException(status_code=get_file_resp.status_code, detail="Telegram getFile failed")
        payload = get_file_resp.json()
        if not payload.get("ok") or not payload.get("result", {}).get("file_path"):
            raise HTTPException(status_code=404, detail="Telegram file path not found")

        file_path = payload["result"]["file_path"]
        download_url = f"https://api.telegram.org/file/bot{token}/{file_path}"
        file_resp = await client.get(download_url)
        if file_resp.status_code >= 400:
            raise HTTPException(status_code=file_resp.status_code, detail="Telegram file download failed")

        headers = {}
        ct = file_resp.headers.get("content-type")
        if ct:
            headers["content-type"] = ct
        return StreamingResponse(file_resp.aiter_bytes(), headers=headers)
