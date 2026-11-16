"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TopBar from "@/components/TopBar";
import { api, ApiError, type Message } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";

const MAX = 4000;

const EXAMPLES = [
  "Payments are timing out and I see 'too many connections'.",
  "Our replicas show 90 seconds of lag.",
  "A customer was charged twice.",
];

/** Ensure each of the six headings (and the SQL warning) starts its own paragraph in Markdown. */
function normalizeAnswer(text: string): string {
  return text.replace(/\n+(?=\*\*(Database|Severity|Likely cause|First checks|Fix|Escalate to):?\*\*|⚠️)/g, "\n\n");
}

function severityOf(text: string): string | null {
  const m = text.match(/Severity:?\**\s*(SEV[1-4])/i);
  return m ? m[1].toUpperCase() : null;
}

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, ready } = useRequireAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ready) return;
    api
      .getMessages(id)
      .then(setMessages)
      .catch((e: ApiError) => {
        if (e.status === 401) router.replace("/login");
        else if (e.status === 404) setNotFound(true);
        else setError(e.message);
      });
  }, [ready, id, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || question.length > MAX) {
      setError("Question must be 1 to 4000 characters.");
      return;
    }
    if (sending) return;
    setError(null);
    setSending(true);
    setInput("");
    setMessages((m) => [...(m ?? []), { role: "user", content: question }]);
    try {
      const res = await api.chat(id, question);
      setMessages((m) => [...(m ?? []), { role: "assistant", content: res.answer, created_at: res.created_at }]);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) return router.replace("/login");
      // Not saved on the server, so remove the optimistic message and give the text back.
      setMessages((m) => (m ?? []).slice(0, -1));
      setInput(question);
      setError(err.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  if (!ready) return <div className="loading">Loading…</div>;

  if (notFound)
    return (
      <>
        <TopBar email={session?.user.email} />
        <main className="page">
          <div className="card empty">
            <p>Session not found.</p>
            <Link href="/dashboard" className="link">
              Back to incidents
            </Link>
          </div>
        </main>
      </>
    );

  const tooLong = input.length > MAX;

  return (
    <div className="chat-shell">
      <TopBar email={session?.user.email} />
      <div className="chat-sub">
        <Link href="/dashboard" className="link small">
          ← All incidents
        </Link>
      </div>

      <main className="chat-scroll">
        <div className="chat-inner">
          {messages === null && !error && <p className="muted">Loading messages…</p>}
          {messages?.length === 0 && (
            <div className="chat-empty">
              <h2>What&apos;s happening?</h2>
              <p className="muted">Paste an error message or describe the symptom.</p>
              <div className="examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="chip" onClick={() => send(ex)} disabled={sending}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages?.map((m, i) => {
            const sev = m.role === "assistant" ? severityOf(m.content) : null;
            return (
              <div key={m.id ?? `local-${i}`} className={`msg msg-${m.role}`}>
                {m.role === "user" ? (
                  <div className="bubble">{m.content}</div>
                ) : (
                  <div className="answer card">
                    {sev && <span className={`sev sev-${sev.toLowerCase()}`}>{sev}</span>}
                    <div className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeAnswer(m.content)}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {sending && (
            <div className="msg msg-assistant">
              <div className="answer card thinking">Checking the context document…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="composer-inner">
          {error && <p className="error">{error}</p>}
          <div className="composer-row">
            <textarea
              ref={inputRef}
              value={input}
              placeholder="Paste an error or ask a follow-up…"
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || !input.trim() || tooLong}>
              Send
            </button>
          </div>
          <p className={`small ${tooLong ? "error-text" : "muted"}`}>
            {input.length}/{MAX} · Enter to send, Shift+Enter for a new line
          </p>
        </div>
      </form>
    </div>
  );
}
