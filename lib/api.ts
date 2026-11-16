import { supabase } from "./supabase";

// Same origin: on Vercel, /api/py/* is the FastAPI function; locally Next.js forwards it to port 8000.
const API_URL = "/api/py";

export type Session = { id: string; title: string | null; created_at: string };
export type Message = { id?: number; role: "user" | "assistant"; content: string; created_at?: string };
export type ChatResponse = { session_id: string; answer: string; created_at: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "Please sign in again.");

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listSessions: () => request<Session[]>("/sessions"),
  createSession: () => request<Session>("/sessions", { method: "POST" }),
  getMessages: (sessionId: string) => request<Message[]>(`/sessions/${sessionId}/messages`),
  chat: (sessionId: string, question: string) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, question }),
    }),
};
