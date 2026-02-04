from pydantic import BaseModel, field_validator
from uuid import UUID

from app.models.enums import UserRole
from app.schemas.common import Timestamped


class AdminCreate(BaseModel):
    telegram_user_id: int
    username: str | None = None
    role: UserRole = UserRole.moderator
    is_active: bool = True
    temp_password: str | None = None


class AdminUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None
    temp_password: str | None = None
    username: str | None = None
    telegram_user_id: int | None = None
    telegram_oauth_enabled: bool | None = None


class AdminOut(Timestamped):
    id: str | UUID
    telegram_user_id: int
    username: str
    role: UserRole
    is_active: bool
    telegram_oauth_enabled: bool = False
    
    @field_validator('id', mode='before')
    @classmethod
    def convert_id_to_str(cls, v):
        if isinstance(v, UUID):
            return str(v)
        return v
