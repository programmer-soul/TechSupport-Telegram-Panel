import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()
        self.lock = asyncio.Lock()
        self._send_batch_size = 256
        self._max_concurrent_sends = 64

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
        if not sockets:
            return

        semaphore = asyncio.Semaphore(self._max_concurrent_sends)

        async def _send(ws: WebSocket) -> WebSocket | None:
            try:
                async with semaphore:
                    await asyncio.wait_for(ws.send_text(message), timeout=1.5)
                return None
            except Exception:
                return ws

        failed_sockets: list[WebSocket] = []
        for i in range(0, len(sockets), self._send_batch_size):
            batch = sockets[i : i + self._send_batch_size]
            failed = await asyncio.gather(*(_send(ws) for ws in batch))
            failed_sockets.extend(ws for ws in failed if ws is not None)

        if failed_sockets:
            async with self.lock:
                for ws in failed_sockets:
                    self.active.discard(ws)


manager = ConnectionManager()
