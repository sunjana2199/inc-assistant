"""Verify the Supabase access token sent as a Bearer header and return the user's id."""

from fastapi import Header, HTTPException

from db import get_supabase

SIGN_IN_AGAIN = "Please sign in again."


def current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail=SIGN_IN_AGAIN)
    token = authorization.split(" ", 1)[1].strip()
    try:
        # Asks Supabase Auth to validate the token; works with both legacy and new signing keys.
        res = get_supabase().auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail=SIGN_IN_AGAIN)
    if not res or not res.user:
        raise HTTPException(status_code=401, detail=SIGN_IN_AGAIN)
    return res.user.id
