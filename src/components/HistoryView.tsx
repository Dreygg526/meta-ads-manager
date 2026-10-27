"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type E = {
  id: number; created_at: string; actor: string; account_id: string; object_id: string; object_name: string;
  action: string; before: unknown; after: unknown; ok: boolean; error: string | null;
};

export default function HistoryView() {
  const [entries, setEntries] = useState<E[]>([]);
  useEffect(() => { fetch("/api/audit").then((r) => r.json()).then((d) => setEntries(d.entries || [])); }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 text-[13px]">
      <Link href="/" className="text-[var(--blue)]">← Back to ads</Link>
      <h1 className="mt-3 text-lg font-semibold">Change history</h1>
      <p className="text-[var(--muted)]">Every on/off and budget change made through this app, newest first.</p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
        <table className="w-full">
          <thead>
            <tr className="text-left">
              {["When", "Who", "What", "Change", ""].map((h) => <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2">{new Date(e.created_at).toLocaleString()}</td>
                <td className="border-b border-[var(--line)] px-3 py-2">{e.actor}</td>
                <td className="border-b border-[var(--line)] px-3 py-2">
                  <div>{e.object_name}</div>
                  <div className="text-[var(--muted)]">{e.object_id} · {e.account_id}</div>
                </td>
                <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2">{e.action}: {String(e.before)} → {String(e.after)}</td>
                <td className="border-b border-[var(--line)] px-3 py-2">
                  {e.ok ? "✓" : <span className="text-red-600" title={e.error || ""}>failed</span>}
                </td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-[var(--muted)]">No changes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
