# Database Incident Assistant

For on-call engineers, help triage a database incident, using one AI action that answers only from the team's context document and remembers the conversation.

Paste an error like *"Payments are timing out, too many connections"* and get the database involved, the severity, likely causes, first checks, the fix and who to escalate to. Then ask *"what about the replica?"* without re-explaining.

- **Product spec:** [docs/PRD.md](docs/PRD.md)
- **Technical spec and test plan:** [docs/TRD.md](docs/TRD.md)
- **Context document the AI answers from:** [backend/wise_context.md](backend/wise_context.md) (Meridian Pay, a fictional payments company)

## Stack

Next.js frontend (Vercel) · FastAPI backend (Python) · LangChain + Gemini · Supabase (auth + Postgres)

```
browser ──POST /chat──▶ FastAPI ──▶ LangChain (system prompt + wise_context.md + last 10 messages + question) ──▶ Gemini
                          │
                          └──▶ Supabase: verify token, load history, save both messages
```

## Run it locally

You need Node 20+, Python 3.11+, a [Supabase](https://supabase.com) project and a [Gemini API key](https://aistudio.google.com/apikey).

**1. Supabase:** in the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). Under Authentication → Sign In / Providers, make sure Email is enabled. For quick testing you can turn off "Confirm email".

**2. Backend**

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
uvicorn main:app --reload --port 8000
```

Check: `curl localhost:8000/health` returns `{"status":"ok"}`.

**3. Frontend**

```sh
cd frontend
npm install
cp .env.example .env.local  # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open http://localhost:3000.

## Deploy

1. **Supabase:** run the schema (above). In Authentication → URL Configuration, set the Site URL to your frontend URL.
2. **Backend on Vercel:** new Vercel project from this repo with **Root Directory = `backend`** (Vercel detects FastAPI from `main.py`). Set `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, optionally `GEMINI_MODEL`, and `ALLOWED_ORIGINS` (your frontend URL, added after step 3). Check `https://<backend>/health`.
3. **Frontend on Vercel:** second Vercel project from this repo with **Root Directory = `frontend`**. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_API_URL` (the backend URL).
4. Add the frontend URL to the backend's `ALLOWED_ORIGINS` and redeploy the backend.
5. Open the live URL, sign up, and run the test plan in [docs/TRD.md](docs/TRD.md#test-plan).

If the backend doesn't run on Vercel, any Python host works (Render, Railway, Fly.io): `uvicorn main:app --host 0.0.0.0 --port $PORT` from `backend/`.

## API

All endpoints except `/health` need `Authorization: Bearer <supabase access token>`.

| Method and path | Purpose |
|---|---|
| `POST /sessions` | Create a new incident session |
| `GET /sessions` | List the user's sessions, newest first |
| `GET /sessions/{id}/messages` | Return all messages in a session |
| `POST /chat` | `{session_id, question}` → `{session_id, answer, created_at}` |
| `GET /health` | `{"status": "ok"}` |
