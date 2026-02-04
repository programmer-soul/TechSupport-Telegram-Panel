from __future__ import annotations

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from starlette.responses import StreamingResponse


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
