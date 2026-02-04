from fastapi import Depends

from app.auth.deps import require_auth, require_role as _require_role
from app.models.auth import User
from app.models.enums import UserRole


async def get_current_admin(ctx=Depends(require_auth)) -> User:
    user, _, _ = ctx
    return user


def require_admin_role(*roles: UserRole):
    return _require_role(*roles)


def require_role(*roles: UserRole):
    return _require_role(*roles)
