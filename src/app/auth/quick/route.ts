import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured, supabaseServer } from "@/lib/auth";

// Email-only sign-in (Roan's call, 2026-10-27: the app is view-only, so typing an invited email is
// enough — no link, code or password). Anyone who knows a member's email can get in; that trade-off
// was explained and accepted. Members only: everyone else gets "not invited".
//
// How: mint a one-time magic-link token server-side and redeem it straight away, which sets the
// normal Supabase session cookies. Nothing is emailed.
export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "Sign-in isn't set up." }, { status: 500 });
  const email = String((await req.json().catch(() => ({}))).email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Enter your email." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: member } = await admin.from("members").select("email").eq("email", email).maybeSingle();
  if (!member) return NextResponse.json({ error: "This email hasn't been invited. Ask an admin." }, { status: 403 });

  // members added straight to the table (e.g. the first admin) may not have an auth user yet
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return NextResponse.json({ error: linkError?.message || "Couldn't sign you in. Try again." }, { status: 502 });
  }
  const { error } = await (await supabaseServer()).auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
