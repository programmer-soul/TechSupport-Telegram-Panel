import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self.lock:
            self.active.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self.lock:
            self.active.discard(websocket)

    async def broadcast(self, event: str, payload: Any) -> None:
        message = json.dumps({"event": event, "data": payload}, default=str)
        async with self.lock:
            sockets = list(self.active)
        for ws in sockets:
            try:
                await ws.send_text(message)
            except Exception:
                await self.disconnect(ws)


manager = ConnectionManager()
