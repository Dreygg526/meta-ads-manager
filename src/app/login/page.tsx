"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "signing" | "error">("idle");
  const [msg, setMsg] = useState("");

  // Links Supabase sends from the server (Team invite emails) arrive with the session in the URL
  // #hash instead of ?code. The hash survives the redirects to here; turn it into a session.
  useEffect(() => {
    const h = new URLSearchParams(location.hash.slice(1));
    const access_token = h.get("access_token"), refresh_token = h.get("refresh_token");
    if (!access_token || !refresh_token) return;
    supabaseBrowser().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) { setState("error"); setMsg("That invite link has expired. Just enter your email below."); }
      else location.replace("/");
    });
  }, []);

  // Invited members get straight in with just their email (see /auth/quick).
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setState("signing");
    const r = await fetch("/auth/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) location.replace("/");
    else { setState("error"); setMsg(d.error || "Couldn't sign you in."); }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg)] px-4">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Ads Manager</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Enter the email you were invited with. No Facebook login needed.</p>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
          disabled={state === "signing"} autoFocus
          className="mt-5 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--blue)] disabled:bg-[var(--hover)]"
        />
        <button disabled={state === "signing"} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--blue)] py-2 text-sm font-medium text-white disabled:opacity-70">
          {state === "signing" ? <><Loader2 size={14} className="animate-spin" />Signing in…</> : "Continue"}
        </button>
        {state === "error" && <p className="mt-3 text-sm text-red-600">{msg}</p>}
      </form>
    </main>
  );
}
