from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Pagination(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False


class Timestamped(ORMBase):
    created_at: datetime | None = None
    updated_at: datetime | None = None
