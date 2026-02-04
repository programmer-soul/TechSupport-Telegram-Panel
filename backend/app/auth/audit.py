from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import AuditLog


async def audit(
    db: AsyncSession,
    event_type: str,
    actor_user_id: str | None,
    actor_role: str | None,
    ip: str | None,
    user_agent: str | None,
    metadata: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        event_type=event_type,
        ip=ip,
        user_agent=user_agent,
        meta=metadata or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    await db.commit()
