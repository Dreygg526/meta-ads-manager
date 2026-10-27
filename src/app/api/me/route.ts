import { NextResponse } from "next/server";
import { currentMember } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ member: await currentMember() });
}
