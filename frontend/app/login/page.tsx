"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) router.replace("/dashboard");
        else setInfo("Check your email to confirm your account, then log in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden>
          ◆
        </span>
        Incident Assistant
      </Link>
      <form className="card auth-card" onSubmit={submit}>
        <h1>{mode === "login" ? "Log in" : "Create an account"}</h1>
        <label>
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
        <p className="muted small center">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </form>
    </main>
  );
}
