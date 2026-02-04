#!/usr/bin/env python3
import asyncio
import sys
sys.path.insert(0, '/app')

from app.db.session import AsyncSessionLocal
from app.models.auth import User
from app.auth.crypto import hash_secret
from app.models.enums import UserRole
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        # Check if admin exists
        result = await db.execute(select(User).where(User.username == "admin"))
        user = result.scalar_one_or_none()
        
        if user:
            print(f"Admin exists: {user.username}, active: {user.is_active}, role: {user.role}")
        else:
            print("Admin does not exist, creating...")
            user = User(
                telegram_user_id=1,
                username="admin",
                password_hash=hash_secret("admin"),
                role=UserRole.administrator,
                is_active=True,
                must_change_password=True,
                telegram_oauth_enabled=False,
            )
            db.add(user)
            await db.commit()
            print("Admin created with username 'admin' and password 'admin'")

asyncio.run(main())
