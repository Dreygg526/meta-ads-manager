import "server-only";

// Everything that talks to Meta lives here. META_ACCESS_TOKEN never leaves the server:
// the browser only ever sees the rows this file builds.
//
// v1 runs on Roan's user token (expires 2026-11-09, reaches the accounts Roan's Facebook
// user can see). Swapping to a System User token is an env change, nothing else.

const VERSION = process.env.META_API_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

export type Level = "campaign" | "adset" | "ad";
export const LEVELS: Level[] = ["campaign", "adset", "ad"];

export type DateRange = { preset: string } | { since: string; until: string };
export const PRESETS = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"];

export type Account = { id: string; name: string; currency: string; timezone: string; status: number };

export type Row = {
  id: string;
  name: string;
  level: Level;
  status: string; // configured: ACTIVE / PAUSED
  effectiveStatus: string; // what Meta is actually doing: ACTIVE, CAMPAIGN_PAUSED, DISAPPROVED…
  campaignId: string | null;
  adsetId: string | null;
  dailyBudget: number | null; // major units (e.g. dollars)
  lifetimeBudget: number | null;
  budgetSource: "own" | "campaign" | null; // ad set under a CBO campaign → "campaign"
  thumbnail: string | null;
  link: string | null;
  m: Metrics;
};

export type Metrics = {
  results: number;
  reach: number;
  impressions: number;
  spend: number;
  linkClicks: number;
  addToCart: number;
  videoViews3s: number;
};

const EMPTY: Metrics = { results: 0, reach: 0, impressions: 0, spend: 0, linkClicks: 0, addToCart: 0, videoViews3s: 0 };

// Statuses Meta still shows in Ads Manager by default (deleted/archived are hidden there too).
const LIVE_STATUSES = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES",
  "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO"];

export class MetaError extends Error {
  constructor(message: string, public status = 502, public code?: number) {
    super(message);
  }
}

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new MetaError("Server is missing META_ACCESS_TOKEN.", 500);
  return t;
}

async function graph(path: string, params: Record<string, string> = {}, init?: RequestInit) {
  const url = path.startsWith("http") ? new URL(path) : new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, ...(init?.headers || {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    // 190 = token expired/invalid: say so plainly, it's the one error someone has to act on.
    const msg = e.code === 190 ? "The Meta token has expired or was revoked. Generate a new one and update META_ACCESS_TOKEN."
      : e.error_user_msg || e.message || `Meta returned HTTP ${res.status}`;
    throw new MetaError(msg, e.code === 190 ? 401 : res.status >= 400 ? res.status : 502, e.code);
  }
  return body;
}

// Follows paging.next until the edge is exhausted.
async function graphAll(path: string, params: Record<string, string>) {
  const out: Record<string, unknown>[] = [];
  let page = await graph(path, { limit: "500", ...params });
  for (;;) {
    out.push(...(page.data || []));
    if (!page.paging?.next) break;
    page = await graph(page.paging.next);
  }
  return out;
}

// Short in-memory cache so tab switches and sorting don't hammer Meta's rate limits.
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 60_000;
async function cached<T>(key: string, fn: () => Promise<T>, fresh = false): Promise<T> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}
export function clearCache(accountId?: string) {
  for (const k of cache.keys()) if (!accountId || k.includes(accountId)) cache.delete(k);
}

// ---- accounts ----------------------------------------------------------------------------

export async function listAccounts(): Promise<Account[]> {
  return cached("accounts", async () => {
    const rows = await graphAll("me/adaccounts", { fields: "name,account_id,currency,timezone_name,account_status" });
    const allow = (process.env.META_ACCOUNT_IDS || "").split(",").map((s) => s.trim().replace(/^act_/, "")).filter(Boolean);
    return rows
      .map((a) => ({
        id: `act_${a.account_id}`,
        name: String(a.name),
        currency: String(a.currency),
        timezone: String(a.timezone_name),
        status: Number(a.account_status),
      }))
      // 1 = active. Disabled accounts can't be managed, so they don't clutter the picker.
      .filter((a) => (allow.length ? allow.includes(a.id.slice(4)) : a.status === 1))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function getAccount(accountId: string): Promise<Account> {
  const acc = (await listAccounts()).find((a) => a.id === accountId);
  if (!acc) throw new MetaError("That ad account isn't available in this app.", 403);
  return acc;
}

// Meta stores money in the currency's minor unit (cents, pence); zero-decimal currencies use 1.
export function minorFactor(currency: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}

// ---- rows -------------------------------------------------------------------------------

function rangeParams(range: DateRange): Record<string, string> {
  return "preset" in range
    ? { date_preset: range.preset }
    : { time_range: JSON.stringify({ since: range.since, until: range.until }) };
}

function actionValue(actions: { action_type: string; value: string }[] | undefined, ...types: string[]) {
  if (!actions) return 0;
  for (const t of types) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

function toMetrics(r: Record<string, unknown>): Metrics {
  const actions = r.actions as { action_type: string; value: string }[] | undefined;
  return {
    // "purchase" is Meta's de-duplicated purchase count, the one Ads Manager shows as Results.
    results: actionValue(actions, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"),
    reach: Number(r.reach) || 0,
    impressions: Number(r.impressions) || 0,
    spend: Number(r.spend) || 0,
    linkClicks: Number(r.inline_link_clicks) || 0,
    addToCart: actionValue(actions, "add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"),
    videoViews3s: actionValue(actions, "video_view"),
  };
}

const INSIGHT_FIELDS = "campaign_id,adset_id,ad_id,reach,impressions,spend,inline_link_clicks,actions";

const OBJECT_FIELDS: Record<Level, string> = {
  campaign: "name,status,effective_status,daily_budget,lifetime_budget",
  adset: "name,status,effective_status,campaign_id,daily_budget,lifetime_budget,campaign{daily_budget,lifetime_budget}",
  // creative + preview link cost ~7 s per 500 ads, so they're fetched separately (see addAdMedia)
  ad: "name,status,effective_status,campaign_id,adset_id",
};

// Thumbnails and preview links, only for the ads someone will actually look at.
// ?ids= takes up to 50 ids per call; a few calls run at once.
async function addAdMedia(ids: string[]) {
  const out = new Map<string, { thumbnail: string | null; link: string | null }>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const worker = async () => {
    for (let c = chunks.shift(); c; c = chunks.shift()) {
      const res = await graph("", { ids: c.join(","), fields: "creative{thumbnail_url,image_url},preview_shareable_link" });
      for (const [id, o] of Object.entries(res as Record<string, Record<string, unknown>>)) {
        const cr = o.creative as Record<string, unknown> | undefined;
        out.set(id, {
          thumbnail: (cr?.thumbnail_url as string) || (cr?.image_url as string) || null,
          link: (o.preview_shareable_link as string) || null,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

const EDGE: Record<Level, string> = { campaign: "campaigns", adset: "adsets", ad: "ads" };

export async function getRows(accountId: string, level: Level, range: DateRange, fresh = false) {
  const acc = await getAccount(accountId);
  const f = minorFactor(acc.currency);
  const money = (v: unknown) => (v == null || v === "" ? null : Number(v) / f);
  const key = `rows:${accountId}:${level}:${JSON.stringify(range)}`;

  return cached(key, async () => {
    const [objects, insights, totals] = await Promise.all([
      graphAll(`${accountId}/${EDGE[level]}`, {
        fields: OBJECT_FIELDS[level],
        effective_status: JSON.stringify(LIVE_STATUSES),
      }),
      graphAll(`${accountId}/insights`, { level, fields: INSIGHT_FIELDS, ...rangeParams(range) }),
      // account-level row: the only correct total for Reach (reach doesn't add up across rows)
      graph(`${accountId}/insights`, { fields: "reach", ...rangeParams(range) }),
    ]);

    const byId = new Map<string, Metrics>();
    for (const r of insights) byId.set(String(r[`${level}_id`]), toMetrics(r));

    // Media for ads that are on or delivered in this range; the rest show a blank square.
    const media = level === "ad"
      ? await addAdMedia(objects.filter((o) => o.effective_status === "ACTIVE" || byId.has(String(o.id))).map((o) => String(o.id)))
      : new Map<string, { thumbnail: string | null; link: string | null }>();

    const rows: Row[] = objects.map((o) => {
      const campaign = o.campaign as Record<string, unknown> | undefined;
      const md = media.get(String(o.id));
      const ownBudget = o.daily_budget != null || o.lifetime_budget != null;
      const cbo = level === "adset" && !ownBudget && (campaign?.daily_budget != null || campaign?.lifetime_budget != null);
      return {
        id: String(o.id),
        name: String(o.name),
        level,
        status: String(o.status),
        effectiveStatus: String(o.effective_status),
        campaignId: level === "campaign" ? String(o.id) : (o.campaign_id as string) ?? null,
        adsetId: level === "adset" ? String(o.id) : (o.adset_id as string) ?? null,
        dailyBudget: money(o.daily_budget),
        lifetimeBudget: money(o.lifetime_budget),
        budgetSource: level === "ad" ? null : cbo ? "campaign" : ownBudget ? "own" : null,
        thumbnail: md?.thumbnail ?? null,
        link: md?.link ?? null,
        m: byId.get(String(o.id)) ?? { ...EMPTY },
      };
    });

    return {
      account: acc,
      rows,
      accountReach: Number(totals.data?.[0]?.reach) || 0,
      fetchedAt: new Date().toISOString(),
    };
  }, fresh);
}

// ---- writes (admins only; checked by the route) ----------------------------------------

export async function getObject(id: string) {
  // account_id proves the object belongs to an account this app manages
  const o = await graph(id, { fields: "name,status,account_id,daily_budget,lifetime_budget" }).catch(async (e) => {
    // ads have no budget fields; retry without them
    if (e instanceof MetaError) return graph(id, { fields: "name,status,account_id" });
    throw e;
  });
  return o as { id: string; name: string; status: string; account_id: string; daily_budget?: string; lifetime_budget?: string };
}

export async function setStatus(id: string, status: "ACTIVE" | "PAUSED") {
  await graph(id, {}, { method: "POST", body: new URLSearchParams({ status }) });
}

export async function setBudget(id: string, kind: "daily_budget" | "lifetime_budget", minorUnits: number) {
  await graph(id, {}, { method: "POST", body: new URLSearchParams({ [kind]: String(Math.round(minorUnits)) }) });
}
