"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown, Calendar, ChevronDown, ExternalLink, Folder, LayoutGrid, FileText, Plus, Copy, Pencil, Trash2,
  FlaskConical, Tag, RefreshCw, Search, Send, Inbox, Info, Users, History, LogOut, X,
} from "lucide-react";

type Level = "campaign" | "adset" | "ad";
type Metrics = { results: number; reach: number; impressions: number; spend: number; linkClicks: number; addToCart: number; videoViews3s: number };
type Row = {
  id: string; name: string; level: Level; status: string; effectiveStatus: string; campaignId: string | null; adsetId: string | null;
  dailyBudget: number | null; lifetimeBudget: number | null; budgetSource: "own" | "campaign" | null;
  thumbnail: string | null; link: string | null; m: Metrics;
};
type Account = { id: string; name: string; currency: string; timezone: string };
type Member = { email: string; name: string | null; role: "admin" | "viewer" };

const TABS: { level: Level; label: string; icon: React.ElementType }[] = [
  { level: "campaign", label: "Campaigns", icon: Folder },
  { level: "adset", label: "Ad sets", icon: LayoutGrid },
  { level: "ad", label: "Ads", icon: FileText },
];
const PRESETS: [string, string][] = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["last_7d", "Last 7 days"], ["last_14d", "Last 14 days"],
  ["last_30d", "Last 30 days"], ["this_month", "This month"], ["last_month", "Last month"], ["maximum", "Maximum"],
];
const NOUN: Record<Level, [string, string]> = { campaign: ["campaign", "campaigns"], adset: ["ad set", "ad sets"], ad: ["ad", "ads"] };

const div = (a: number, b: number) => (b > 0 ? a / b : null);

// One definition per column: value for sorting/totals, how to print it, and the grey sub-label.
type Col = { key: string; label: string; sub?: string; value: (m: Metrics) => number | null; fmt: "money" | "int" | "pct" | "money2" };
const COLS: Col[] = [
  { key: "results", label: "Results", sub: "Website purchase", value: (m) => m.results, fmt: "int" },
  { key: "reach", label: "Reach", sub: "Meta accounts", value: (m) => m.reach, fmt: "int" },
  { key: "impressions", label: "Impressions", sub: "Total", value: (m) => m.impressions, fmt: "int" },
  { key: "cpr", label: "Cost per result", sub: "Per purchase", value: (m) => div(m.spend, m.results), fmt: "money2" },
  { key: "spend", label: "Amount spent", sub: "Total spent", value: (m) => m.spend, fmt: "money" },
  { key: "cpc", label: "CPC (cost per link click)", sub: "Per action", value: (m) => div(m.spend, m.linkClicks), fmt: "money2" },
  { key: "ctr", label: "CTR (link click-through rate)", sub: "Per impressions", value: (m) => div(m.linkClicks * 100, m.impressions), fmt: "pct" },
  { key: "cpm", label: "CPM (cost per 1,000 impressions)", sub: "Per 1,000 impressions", value: (m) => div(m.spend * 1000, m.impressions), fmt: "money2" },
  { key: "cpatc", label: "Cost per add to cart", sub: "Per action", value: (m) => div(m.spend, m.addToCart), fmt: "money2" },
  { key: "hook", label: "Hook Rate", sub: "3s views ÷ impressions", value: (m) => (m.videoViews3s ? div(m.videoViews3s * 100, m.impressions) : null), fmt: "pct" },
];

function sumMetrics(rows: Row[]): Metrics {
  const t: Metrics = { results: 0, reach: 0, impressions: 0, spend: 0, linkClicks: 0, addToCart: 0, videoViews3s: 0 };
  for (const r of rows) for (const k of Object.keys(t) as (keyof Metrics)[]) t[k] += r.m[k];
  return t;
}

function statusNote(r: Row) {
  const e = r.effectiveStatus;
  if (e === "ACTIVE" || e === "PAUSED") return null;
  return ({ CAMPAIGN_PAUSED: "Campaign off", ADSET_PAUSED: "Ad set off", DISAPPROVED: "Rejected", WITH_ISSUES: "Has issues",
    PENDING_REVIEW: "In review", IN_PROCESS: "Processing", PENDING_BILLING_INFO: "Billing issue" } as Record<string, string>)[e] ?? e.toLowerCase();
}

function ago(iso: string | null, now: number) {
  if (!iso || !now) return "";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  return s < 30 ? "Updated just now" : s < 3600 ? `Updated ${Math.round(s / 60) || 1} min ago` : `Updated ${Math.round(s / 3600)} h ago`;
}

export default function AdsManager({ member, canEdit }: { member: Member; canEdit: boolean }) {
  const admin = member.role === "admin"; // team + history pages
  const edit = canEdit; // on/off + budget; off for everyone while the app is view-only
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [level, setLevel] = useState<Level>("campaign");
  const [pill, setPill] = useState<"all" | "active" | "delivery">("all");
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState("today");
  const [custom, setCustom] = useState<{ since: string; until: string } | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [accountReach, setAccountReach] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "spend", dir: -1 });
  // Selecting campaigns narrows the Ad sets and Ads tabs, like Meta's Ads Manager.
  const [selected, setSelected] = useState<Record<Level, Set<string>>>({ campaign: new Set(), adset: new Set(), ad: new Set() });
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [now, setNow] = useState(0); // set after mount: Date.now() during render breaks prerendering

  const account = accounts.find((a) => a.id === accountId);
  const money = useMemo(() => {
    const cur = account?.currency || "USD";
    const f0 = new Intl.NumberFormat("en", { style: "currency", currency: cur });
    return (v: number) => f0.format(v);
  }, [account?.currency]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch("/api/accounts").then(async (r) => {
      const d = await r.json();
      if (!r.ok) return setError(d.error || "Could not load ad accounts.");
      setAccounts(d.accounts);
      let saved = "";
      try { saved = localStorage.getItem("am.account") || ""; } catch {}
      setAccountId(d.accounts.some((a: Account) => a.id === saved) ? saved : d.accounts[0]?.id || "");
    });
  }, []);

  const load = useCallback(async (fresh = false) => {
    if (!accountId) return;
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ account: accountId, level });
    if (custom) { q.set("since", custom.since); q.set("until", custom.until); } else q.set("preset", preset);
    if (fresh) q.set("fresh", "1");
    try {
      const r = await fetch(`/api/rows?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load data from Meta.");
      setRows(d.rows);
      setAccountReach(d.accountReach);
      setFetchedAt(d.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, level, preset, custom]);

  useEffect(() => { load(); }, [load]);

  function pickAccount(id: string) {
    setAccountId(id);
    setSelected({ campaign: new Set(), adset: new Set(), ad: new Set() });
    try { localStorage.setItem("am.account", id); } catch {}
  }

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = rows;
    if (level !== "campaign" && selected.campaign.size) list = list.filter((r) => r.campaignId && selected.campaign.has(r.campaignId));
    if (level === "ad" && selected.adset.size) list = list.filter((r) => r.adsetId && selected.adset.has(r.adsetId));
    if (pill === "active") list = list.filter((r) => r.effectiveStatus === "ACTIVE");
    if (pill === "delivery") list = list.filter((r) => r.m.impressions > 0);
    if (s) list = list.filter((r) => r.name.toLowerCase().includes(s) || r.id.includes(s));
    const col = COLS.find((c) => c.key === sort.key);
    const val = (r: Row): number | string =>
      sort.key === "name" ? r.name.toLowerCase() : sort.key === "budget" ? (r.dailyBudget ?? r.lifetimeBudget ?? -1) : (col?.value(r.m) ?? -1);
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [rows, level, selected, pill, search, sort]);

  const totals = useMemo(() => sumMetrics(visible), [visible]);
  const filteredView = visible.length !== rows.length;

  function fmt(c: Col, m: Metrics) {
    const v = c.value(m);
    if (v == null || (v === 0 && c.key !== "spend")) return "—";
    if (c.fmt === "int") return Math.round(v).toLocaleString("en");
    if (c.fmt === "pct") return `${v.toFixed(2)}%`;
    return money(v);
  }

  async function post(id: string, body: object) {
    const r = await fetch(`/api/objects/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Meta refused the change.");
  }

  async function toggle(r: Row) {
    if (!edit) return;
    const next = r.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: next, effectiveStatus: next === "PAUSED" ? "PAUSED" : x.effectiveStatus } : x)));
    try {
      await post(r.id, { action: "status", status: next });
      setToast(`${r.name} turned ${next === "ACTIVE" ? "on" : "off"}`);
      load(true);
    } catch (e) {
      setRows((rs) => rs.map((x) => (x.id === r.id ? r : x)));
      setToast(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveBudget(r: Row) {
    if (!editing) return;
    const amount = Number(editing.value.replace(/[^0-9.]/g, ""));
    const kind = r.dailyBudget != null ? "daily_budget" : "lifetime_budget";
    const old = r.dailyBudget ?? r.lifetimeBudget;
    setEditing(null);
    if (!(amount > 0) || amount === old) return;
    if (old && (amount > old * 2 || amount < old / 2) && !confirm(`Change budget from ${money(old)} to ${money(amount)}? That's a big jump.`)) return;
    try {
      await post(r.id, { action: "budget", kind, amount });
      setToast(`Budget for ${r.name} set to ${money(amount)}`);
      load(true);
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const sel = selected[level];
  const allChecked = visible.length > 0 && visible.every((r) => sel.has(r.id));
  function check(id: string) {
    setSelected((s) => {
      const n = new Set(s[level]);
      if (n.has(id)) n.delete(id); else n.add(id);
      return { ...s, [level]: n };
    });
  }
  function checkAll() {
    setSelected((s) => ({ ...s, [level]: allChecked ? new Set() : new Set(visible.map((r) => r.id)) }));
  }
  const dateLabel = custom ? `${custom.since} – ${custom.until}` : PRESETS.find((p) => p[0] === preset)?.[1];
  const nameCol = level === "campaign" ? "Campaign" : level === "adset" ? "Ad set" : "Ad";
  const soleSelected = sel.size === 1 ? visible.find((r) => sel.has(r.id)) : undefined;

  // plain function, not a component: a component declared in render would remount every time
  const th = (k: string, children: React.ReactNode) => (
    <th key={k} className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 text-right font-medium">
      <button onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : -1 }))} className="inline-flex items-center gap-1 hover:text-[var(--blue)]">
        {children} <ArrowUpDown size={11} className={sort.key === k ? "text-[var(--blue)]" : "text-[var(--muted)]"} />
      </button>
    </th>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[13px] text-[var(--fg)]">
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-6">
        <h1 className="text-lg font-semibold">{TABS.find((t) => t.level === level)?.label}</h1>
        <label className="relative flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5">
          <Folder size={14} className="text-[var(--muted)]" />
          <select value={accountId} onChange={(e) => pickAccount(e.target.value)} className="appearance-none bg-transparent pr-5 outline-none" aria-label="Ad account">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id.slice(4)})</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 text-[var(--muted)]" />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[var(--muted)]">{loading ? "Updating…" : ago(fetchedAt, now)}</span>
          <button onClick={() => load(true)} title="Refresh from Meta" className="rounded-md border border-[var(--line)] bg-white p-1.5 hover:bg-[var(--hover)]">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          {!edit && <span className="rounded-md border border-[var(--line)] bg-[var(--hover)] px-2.5 py-1.5 text-[var(--muted)]">View only</span>}
          {admin && (
            <>
              <a href="/history" className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 hover:bg-[var(--hover)]"><History size={14} />History</a>
              <a href="/team" className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 hover:bg-[var(--hover)]"><Users size={14} />Team</a>
            </>
          )}
          <form action="/auth/signout" method="post">
            <button title={`Sign out ${member.email}`} className="rounded-md border border-[var(--line)] bg-white p-1.5 hover:bg-[var(--hover)]"><LogOut size={14} /></button>
          </form>
        </div>
      </header>

      {/* filter pills + search */}
      <div className="flex flex-wrap gap-2 px-4 pt-3 sm:px-6">
        {([["all", "All ads", Inbox], ["active", "Active ads", Send], ["delivery", "Had delivery", Inbox]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setPill(k)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${pill === k ? "border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]" : "border-[var(--line)] bg-white"}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>
      <div className="px-4 pt-2 sm:px-6">
        <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2">
          <Search size={14} className="text-[var(--muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or ID" className="w-full bg-transparent outline-none" />
          {search && <button onClick={() => setSearch("")}><X size={14} /></button>}
        </label>
      </div>

      {/* tabs + date */}
      <div className="flex flex-wrap items-end gap-2 px-4 pt-3 sm:px-6">
        <div className="flex gap-1">
          {TABS.map(({ level: l, label, icon: Icon }) => {
            const n = selected[l].size;
            return (
              <button key={l} onClick={() => setLevel(l)}
                className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-4 py-2 ${level === l ? "border-[var(--line)] bg-white font-medium text-[var(--blue)]" : "border-transparent bg-[var(--tab)]"}`}>
                <Icon size={14} />{label}
                {n > 0 && (
                  <span className="ml-1 flex items-center gap-1 rounded bg-[var(--blue)] px-1.5 text-[11px] text-white">
                    {n} selected
                    <X size={11} onClick={(e) => { e.stopPropagation(); setSelected((s) => ({ ...s, [l]: new Set() })); }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto mb-1">
          <button onClick={() => setDateOpen((o) => !o)} className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5">
            <Calendar size={14} />{dateLabel}<ChevronDown size={14} />
          </button>
          {dateOpen && (
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-[var(--line)] bg-white p-2 shadow-lg">
              {PRESETS.map(([k, label]) => (
                <button key={k} onClick={() => { setPreset(k); setCustom(null); setDateOpen(false); }}
                  className={`block w-full rounded px-2 py-1.5 text-left hover:bg-[var(--hover)] ${!custom && preset === k ? "text-[var(--blue)]" : ""}`}>{label}</button>
              ))}
              <CustomRange onApply={(r) => { setCustom(r); setDateOpen(false); }} />
            </div>
          )}
        </div>
      </div>

      {/* table card */}
      <div className="mx-4 mb-24 rounded-b-lg rounded-tr-lg border border-[var(--line)] bg-white sm:mx-6">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--line)] p-2">
          {/* v1 does on/off and budget; the rest is shown, like the reference, but not wired yet */}
          <button disabled title="Not in v1" className="flex items-center gap-1 rounded-md bg-[var(--green)] px-3 py-1.5 font-medium text-white opacity-50"><Plus size={14} />Create</button>
          <button disabled title="Not in v1" className="flex items-center gap-1 rounded-md border border-[var(--line)] px-2.5 py-1.5 opacity-50"><Copy size={14} />Duplicate<ChevronDown size={13} /></button>
          <button
            disabled={!edit || !soleSelected || soleSelected.budgetSource !== "own"}
            title={!edit ? "View only" : "Edit the budget of the one selected item"}
            onClick={() => soleSelected && setEditing({ id: soleSelected.id, value: String(soleSelected.dailyBudget ?? soleSelected.lifetimeBudget ?? "") })}
            className="flex items-center gap-1 rounded-md border border-[var(--line)] px-2.5 py-1.5 hover:bg-[var(--hover)] disabled:opacity-50">
            <Pencil size={14} />Edit
          </button>
          <button disabled title="Not in v1" className="rounded-md border border-[var(--line)] p-1.5 opacity-50"><Trash2 size={14} /></button>
          <button disabled title="Not in v1" className="flex items-center gap-1 rounded-md border border-[var(--line)] px-2.5 py-1.5 opacity-50"><FlaskConical size={14} />A/B test</button>
          <button disabled title="Not in v1" className="rounded-md border border-[var(--line)] p-1.5 opacity-50"><Tag size={14} /></button>
        </div>

        {error && <div className="m-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-white text-[12px]">
              <tr>
                <th className="w-9 border-b border-[var(--line)] px-3"><input type="checkbox" checked={allChecked} onChange={checkAll} aria-label="Select all" /></th>
                <th className="border-b border-[var(--line)] px-2 py-2 text-left font-medium">Off/On</th>
                <th className="sticky left-0 min-w-[260px] border-b border-r border-[var(--line)] bg-white px-3 py-2 text-left font-medium">
                  <button onClick={() => setSort((s) => ({ key: "name", dir: s.key === "name" ? (-s.dir as 1 | -1) : 1 }))} className="inline-flex items-center gap-1">
                    {nameCol} <ArrowUpDown size={11} className={sort.key === "name" ? "text-[var(--blue)]" : "text-[var(--muted)]"} />
                  </button>
                </th>
                {COLS.map((c) => th(c.key, c.label))}
                {level !== "ad" && th("budget", "Budget")}
              </tr>
            </thead>
            <tbody>
              {!loading && !error && visible.length === 0 && (
                <tr><td colSpan={COLS.length + 4} className="p-8 text-center text-[var(--muted)]">No {NOUN[level][1]} match.</td></tr>
              )}
              {visible.map((r) => {
                const note = statusNote(r);
                const budget = r.dailyBudget ?? r.lifetimeBudget;
                return (
                  <tr key={r.id} className={`align-top hover:bg-[var(--hover)] ${sel.has(r.id) ? "bg-[var(--blue-soft)]" : ""}`}>
                    <td className="border-b border-[var(--line)] px-3"><input type="checkbox" checked={sel.has(r.id)} onChange={() => check(r.id)} aria-label={`Select ${r.name}`} /></td>
                    <td className="border-b border-[var(--line)] px-2">
                      <button role="switch" aria-checked={r.status === "ACTIVE"} disabled={!edit} onClick={() => toggle(r)}
                        title={edit ? (r.status === "ACTIVE" ? "Turn off" : "Turn on") : r.status === "ACTIVE" ? "On" : "Off"}
                        className={`relative h-5 w-9 rounded-full transition ${r.status === "ACTIVE" ? "bg-[var(--blue)]" : "bg-gray-300"} ${edit ? "" : "cursor-default"}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${r.status === "ACTIVE" ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="sticky left-0 max-w-[340px] border-b border-r border-[var(--line)] bg-inherit px-3 py-2">
                      <div className="flex items-center gap-2">
                        {level === "ad" && (r.thumbnail
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={r.thumbnail} alt="" className="h-8 w-8 flex-none rounded object-cover" />
                          : <span className="h-8 w-8 flex-none rounded bg-[var(--tab)]" />)}
                        <div className="min-w-0">
                          <div className="truncate" title={r.name}>{r.name}</div>
                          <div className="text-[11px] text-[var(--muted)]">{r.id}{note ? ` · ${note}` : ""}</div>
                        </div>
                        {r.link && <a href={r.link} target="_blank" rel="noreferrer" title="Open ad preview" className="ml-auto flex-none text-[var(--muted)] hover:text-[var(--blue)]"><ExternalLink size={14} /></a>}
                      </div>
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key} className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 text-right tabular-nums">
                        <div>{fmt(c, r.m)}</div>
                        {c.sub && <div className="text-[11px] text-[var(--muted)]">{c.sub}</div>}
                      </td>
                    ))}
                    {level !== "ad" && (
                      <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 text-right tabular-nums">
                        {r.budgetSource === "campaign" ? <span className="text-[var(--muted)]">Using campaign budget</span>
                          : budget == null ? "—"
                          : editing?.id === r.id ? (
                            <input autoFocus value={editing.value} onChange={(e) => setEditing({ id: r.id, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") saveBudget(r); if (e.key === "Escape") setEditing(null); }}
                              onBlur={() => saveBudget(r)} className="w-24 rounded border border-[var(--blue)] px-1 text-right" />
                          ) : (
                            <button disabled={!edit} onClick={() => setEditing({ id: r.id, value: String(budget) })}
                              className={edit ? "rounded px-1 hover:bg-[var(--blue-soft)]" : ""} title={edit ? "Click to change" : undefined}>
                              <div>{money(budget)}</div>
                              <div className="text-[11px] text-[var(--muted)]">{r.dailyBudget != null ? "Daily" : "Lifetime"}</div>
                            </button>
                          )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {visible.length > 0 && (
              <tfoot className="bg-[var(--bg)] font-medium">
                <tr>
                  <td /><td />
                  <td className="sticky left-0 border-r border-[var(--line)] bg-[var(--bg)] px-3 py-2">
                    <span className="inline-flex items-center gap-1">Results from {visible.length} {NOUN[level][visible.length === 1 ? 0 : 1]}
                      <span title="Totals of the rows shown. Reach is de-duplicated by Meta for the whole account."><Info size={12} /></span>
                    </span>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {c.key === "reach" ? (filteredView ? "—" : accountReach ? accountReach.toLocaleString("en") : "—") : fmt(c, totals)}
                      {c.sub && <div className="text-[11px] font-normal text-[var(--muted)]">{c.key === "reach" ? "Accounts Center accounts" : c.sub}</div>}
                    </td>
                  ))}
                  {level !== "ad" && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function CustomRange({ onApply }: { onApply: (r: { since: string; until: string }) => void }) {
  // empty = today, filled in on Apply (reading the date during render breaks prerendering)
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  return (
    <div className="mt-2 border-t border-[var(--line)] pt-2">
      <div className="mb-1 text-[11px] text-[var(--muted)]">Custom range</div>
      <div className="flex gap-1">
        <input type="date" value={since} max={until || undefined} onChange={(e) => setSince(e.target.value)} className="w-full rounded border border-[var(--line)] px-1" />
        <input type="date" value={until} min={since || undefined} onChange={(e) => setUntil(e.target.value)} className="w-full rounded border border-[var(--line)] px-1" />
      </div>
      <button onClick={() => { const today = new Date().toISOString().slice(0, 10); onApply({ since: since || today, until: until || today }); }} className="mt-2 w-full rounded bg-[var(--blue)] py-1 text-white">Apply</button>
    </div>
  );
}
