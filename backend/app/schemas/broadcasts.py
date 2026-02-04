from pydantic import BaseModel
from typing import Literal

from app.schemas.common import Timestamped
from app.schemas.templates import AttachmentData, InlineButton


TargetStatus = Literal["all", "new", "active", "closed"]


class BroadcastCreate(BaseModel):
    body: str
    target_statuses: list[TargetStatus] = ["all"]  # Support multiple statuses
    attachments: list[AttachmentData] | None = None
    inline_buttons: list[list[InlineButton]] | None = None


class BroadcastOut(Timestamped):
    id: int
    body: str
    status: str
    target_statuses: list[str] | None = ["all"]
    stats: dict | None = None
    attachments: list[AttachmentData] | None = None
    inline_buttons: list[list[InlineButton]] | None = None
