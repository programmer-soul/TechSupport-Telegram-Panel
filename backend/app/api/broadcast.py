from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_stepup
from app.core.deps import require_role
from app.db.session import get_db
from app.models.broadcast import Broadcast
from app.models.enums import UserRole
from app.schemas.broadcasts import BroadcastCreate, BroadcastOut

router = APIRouter(prefix="/broadcast", tags=["broadcast"])


@router.get("", response_model=list[BroadcastOut])
async def list_broadcasts(
    db: AsyncSession = Depends(get_db),
    _role=Depends(require_role(UserRole.administrator)),
) -> list[Broadcast]:
    result = await db.execute(select(Broadcast).order_by(desc(Broadcast.created_at)).limit(50))
    return result.scalars().all()


@router.post("", response_model=BroadcastOut)
async def create_broadcast(
    payload: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    _role=Depends(require_role(UserRole.administrator)),
    _stepup=Depends(require_stepup()),
) -> Broadcast:
    broadcast = Broadcast(
        body=payload.body,
        status="queued",
        target_statuses=payload.target_statuses,
        stats={"sent": 0, "failed": 0},
        attachments=[a.model_dump() for a in payload.attachments] if payload.attachments else None,
        inline_buttons=[[b.model_dump() for b in row] for row in payload.inline_buttons] if payload.inline_buttons else None,
    )
    db.add(broadcast)
    await db.commit()
    await db.refresh(broadcast)
    return broadcast
