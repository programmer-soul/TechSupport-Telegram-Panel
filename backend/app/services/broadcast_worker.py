"""Background worker for processing broadcasts."""
import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.broadcast import Broadcast
from app.models.chat import Chat
from app.models.message import Message
from app.models.attachment import Attachment
from app.models.enums import MessageDirection, MessageType

logger = logging.getLogger(__name__)
settings = get_settings()


async def send_broadcast_message(
    tg_id: int,
    text: str,
    attachments: list | None = None,
    inline_buttons: list | None = None,
) -> bool:
    """Send a broadcast message to a single user via the bot."""
    try:
        payload = {
            "tg_id": tg_id,
            "text": text,
            "type": "text",
            "attachments": attachments or [],
            "inline_buttons": inline_buttons,
        }
        headers = {"X-Internal-Token": settings.bot_internal_token}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.bot_base_url.rstrip('/')}/internal/send",
                json=payload,
                headers=headers,
            )
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"Failed to send broadcast to {tg_id}: {e}")
        return False


async def process_broadcast(broadcast: Broadcast, db: AsyncSession) -> None:
    """Process a single broadcast, sending it to all users."""
    logger.info(f"Processing broadcast {broadcast.id}")
    
    # Update status to in_progress
    broadcast.status = "in_progress"
    await db.commit()
    
    # Get chats filtered by target_statuses (supports multiple statuses)
    target_statuses = broadcast.target_statuses or ["all"]
    if "all" in target_statuses:
        query = select(Chat)
    else:
        # Convert lowercase status names to uppercase enum values
        status_mapping = {"new": "NEW", "active": "ACTIVE", "closed": "CLOSED", "escalated": "ESCALATED"}
        uppercase_statuses = [status_mapping.get(s, s.upper()) for s in target_statuses]
        # Filter by multiple statuses using IN clause
        query = select(Chat).where(Chat.status.in_(uppercase_statuses))
    
    result = await db.execute(query)
    chats = result.scalars().all()
    
    if not chats:
        logger.warning(f"No chats found for broadcast {broadcast.id}")
        broadcast.status = "completed"
        broadcast.stats = {"sent": 0, "failed": 0, "total": 0}
        await db.commit()
        return
    
    sent = 0
    failed = 0
    
    # Convert attachments from dict format to expected format
    attachments_data = None
    if broadcast.attachments:
        attachments_data = []
        for att in broadcast.attachments:
            attachments_data.append({
                "local_path": att.get("local_path"),
                "url": att.get("url"),
                "telegram_file_id": att.get("telegram_file_id"),
                "mime": att.get("mime"),
                "name": att.get("name"),
                "size": att.get("size"),
                "meta": att.get("meta"),
            })
    
    for chat in chats:
        success = await send_broadcast_message(
            tg_id=chat.tg_id,
            text=broadcast.body,
            attachments=attachments_data,
            inline_buttons=broadcast.inline_buttons,
        )
        if success:
            sent += 1
            # Create message in chat for successful sends
            msg = Message(
                chat_id=chat.id,
                direction=MessageDirection.outbound,
                type=MessageType.text,
                text=broadcast.body,
                inline_buttons=broadcast.inline_buttons,
                sent_by_user_id=getattr(broadcast, "created_by_user_id", None),
            )
            db.add(msg)
            
            # Add attachments to message if any
            if broadcast.attachments:
                for att in broadcast.attachments:
                    attachment = Attachment(
                        message=msg,
                        local_path=att.get("local_path"),
                        url=att.get("url"),
                        telegram_file_id=att.get("telegram_file_id"),
                        mime=att.get("mime"),
                        name=att.get("name"),
                        size=att.get("size"),
                        meta=att.get("meta"),
                    )
                    db.add(attachment)
            
            # Update chat's last_message_at
            chat.last_message_at = datetime.now(timezone.utc)
        else:
            failed += 1
        
        # Rate limiting - don't send too fast
        await asyncio.sleep(0.05)  # 20 messages per second max
    
    # Update broadcast status
    broadcast.status = "completed"
    broadcast.stats = {"sent": sent, "failed": failed, "total": len(chats)}
    await db.commit()
    
    logger.info(f"Broadcast {broadcast.id} completed: {sent} sent, {failed} failed")


async def broadcast_worker_loop() -> None:
    """Main worker loop that processes queued broadcasts."""
    logger.info("Broadcast worker started")
    
    while True:
        try:
            async with AsyncSessionLocal() as db:
                # Find queued broadcasts
                result = await db.execute(
                    select(Broadcast)
                    .where(Broadcast.status == "queued")
                    .order_by(Broadcast.created_at)
                    .limit(1)
                )
                broadcast = result.scalar_one_or_none()
                
                if broadcast:
                    await process_broadcast(broadcast, db)
                else:
                    # No queued broadcasts, wait before checking again
                    await asyncio.sleep(5)
                    
        except Exception as e:
            logger.error(f"Broadcast worker error: {e}", exc_info=True)
            await asyncio.sleep(10)


async def start_broadcast_worker() -> asyncio.Task:
    """Start the broadcast worker as a background task."""
    return asyncio.create_task(broadcast_worker_loop())
