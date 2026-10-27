import { NextRequest, NextResponse } from "next/server";
import { requireMember, supabaseAdmin, supabaseConfigured } from "@/lib/auth";
import { fail } from "@/lib/http";

// Admins manage who can sign in and whether they are admin or view-only.
export async function GET() {
  try {
    await requireMember("admin");
    if (!supabaseConfigured()) return NextResponse.json({ members: [] });
    const { data, error } = await supabaseAdmin().from("members").select("email,name,role,created_at").order("created_at");
    if (error) throw error;
    return NextResponse.json({ members: data });
  } catch (e) {
    return fail(e);
  }
}

// { email, name?, role }  → adds the member and emails them a sign-in link
export async function POST(req: NextRequest) {
  try {
    const me = await requireMember("admin");
    const { email: raw, name, role } = await req.json();
    const email = String(raw || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (!["admin", "viewer"].includes(role)) return NextResponse.json({ error: "Bad role." }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from("members").upsert({ email, name: name || null, role, added_by: me.email });
    if (error) throw error;
    // Creates the auth user if new and sends the invite email; an existing user just signs in normally.
    const origin = req.nextUrl.origin;
    await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/callback` }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

// { email } → removes access. The last admin can't be removed.
export async function DELETE(req: NextRequest) {
  try {
    await requireMember("admin");
    const email = String((await req.json()).email || "").toLowerCase();
    const sb = supabaseAdmin();
    const { data: admins } = await sb.from("members").select("email").eq("role", "admin");
    if (admins?.length === 1 && admins[0].email === email) {
      return NextResponse.json({ error: "You can't remove the last admin." }, { status: 400 });
    }
    const { error } = await sb.from("members").delete().eq("email", email);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
