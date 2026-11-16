# TRD: Database Incident Assistant

Nov 16, 2026 · @Sunjana

## Frontend and backend

The app is a Next.js frontend and a FastAPI backend, with Supabase for auth and data and LangChain calling Gemini.

| Component | Technology | Job |
|---|---|---|
| Frontend | Next.js (React) on Vercel | Landing, login, session list and chat screens |
| Backend | FastAPI, Python 3.11+, on Vercel as a Python function | Validates requests, runs the AI chain, saves messages |
| AI workflow | LangChain | Prompt template, history and model call |
| AI model | Gemini via `langchain-google-genai` | Generates the triage answer |
| Database and auth | Supabase (Postgres) | Users, sessions, messages |
| Code and deploy source | GitHub | Version history; Vercel deploys from it |
| Build tool | Claude Code | Reads the PRD and TRD and writes the code |

Repository layout (as built). The frontend and backend deploy together as **one Vercel project with one URL**: Next.js serves the pages, and `api/index.py` runs the FastAPI app as a Python function under `/api/py/*`.

```
inc-assistant/
  app/                 # Next.js pages: landing, login, dashboard, chat
  components/          # shared UI (top bar)
  lib/api.ts           # calls to the backend (/api/py/*)
  api/
    index.py           # Vercel entry point: loads the FastAPI app from backend/
  backend/
    main.py            # FastAPI app and routes
    chain.py           # LangChain prompt and chain
    history.py         # load and save messages in Supabase
    auth.py            # verify the Supabase token
    db.py              # shared Supabase client (service key)
    wise_context.md    # the database estate document
  supabase/
    schema.sql         # tables, indexes and row level security
  docs/
    PRD.md
    TRD.md
  requirements.txt     # Python dependencies
  package.json         # Node dependencies
  next.config.ts       # forwards /api/py/* to FastAPI on port 8000 in local development
  vercel.json          # bundles backend/ into the Python function
  README.md
```

**Decision (was an open question):** FastAPI runs in the same Vercel project as the frontend, as a Python function. Same origin means no CORS settings and a single deploy. If the Python function does not work on Vercel, the backend can move to another host (Render, Railway) without code changes.

## AI model and prompt

The backend sends one prompt to Gemini containing the instructions, the whole context document, the recent chat history and the new question.

- **Model:** Gemini, name set by the `GEMINI_MODEL` environment variable (default `gemini-2.5-flash`), `temperature=0` so answers stay consistent.
- **System prompt:** the full text lives in `chain.py`. It tells the model to answer only from the context document, to use the six headings, to treat wrong balances or duplicate charges as SEV1, to never suggest editing ledger or audit rows, and to reply "Not covered in the context document." when the answer is missing.
- **Context document:** `wise_context.md` is read once when the backend starts and inserted into the system prompt. It is small enough to fit the model's context window, so no vector search is needed in Week 1.
- **Memory:** the backend loads the last 10 messages of the session from Supabase and passes them as `history`. After the answer, both new messages are saved. This avoids depending on a LangChain memory class that may change.

The prompt template has three parts:

```python
ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),            # instructions + {context}
    MessagesPlaceholder("history"),       # last 10 messages
    ("human", "{question}"),              # the new question
])
```

The chain is `prompt | llm | StrOutputParser()`.

## Data flow

Every question follows the same eight steps from the browser to Gemini and back.

1. The user types a question in the chat; the frontend sends `POST /api/py/chat` with `session_id`, `question` and the user's Supabase token.
2. FastAPI verifies the token and checks the question is 1 to 4000 characters.
3. FastAPI checks the session belongs to that user and loads its last 10 messages from Supabase.
4. The chain is called with `question` and `history`; `wise_context.md` is already in the system prompt.
5. Gemini returns the answer text.
6. FastAPI saves the user message and the assistant message to the `messages` table.
7. FastAPI returns the answer as JSON.
8. The frontend shows the answer in the chat and keeps the session open for follow-ups.

```
Frontend (Next.js on Vercel) --1 POST /api/py/chat--> FastAPI backend --4 run chain--> LangChain chain --> Gemini
                             <--7 answer------                 <--5 answer----
FastAPI backend <--> Supabase (auth, sessions, messages): 2 verify token, 3 load history, 6 save messages
```

## Database schema

Two tables hold everything in Week 1; Supabase Auth manages users, and row level security keeps each user's data private. The runnable script is `supabase/schema.sql`.

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text,
  created_at timestamptz not null default now()
);

create table messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index on messages (session_id, created_at);

alter table sessions enable row level security;
alter table messages enable row level security;

create policy "own sessions" on sessions
  for all using (user_id = auth.uid());

create policy "own messages" on messages
  for all using (session_id in (select id from sessions where user_id = auth.uid()));
```

The backend uses the service key and checks session ownership itself, so it must always filter by the authenticated user's id.

## Inputs and outputs

The backend exposes five endpoints under `/api/py`; every one except `/api/py/health` needs the user's Supabase token as a Bearer header.

| Method and path | Purpose |
|---|---|
| `POST /api/py/sessions` | Create a new incident session |
| `GET /api/py/sessions` | List the user's sessions, newest first |
| `GET /api/py/sessions/{id}/messages` | Return all messages in a session |
| `POST /api/py/chat` | Send a question and get the answer |
| `GET /api/py/health` | Return `{"status": "ok"}` for deploy checks |

`POST /api/py/chat` request and response:

```jsonc
// request
{ "session_id": "8c1f...", "question": "Payments are timing out, too many connections" }

// response
{ "session_id": "8c1f...", "answer": "Database: PAY-DB\nSeverity: SEV1\n...", "created_at": "2026-11-16T20:50:00Z" }
```

The `answer` text always uses these headings: Database, Severity, Likely cause, First checks, Fix, Escalate to. When the document has no answer, it is exactly "Not covered in the context document." followed by what is missing.

Error cases:

| Status | When | Message |
|---|---|---|
| 400 | Empty question, or over 4000 characters | "Question must be 1 to 4000 characters." |
| 401 | Missing or invalid token | "Please sign in again." |
| 404 | Session does not exist or belongs to another user | "Session not found." |
| 502 | Gemini call fails or times out | "The AI service failed. Please try again." |

## Deployment plan

The app goes live in five steps, and Vercel redeploys automatically on every push to GitHub.

1. Push the repository to GitHub, with `docs/PRD.md` and `docs/TRD.md` included.
2. Create a Supabase project, run `supabase/schema.sql` and turn on email sign-in.
3. Import the repository into one Vercel project (root directory = repo root) and set all the environment variables below.
4. In Supabase, set the Site URL to the Vercel URL.
5. Open the live URL, check `/api/py/health`, sign up and run the test plan below.

Environment variables:

| Variable | Used by | Notes |
|---|---|---|
| `GOOGLE_API_KEY` | Backend | Gemini key; never commit it |
| `GEMINI_MODEL` | Backend | Optional; defaults to `gemini-2.5-flash` |
| `SUPABASE_URL` | Backend | Project URL |
| `SUPABASE_SERVICE_KEY` | Backend only | Never expose to the browser |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Public anon key |

## Test plan

A test is just "do this, then you should see that". You don't need to read any code: run these seven tests by hand on the live website, in order, and tick each one off.

Three words you'll see:

- **Session:** one chat about one incident. "New incident" starts a new one.
- **SEV1:** the most serious level, used when money is wrong or can't move.
- **Context document:** the database estate document the assistant is allowed to answer from.

### Test 1: Does it answer a normal question?

**Do:** sign in, click "New incident", and type: `Payments are timing out and I see 'too many connections'.`

**You should see:** a reply with six headings (Database, Severity, Likely cause, First checks, Fix, Escalate to). Severity says SEV1, the database is PAY-DB or LEDGER-DB, and the fix talks about too many connections.

**Why it matters:** it proves the app is reading the context document.

### Test 2: Does it remember the conversation?

**Do:** in the same chat, type: `What about the replica?`

**You should see:** an answer about the replica that connects to the problem you just described, without asking you to explain again.

**If it fails:** if it replies "which replica?" or ignores the earlier message, memory is not working.

### Memory tests: repeat these

The AI can behave slightly differently each time, so run all six memory tests **three times** with different wording and record each result in the table below. One pass is luck; three passes is reliable.

**M1: Pronoun follow-up.** Ask `Our replicas show 90 seconds of lag.` Then ask `Who owns that database and which channel do I use?` You should see the owning team and channel for the database named in the first answer, without being asked again.

**M2: A detail from several messages back.** In one chat send these four messages in order: `Our replicas show 90 seconds of lag.` then `What severity is that?` then `What should I check first?` then `Going back to my first message, how much lag did I report?` You should see **90 seconds**.

**M3: A correction.** Ask `Payments are slow on PAY-DB.` Then say `Sorry, I meant CUST-DB.` You should see the answer switch to CUST-DB and the severity change to match, not keep talking about PAY-DB.

**M4: Memory stays inside one chat.** Click "New incident" and ask `What was my last question?` You should see that it does not know, and it must not mention anything from your other chats.

**M5: Memory survives a refresh.** Ask a question, refresh the page, reopen the chat and ask `Can you repeat the severity you gave?` You should see the same severity as before.

**M6: The memory limit.** In one chat send more than 10 messages (5 questions and answers), then ask about your very first message. Because the app only keeps the last 10 messages, it may not remember. **Pass** means it either answers correctly or says it no longer has that message. **Fail** means it invents an answer.

| Test | Run 1 | Run 2 | Run 3 | Notes |
|---|---|---|---|---|
| M1 pronoun follow-up | | | | |
| M2 detail from earlier | | | | |
| M3 correction | | | | |
| M4 stays inside one chat | | | | |
| M5 survives refresh | | | | |
| M6 memory limit | | | | |

Write PASS or FAIL in each cell. If a test fails even once, copy the exact messages you sent into the Notes column so it can be fixed.

### Test 3: Does it admit when it doesn't know?

**Do:** click "New incident" and type: `How do I fix a MongoDB sharding issue?`

**You should see:** "Not covered in the context document." and a short note on what is missing.

**If it fails:** if it gives a confident how-to, the assistant is making things up, which is the main risk of this app.

### Test 4: Does it treat money problems as the most serious?

**Do:** in a new incident, type: `A customer was charged twice.`

**You should see:** Severity SEV1, and the duplicate payments advice (checking the idempotency key, reversing through the ledger, never deleting rows).

### Test 5: Is my history saved?

**Do:** refresh the page, then open the chat from Test 1 from your list of incidents.

**You should see:** every message still there, in the same order.

### Test 6: Is my data private?

**Do:** open a private browser window and sign up with a different email.

**You should see:** an empty list of incidents. None of the first account's chats appear.

### Test 7: Does it cope with an empty message?

**Do:** press send with the box empty.

**You should see:** a friendly message such as "Question must be 1 to 4000 characters." (or a disabled send button), and no crash.

### Tick when passed

- [ ] Test 1: answers a normal question
- [ ] Test 2: remembers the conversation
- [ ] Test 3: admits when it doesn't know
- [ ] Test 4: money problems are SEV1
- [ ] Test 5: history is saved
- [ ] Test 6: data is private
- [ ] Test 7: handles an empty message
