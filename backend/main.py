"""FastAPI app and routes for the Database Incident Assistant."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import Depends, FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import chain  # noqa: E402
import history  # noqa: E402
from auth import current_user_id  # noqa: E402

log = logging.getLogger("inc-assistant")

app = FastAPI(title="Database Incident Assistant")

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

MAX_QUESTION = 4000


class ChatRequest(BaseModel):
    session_id: str
    question: str


def _owned_session(session_id: str, user_id: str) -> dict:
    session = history.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sessions")
def create_session(user_id: str = Depends(current_user_id)):
    return history.create_session(user_id)


@app.get("/sessions")
def list_sessions(user_id: str = Depends(current_user_id)):
    return history.list_sessions(user_id)


@app.get("/sessions/{session_id}/messages")
def session_messages(session_id: str, user_id: str = Depends(current_user_id)):
    _owned_session(session_id, user_id)
    return history.all_messages(session_id)


@app.post("/chat")
def chat(req: ChatRequest, user_id: str = Depends(current_user_id)):
    question = req.question.strip()
    if not 1 <= len(question) <= MAX_QUESTION:
        raise HTTPException(status_code=400, detail="Question must be 1 to 4000 characters.")

    session = _owned_session(req.session_id, user_id)
    past = history.recent_messages(session["id"])

    try:
        answer = chain.answer(question, past)
    except Exception:
        log.exception("Gemini call failed")
        raise HTTPException(status_code=502, detail="The AI service failed. Please try again.")

    saved = history.save_exchange(session["id"], question, answer)
    history.set_title_if_empty(session, question)
    return {"session_id": session["id"], "answer": answer, "created_at": saved["created_at"]}
