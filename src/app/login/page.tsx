"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      // invite-only: unknown emails get nothing
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMsg(error.message.includes("Signups not allowed") ? "This email hasn't been invited. Ask an admin." : error.message);
    } else setState("sent");
  }

  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg)] px-4">
      <form onSubmit={send} className="w-full max-w-sm rounded-xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Ads Manager</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Sign in with the email you were invited with. No Facebook login needed.</p>
        {state === "sent" ? (
          <p className="mt-5 rounded-md bg-[var(--blue-soft)] p-3 text-sm">Check your inbox for a sign-in link.</p>
        ) : (
          <>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
              className="mt-5 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--blue)]"
            />
            <button disabled={state === "sending"} className="mt-3 w-full rounded-md bg-[var(--blue)] py-2 text-sm font-medium text-white disabled:opacity-60">
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {state === "error" && <p className="mt-3 text-sm text-red-600">{msg}</p>}
          </>
        )}
      </form>
    </main>
  );
}
