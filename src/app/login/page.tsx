"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  // Links Supabase sends from the server (Team invites, admin-sent links) arrive with the session in
  // the URL #hash instead of ?code. The hash survives the redirects to here; turn it into a session.
  useEffect(() => {
    const h = new URLSearchParams(location.hash.slice(1));
    const access_token = h.get("access_token"), refresh_token = h.get("refresh_token");
    if (!access_token || !refresh_token) return;
    supabaseBrowser().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) { setState("error"); setMsg("That sign-in link has expired. Ask for a new one."); }
      else location.replace("/");
    });
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const addr = email.trim().toLowerCase();
    await fetch("/auth/ensure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: addr }) });
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: addr,
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
