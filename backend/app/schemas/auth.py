from pydantic import BaseModel, Field, ConfigDict


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TelegramCodeRequest(BaseModel):
    code: str


class TelegramLoginRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    auth_date: int
    hash: str


class PendingLoginResponse(BaseModel):
    pending_login_id: str


class PendingLoginRequest(BaseModel):
    pending_login_id: str | None = None


class WebAuthnOptionsRequest(PendingLoginRequest):
    pass


class WebAuthnVerifyRequest(PendingLoginRequest):
    credential: dict = Field(default_factory=dict)


class UserMe(BaseModel):
    id: str
    telegram_user_id: int
    role: str
    must_change_password: bool
    username: str
