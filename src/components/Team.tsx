"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type M = { email: string; name: string | null; role: "admin" | "viewer"; created_at: string };

export default function Team({ me }: { me: string }) {
  const [members, setMembers] = useState<M[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [msg, setMsg] = useState("");

  const load = () => fetch("/api/team").then((r) => r.json()).then((d) => setMembers(d.members || []));
  useEffect(() => { load(); }, []);

  async function call(method: string, body: object, done: string) {
    const r = await fetch("/api/team", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setMsg(r.ok ? done : d.error);
    if (r.ok) load();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 text-[13px]">
      <Link href="/" className="text-[var(--blue)]">← Back to ads</Link>
      <h1 className="mt-3 text-lg font-semibold">Team</h1>
      <p className="text-[var(--muted)]">Admins can turn ads on/off and change budgets. View only sees everything and changes nothing.</p>

      <form
        onSubmit={(e) => { e.preventDefault(); call("POST", { email, name, role }, `Invite sent to ${email}`); setEmail(""); setName(""); }}
        className="mt-4 flex flex-wrap gap-2 rounded-lg border border-[var(--line)] bg-white p-3">
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email"
          className="min-w-0 flex-1 rounded border border-[var(--line)] px-2 py-1.5" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (optional)"
          className="min-w-0 flex-1 rounded border border-[var(--line)] px-2 py-1.5" />
        <select value={role} onChange={(e) => setRole(e.target.value as "viewer" | "admin")} className="rounded border border-[var(--line)] px-2">
          <option value="viewer">View only</option>
          <option value="admin">Admin</option>
        </select>
        <button className="rounded bg-[var(--blue)] px-3 py-1.5 text-white">Invite</button>
      </form>
      {msg && <p className="mt-2">{msg}</p>}

      <ul className="mt-4 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-white">
        {members.map((m) => (
          <li key={m.email} className="flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate">{m.name || m.email}</div>
              <div className="truncate text-[var(--muted)]">{m.email}</div>
            </div>
            <select value={m.role} onChange={(e) => call("POST", { email: m.email, name: m.name, role: e.target.value }, "Role updated")}
              className="rounded border border-[var(--line)] px-2 py-1">
              <option value="viewer">View only</option>
              <option value="admin">Admin</option>
            </select>
            {m.email !== me && (
              <button onClick={() => confirm(`Remove ${m.email}?`) && call("DELETE", { email: m.email }, "Removed")} className="text-red-600">Remove</button>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="p-3 text-[var(--muted)]">No members yet.</li>}
      </ul>
    </main>
  );
}
