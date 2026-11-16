"""Load and save sessions and messages in Supabase. Every query is scoped to the user's id."""

import uuid

from db import get_supabase

HISTORY_LIMIT = 10


def _valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError):
        return False


def create_session(user_id: str) -> dict:
    res = get_supabase().table("sessions").insert({"user_id": user_id}).execute()
    return res.data[0]


def list_sessions(user_id: str) -> list[dict]:
    res = (
        get_supabase()
        .table("sessions")
        .select("id, title, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data


def get_session(session_id: str, user_id: str) -> dict | None:
    """Return the session only if it exists and belongs to this user."""
    if not _valid_uuid(session_id):
        return None
    res = (
        get_supabase()
        .table("sessions")
        .select("id, title, created_at")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def all_messages(session_id: str) -> list[dict]:
    res = (
        get_supabase()
        .table("messages")
        .select("id, role, content, created_at")
        .eq("session_id", session_id)
        .order("created_at")
        .order("id")
        .execute()
    )
    return res.data


def recent_messages(session_id: str, limit: int = HISTORY_LIMIT) -> list[dict]:
    """Last `limit` messages, returned oldest first."""
    res = (
        get_supabase()
        .table("messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(res.data))


def save_exchange(session_id: str, question: str, answer: str) -> dict:
    """Save the user message and the assistant message; return the saved assistant row."""
    res = (
        get_supabase()
        .table("messages")
        .insert(
            [
                {"session_id": session_id, "role": "user", "content": question},
                {"session_id": session_id, "role": "assistant", "content": answer},
            ]
        )
        .execute()
    )
    return res.data[-1]


def set_title_if_empty(session: dict, question: str) -> None:
    if session.get("title"):
        return
    title = " ".join(question.split())
    if len(title) > 60:
        title = title[:57].rstrip() + "..."
    get_supabase().table("sessions").update({"title": title}).eq("id", session["id"]).execute()
