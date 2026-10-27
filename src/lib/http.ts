import "server-only";
import { NextResponse } from "next/server";
import { MetaError } from "./meta";
import { AuthError } from "./auth";

// One place that turns thrown errors into JSON the UI can show.
export function fail(e: unknown) {
  if (e instanceof AuthError || e instanceof MetaError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}
