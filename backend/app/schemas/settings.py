from pydantic import BaseModel

from app.schemas.common import Timestamped


class SettingUpsert(BaseModel):
    key: str
    value_json: dict


class SettingOut(Timestamped):
    key: str
    value_json: dict
