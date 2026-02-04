from pydantic import BaseModel

from app.schemas.common import Timestamped


class InlineButton(BaseModel):
    text: str
    url: str


class AttachmentData(BaseModel):
    url: str | None = None
    local_path: str | None = None
    mime: str | None = None
    name: str | None = None
    size: int | None = None


class TemplateCreate(BaseModel):
    title: str
    body: str
    attachments: list[AttachmentData] | None = None
    inline_buttons: list[list[InlineButton]] | None = None  # rows of buttons


class TemplateUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    attachments: list[AttachmentData] | None = None
    inline_buttons: list[list[InlineButton]] | None = None


class TemplateOut(Timestamped):
    id: int
    title: str
    body: str
    attachments: list[AttachmentData] | None = None
    inline_buttons: list[list[InlineButton]] | None = None
