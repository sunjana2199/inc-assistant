# Database Incident Assistant

For on-call engineers, help triage a database incident, using one AI action that answers only from the team's context document and remembers the conversation.

Paste an error like *"Payments are timing out, too many connections"* and get the database involved, the severity, likely causes, first checks, the fix and who to escalate to. Then ask *"what about the replica?"* without re-explaining.

- **Product spec:** [docs/PRD.md](docs/PRD.md)
- **Technical spec and test plan:** [docs/TRD.md](docs/TRD.md)
- **Context document the AI answers from:** [backend/wise_context.md](backend/wise_context.md) (Meridian Pay, a fictional payments company)

## Stack

Next.js (frontend) · FastAPI (backend, Python) · LangChain + Gemini · Supabase (auth + Postgres) · one Vercel project

```
browser ──/api/py/chat──▶ FastAPI ──▶ LangChain (system prompt + wise_context.md + last 10 messages + question) ──▶ Gemini
                            │
                            └──▶ Supabase: verify token, load history, save both messages
```

The site and the API share one URL. On Vercel, `api/index.py` runs the FastAPI app in `backend/` as a Python function at `/api/py/*`. Locally, Next.js forwards `/api/py/*` to FastAPI on port 8000.

## Run it locally

You need Node 20+, Python 3.11+, a [Supabase](https://supabase.com) project and a [Gemini API key](https://aistudio.google.com/apikey).

**1. Supabase:** in the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). Under Authentication → Sign In / Providers, make sure Email is enabled. For quick testing you can turn off "Confirm email".

**2. Backend** (terminal 1)

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r ../requirements.txt
cp .env.example .env        # fill in GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
uvicorn main:app --reload --port 8000
```

**3. Frontend** (terminal 2, from the repo root)

```sh
npm install
cp .env.example .env.local  # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open http://localhost:3000. Check the API with http://localhost:3000/api/py/health, which returns `{"status":"ok"}`.

## Deploy (one Vercel project)

1. **Supabase:** run the schema (above).
2. **Vercel:** Add New → Project → import this repo. Leave Root Directory as the repo root; Vercel detects Next.js and also deploys `api/index.py` as a Python function.
3. Add these environment variables, then Deploy:

   | Name | Value |
   |---|---|
   | `GOOGLE_API_KEY` | Gemini key |
   | `GEMINI_MODEL` | optional, defaults to `gemini-2.5-flash` |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_SERVICE_KEY` | Supabase secret / service_role key (server only) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable / anon key |

4. **Supabase:** Authentication → URL Configuration → set Site URL to your Vercel URL.
5. Open `https://<your-app>.vercel.app/api/py/health`, then the site itself. Sign up and run the test plan in [docs/TRD.md](docs/TRD.md#test-plan).

## API

All endpoints except health need `Authorization: Bearer <supabase access token>`.

| Method and path | Purpose |
|---|---|
| `POST /api/py/sessions` | Create a new incident session |
| `GET /api/py/sessions` | List the user's sessions, newest first |
| `GET /api/py/sessions/{id}/messages` | Return all messages in a session |
| `POST /api/py/chat` | `{session_id, question}` → `{session_id, answer, created_at}` |
| `GET /api/py/health` | `{"status": "ok"}` |

Interactive API docs: `/api/py/docs`.
