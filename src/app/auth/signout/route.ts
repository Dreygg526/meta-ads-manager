import { NextRequest, NextResponse } from "next/server";
import { supabaseConfigured, supabaseServer } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (supabaseConfigured()) await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
