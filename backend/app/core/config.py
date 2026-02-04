from functools import lru_cache
from pydantic import Field, AliasChoices, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("cookie_domain", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: str | None) -> str | None:
        if v == "":
            return None
        return v

    app_name: str = "telegram-support"
    api_prefix: str = "/api"
    secret_key: str = Field(default="change-me")
    access_token_exp_minutes: int = 10
    refresh_token_exp_minutes: int = 60 * 24 * 30

    postgres_dsn: str = Field(default="postgresql+asyncpg://postgres:postgres@db:5432/support")

    cors_origins: str = "http://localhost:5173"

    storage_backend: str = "local"  # local | s3
    storage_local_path: str = "/data/uploads"
    storage_public_base_url: str = "/static"

    s3_endpoint_url: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_bucket: str | None = None
    s3_region: str | None = None

    bot_internal_token: str = "change-me-bot"
    bot_base_url: str = "http://bot:8081"

    # Auth settings
    panel_origin: str = "http://localhost:5173"
    cookie_domain: str | None = None
    jwt_iss: str = "support-panel"
    jwt_aud: str = "support-panel"
    jwt_private_key: str | None = None
    jwt_public_key: str | None = None
    jwt_algorithm: str = "HS256"
    csrf_cookie_name: str = "csrf_token"
    access_cookie_name: str = "access_token"
    refresh_cookie_name: str = "refresh_token"
    refresh_cookie_path: str = "/api/auth/refresh"
    cookie_secure: bool = True
    rp_id: str = "localhost"
    rp_origin: str = "http://localhost:5173"

    rate_limit_backend: str = "memory"  # redis | memory
    redis_url: str | None = None


@lru_cache

def get_settings() -> Settings:
    return Settings()
