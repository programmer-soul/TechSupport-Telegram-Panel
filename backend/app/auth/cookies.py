from fastapi import Response

from app.core.config import get_settings

settings = get_settings()


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, csrf_token: str) -> None:
    response.set_cookie(
        settings.access_cookie_name,
        access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path=settings.refresh_cookie_path,
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )


def set_access_cookie(response: Response, access_token: str, csrf_token: str) -> None:
    response.set_cookie(
        settings.access_cookie_name,
        access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.access_cookie_name, domain=settings.cookie_domain, path="/")
    response.delete_cookie(settings.refresh_cookie_name, domain=settings.cookie_domain, path=settings.refresh_cookie_path)
    response.delete_cookie(settings.csrf_cookie_name, domain=settings.cookie_domain, path="/")
