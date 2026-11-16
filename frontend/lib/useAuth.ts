"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Redirects to /login when signed out. Returns the auth session once known. */
export function useRequireAuth() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return { session, ready: ready && !!session };
}

export async function signOut() {
  await supabase.auth.signOut();
}
