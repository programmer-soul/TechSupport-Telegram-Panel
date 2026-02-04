import asyncio
import os

from sqlalchemy import select

from app.auth.crypto import hash_secret
from app.db.session import AsyncSessionLocal
from app.models.auth import User
from app.models.enums import UserRole


async def main() -> None:
    telegram_id = os.getenv("ADMIN_TELEGRAM_ID")
    role = os.getenv("ADMIN_ROLE", "administrator")
    if not telegram_id:
        print("ADMIN_TELEGRAM_ID is required")
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.telegram_user_id == int(telegram_id)))
        if result.scalar_one_or_none():
            print("Admin already exists")
            return
        
        # Check if admin with username 'admin' already exists
        result = await session.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none():
            print("Admin user already exists")
            return
        
        user = User(
            telegram_user_id=int(telegram_id),
            username="admin",
            password_hash=hash_secret("admin"),
            role=UserRole(role),
            is_active=True,
            must_change_password=True,
            telegram_oauth_enabled=False,
        )
        session.add(user)
        await session.commit()
        print("Admin created with username 'admin' and password 'admin' - must change password on first login")


if __name__ == "__main__":
    asyncio.run(main())

