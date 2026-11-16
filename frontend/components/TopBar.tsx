"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/useAuth";

export default function TopBar({ email }: { email?: string }) {
  const router = useRouter();
  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand">
        <span className="brand-mark" aria-hidden>
          ◆
        </span>
        Incident Assistant
      </Link>
      <div className="topbar-right">
        {email && <span className="muted small hide-sm">{email}</span>}
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
