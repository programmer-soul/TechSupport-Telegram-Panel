import time
from typing import Any

import redis.asyncio as redis

from app.core.config import get_settings

settings = get_settings()


class RateLimiter:
    def __init__(self) -> None:
        self._memory: dict[str, tuple[int, float]] = {}
        self._redis: redis.Redis | None = None
        if settings.rate_limit_backend == "redis" and settings.redis_url:
            self._redis = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)

    async def hit(self, key: str, limit: int, window_seconds: int) -> bool:
        if self._redis:
            return await self._hit_redis(key, limit, window_seconds)
        return self._hit_memory(key, limit, window_seconds)

    async def _hit_redis(self, key: str, limit: int, window_seconds: int) -> bool:
        pipe = self._redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds)
        count, _ = await pipe.execute()
        return int(count) <= limit

    def _hit_memory(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.time()
        count, expires = self._memory.get(key, (0, now + window_seconds))
        if now > expires:
            count, expires = 0, now + window_seconds
        count += 1
        self._memory[key] = (count, expires)
        return count <= limit


limiter = RateLimiter()
