import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Who is signed in, and what they may do.
// - Sign-in: Supabase magic link, invite-only (shouldCreateUser: false).
// - Role: the `members` table — "admin" can switch things on/off and change budgets,
//   "viewer" (creative strategists, VAs) sees everything and changes nothing.
// Roles are checked again in every write route; the UI hiding buttons is only cosmetic.

export type Role = "admin" | "viewer";
export type Member = { email: string; name: string | null; role: Role };

export const supabaseConfigured = () =>
  !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Local testing before Supabase exists. Never active in a production build.
const devBypass = () => process.env.NODE_ENV === "development" && !supabaseConfigured();

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}

export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function currentMember(): Promise<Member | null> {
  if (devBypass()) return { email: "dev@localhost", name: "Local dev", role: (process.env.DEV_ROLE as Role) || "admin" };
  if (!supabaseConfigured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: m } = await supabaseAdmin().from("members").select("email,name,role").eq("email", email).maybeSingle();
  return (m as Member) ?? null; // signed in but removed from the team → no access
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// On/off + budget editing is built but switched off: the boss wants view-only, like the reference
// recording (2026-10-27). Turn on with ADS_EDITING=on, once the token has Advertiser access.
export const editingEnabled = () => process.env.ADS_EDITING === "on";

export async function requireMember(role?: Role) {
  const m = await currentMember();
  if (!m) throw new AuthError("Not signed in.", 401);
  if (role === "admin" && m.role !== "admin") throw new AuthError("View-only access: you can't change ads.", 403);
  return m;
}

export async function audit(entry: {
  actor: string; account_id: string; object_id: string; object_name: string;
  action: string; before: unknown; after: unknown; ok: boolean; error?: string;
}) {
  if (!supabaseConfigured()) {
    console.log("[audit]", JSON.stringify(entry));
    return;
  }
  const { error } = await supabaseAdmin().from("audit_log").insert(entry);
  if (error) console.error("[audit] insert failed", error.message);
}
