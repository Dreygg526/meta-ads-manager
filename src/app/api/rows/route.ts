import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { getRows, LEVELS, PRESETS, type DateRange, type Level } from "@/lib/meta";
import { fail } from "@/lib/http";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/rows?account=act_…&level=campaign|adset|ad&preset=last_7d  (or &since=…&until=…)&fresh=1
export async function GET(req: NextRequest) {
  try {
    await requireMember();
    const q = req.nextUrl.searchParams;
    const account = q.get("account") || "";
    const level = q.get("level") as Level;
    if (!/^act_\d+$/.test(account) || !LEVELS.includes(level)) {
      return NextResponse.json({ error: "Bad account or level." }, { status: 400 });
    }
    const since = q.get("since"), until = q.get("until");
    let range: DateRange;
    if (since && until) {
      if (!DAY.test(since) || !DAY.test(until)) return NextResponse.json({ error: "Bad date." }, { status: 400 });
      range = { since, until };
    } else {
      const preset = q.get("preset") || "today";
      if (!PRESETS.includes(preset)) return NextResponse.json({ error: "Bad date preset." }, { status: 400 });
      range = { preset };
    }
    return NextResponse.json(await getRows(account, level, range, q.get("fresh") === "1"));
  } catch (e) {
    return fail(e);
  }
}
