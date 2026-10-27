import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/auth";

// Called by /login before it asks Supabase for a magic link.
// Sign-ups are closed, so a member added straight to the `members` table (e.g. the first admin
// from schema.sql) has no auth user yet and Supabase would refuse the link. If the email is a
// member, create the auth user (no email sent). Answers the same either way, so the endpoint
// doesn't reveal who is on the team.
export async function POST(req: NextRequest) {
  if (supabaseConfigured()) {
    const email = String((await req.json().catch(() => ({}))).email || "").trim().toLowerCase();
    if (email) {
      const sb = supabaseAdmin();
      const { data: m } = await sb.from("members").select("email").eq("email", email).maybeSingle();
      if (m) await sb.auth.admin.createUser({ email, email_confirm: true }).catch(() => {}); // "already registered" is fine
    }
  }
  return NextResponse.json({ ok: true });
}
