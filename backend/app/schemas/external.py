from pydantic import BaseModel


class ExternalProfile(BaseModel):
    user: dict | None = None
    keys: list | None = None
    payments: list | None = None
    ban_status: dict | None = None
    tariffs: list | None = None
    referrals: list | None = None
    remnawave: list | dict | None = None
    remnawave_devices: list | None = None
