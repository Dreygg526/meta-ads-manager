import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";

// Magic-link / invite landing: swaps the one-time code for a session cookie.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) await (await supabaseServer()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/", req.url));
}
