import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { listAccounts } from "@/lib/meta";
import { fail } from "@/lib/http";

export async function GET() {
  try {
    await requireMember();
    return NextResponse.json({ accounts: await listAccounts() });
  } catch (e) {
    return fail(e);
  }
}
