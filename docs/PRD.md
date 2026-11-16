# PRD: Database Incident Assistant

Nov 16, 2026 · @Sunjana

## Problem and target user

On-call engineers at fintech companies lose time during a database incident working out which system is failing, how severe it is and what to check first.

**Target user:** a backend or on-call engineer at a payments company, paged out of hours, who needs a reliable first answer without searching through scattered runbooks.

Today the pain looks like this:

- Runbooks, severity rules and ownership live in different places.
- Under pressure, people pick the wrong severity or the wrong first check.
- A follow-up question means re-explaining the whole incident.

## One-line solution

**For** on-call engineers, **help** triage a database incident, **using** one AI action that answers only from the team's context document and remembers the conversation.

Example: an engineer pastes "payments are timing out, too many connections" and gets the database involved, the severity, likely causes, first checks and the fix. They then ask "what about the replica?" and the app understands what that refers to.

## Primary feature: triage chat with memory

The user chats with an assistant that answers from `wise_context.md` (the Meridian Pay database estate) and remembers earlier messages in the same session. Each behaviour below must be testable.

| ID | Given | Then |
|---|---|---|
| B1 | A pasted error or symptom | The answer uses six headings: Database, Severity, Likely cause, First checks, Fix, Escalate to |
| B2 | A follow-up question in the same session | The answer uses earlier messages, for example "what about the replica?" after a replication lag question |
| B3 | A question the document does not cover | The app replies "Not covered in the context document." and says what is missing |
| B4 | A report of wrong balances or duplicate charges | The severity is SEV1 |
| B5 | Any question about fixing ledger or audit data | The answer never suggests deleting or editing rows; corrections are new entries |
| B6 | A returning user who reloads the page | Their past sessions and messages are still there |
| B7 | Suggested SQL in an answer | The answer reminds the user to run it on a replica first and have it reviewed |

## User journey

The user moves through five screens, one step after another.

1. **Landing page:** explains what the assistant does and has a "Sign in" button.
2. **Sign up or log in:** email and password through Supabase Auth.
3. **Dashboard:** lists the user's past incident sessions and a "New incident" button.
4. **User input:** the chat box, where the user pastes an error or asks a question.
5. **Output:** the answer appears in the same chat in the six-heading format, and the user can keep asking follow-ups.

## Week 1 success criteria

Week 1 is done when a stranger can open the live URL, sign in and get a correct triage answer.

- [ ] Live URL opens from any device
- [ ] Sign up, log in and log out work
- [ ] A new incident session can be created
- [ ] Three test questions are answered correctly (one covered, one follow-up, one not covered)
- [ ] A follow-up question uses the earlier messages
- [ ] History is still there after a page refresh
- [ ] The out-of-scope question returns "Not covered in the context document."
- [ ] PRD, TRD and code are in the GitHub repository
- [ ] Submission pack ready: one-line solution, user journey, developer workflow, PRD and TRD, repo link, live URL

## Non-goals and later weeks

Week 1 stays deliberately small: one user, one task, one AI flow.

**Not in Week 1:**

- Searching past incidents or large document sets (RAG)
- Several users in one chat, or team features
- Connecting to real databases or monitoring tools
- Voice, file upload or a mobile app

**Later weeks:**

| Week | Adds |
|---|---|
| 2 | RAG: an "incident memory" that retrieves similar past incidents |
| 3 | Agents: the assistant runs read-only checks through tools |
| 4 | Reliability: tests, monitoring, error handling and limits |
