from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.template import Template
from app.schemas.templates import TemplateCreate, TemplateOut, TemplateUpdate
from app.ws.manager import manager

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)) -> list[Template]:
    result = await db.execute(select(Template).order_by(Template.id))
    return list(result.scalars().all())


@router.post("", response_model=TemplateOut)
async def create_template(payload: TemplateCreate, db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)) -> Template:
    template = Template(
        title=payload.title,
        body=payload.body,
        attachments=[a.model_dump() for a in payload.attachments] if payload.attachments else None,
        inline_buttons=[[b.model_dump() for b in row] for row in payload.inline_buttons] if payload.inline_buttons else None,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    await manager.broadcast("template_created", {"template": TemplateOut.model_validate(template).model_dump()})
    return template


@router.patch("/{template_id}", response_model=TemplateOut)
async def update_template(template_id: int, payload: TemplateUpdate, db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)) -> Template:
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Not found")
    if payload.title is not None:
        template.title = payload.title
    if payload.body is not None:
        template.body = payload.body
    if payload.attachments is not None:
        template.attachments = [a.model_dump() for a in payload.attachments] if payload.attachments else None
    if payload.inline_buttons is not None:
        template.inline_buttons = [[b.model_dump() for b in row] for row in payload.inline_buttons] if payload.inline_buttons else None
    await db.commit()
    await db.refresh(template)
    await manager.broadcast("template_updated", {"template": TemplateOut.model_validate(template).model_dump()})
    return template


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db), admin=Depends(get_current_admin)) -> None:
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(template)
    await db.commit()
    await manager.broadcast("template_deleted", {"id": template_id})
