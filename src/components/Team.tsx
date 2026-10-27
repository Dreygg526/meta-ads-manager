"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type M = { email: string; name: string | null; role: "admin" | "viewer"; created_at: string };
type Note = { ok: boolean; text: string } | null;

export default function Team({ me }: { me: string }) {
  const [members, setMembers] = useState<M[] | null>(null); // null = first load
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [note, setNote] = useState<Note>(null);
  // what is in flight: "invite", or the email of the row being changed/removed
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => fetch("/api/team").then((r) => r.json()).then((d) => setMembers(d.members || []));
  useEffect(() => { load(); }, []);

  async function call(key: string, method: string, body: object, done: string) {
    setBusy(key);
    setNote(null);
    try {
      const r = await fetch("/api/team", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong.");
      await load();
      setNote({ ok: true, text: done });
      return true;
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    // fields stay filled if it fails, so nothing has to be retyped
    if (await call("invite", "POST", { email: addr, name, role }, `Invite sent to ${addr}. They'll get an email from "Ads Manager".`)) {
      setEmail("");
      setName("");
    }
  }

  const inviting = busy === "invite";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 text-[13px]">
      <Link href="/" className="text-[var(--blue)]">← Back to ads</Link>
      <h1 className="mt-3 text-lg font-semibold">Team</h1>
      <p className="text-[var(--muted)]">Admins can invite and remove people. View only sees everything and changes nothing.</p>

      <form onSubmit={invite} className="mt-4 flex flex-wrap gap-2 rounded-lg border border-[var(--line)] bg-white p-3">
        <fieldset disabled={inviting} className="contents">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email"
            className="min-w-0 flex-1 rounded border border-[var(--line)] px-2 py-1.5 disabled:bg-[var(--hover)]" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (optional)"
            className="min-w-0 flex-1 rounded border border-[var(--line)] px-2 py-1.5 disabled:bg-[var(--hover)]" />
          <select value={role} onChange={(e) => setRole(e.target.value as "viewer" | "admin")} className="rounded border border-[var(--line)] px-2">
            <option value="viewer">View only</option>
            <option value="admin">Admin</option>
          </select>
          <button className="flex min-w-[140px] items-center justify-center gap-1.5 rounded bg-[var(--blue)] px-3 py-1.5 text-white disabled:opacity-70">
            {inviting ? <><Loader2 size={14} className="animate-spin" />Sending invite…</> : "Invite"}
          </button>
        </fieldset>
      </form>

      {note && (
        <p role="status" className={`mt-2 flex items-center gap-1.5 rounded-md p-2 ${note.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {note.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{note.text}
        </p>
      )}

      <ul className="mt-4 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-white">
        {members === null && (
          <li className="flex items-center gap-2 p-3 text-[var(--muted)]"><Loader2 size={14} className="animate-spin" />Loading team…</li>
        )}
        {members?.map((m) => {
          const rowBusy = busy === m.email;
          return (
            <li key={m.email} className={`flex flex-wrap items-center gap-2 p-3 ${rowBusy ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate">{m.name || m.email}</div>
                <div className="truncate text-[var(--muted)]">{m.email}</div>
              </div>
              {rowBusy && <Loader2 size={14} className="animate-spin text-[var(--muted)]" />}
              <select value={m.role} disabled={!!busy}
                onChange={(e) => call(m.email, "POST", { email: m.email, name: m.name, role: e.target.value }, `${m.email} is now ${e.target.value === "admin" ? "Admin" : "View only"}.`)}
                className="rounded border border-[var(--line)] px-2 py-1">
                <option value="viewer">View only</option>
                <option value="admin">Admin</option>
              </select>
              {m.email !== me && (
                <button disabled={!!busy} onClick={() => confirm(`Remove ${m.email}?`) && call(m.email, "DELETE", { email: m.email }, `${m.email} removed.`)}
                  className="text-red-600 disabled:opacity-50">Remove</button>
              )}
            </li>
          );
        })}
        {members?.length === 0 && <li className="p-3 text-[var(--muted)]">No members yet.</li>}
      </ul>
    </main>
  );
}
