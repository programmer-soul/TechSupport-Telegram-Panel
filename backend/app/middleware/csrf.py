from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import sys

from app.auth.csrf import verify_csrf


class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, exempt_paths: list[str] | None = None):
        super().__init__(app)
        self.exempt_paths = exempt_paths or []
        print(f"CSRFMiddleware initialized with exempt_paths: {self.exempt_paths}", file=sys.stderr)

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            path = request.url.path
            is_exempt = any(path.startswith(p) for p in self.exempt_paths)
            print(f"CSRF check: path={path}, is_exempt={is_exempt}", file=sys.stderr)
            if not is_exempt:
                try:
                    verify_csrf(request)
                except HTTPException as exc:
                    print(f"CSRF verification failed for {path}", file=sys.stderr)
                    return Response(content=exc.detail, status_code=exc.status_code)
        return await call_next(request)
