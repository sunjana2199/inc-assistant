"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { api, ApiError, type Session } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const router = useRouter();
  const { session, ready } = useRequireAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api
      .listSessions()
      .then(setSessions)
      .catch((e: ApiError) => {
        if (e.status === 401) router.replace("/login");
        else setError(e.message);
      });
  }, [ready, router]);

  async function newIncident() {
    setCreating(true);
    setError(null);
    try {
      const s = await api.createSession();
      router.push(`/chat/${s.id}`);
    } catch (e) {
      setError((e as ApiError).message);
      setCreating(false);
    }
  }

  if (!ready) return <div className="loading">Loading…</div>;

  return (
    <>
      <TopBar email={session?.user.email} />
      <main className="page">
        <div className="page-head">
          <h1>Incidents</h1>
          <button className="btn btn-primary" onClick={newIncident} disabled={creating}>
            {creating ? "Starting…" : "+ New incident"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {sessions === null && !error && <p className="muted">Loading your incidents…</p>}
        {sessions?.length === 0 && (
          <div className="card empty">
            <p>No incidents yet.</p>
            <p className="muted small">Start one when you get paged: paste the error and get a first answer.</p>
          </div>
        )}
        {sessions && sessions.length > 0 && (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/chat/${s.id}`} className="session-row">
                  <span className="session-title">{s.title || "Untitled incident"}</span>
                  <span className="muted small">{formatDate(s.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
