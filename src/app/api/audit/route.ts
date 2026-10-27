import { NextResponse } from "next/server";
import { requireMember, supabaseAdmin, supabaseConfigured } from "@/lib/auth";
import { fail } from "@/lib/http";

// Last 200 changes made through the app (who, what, before → after).
export async function GET() {
  try {
    await requireMember("admin");
    if (!supabaseConfigured()) return NextResponse.json({ entries: [] });
    const { data, error } = await supabaseAdmin().from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ entries: data });
  } catch (e) {
    return fail(e);
  }
}
