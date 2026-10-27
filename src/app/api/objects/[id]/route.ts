import { NextRequest, NextResponse } from "next/server";
import { audit, editingEnabled, requireMember } from "@/lib/auth";
import { clearCache, getAccount, getObject, minorFactor, setBudget, setStatus } from "@/lib/meta";
import { fail } from "@/lib/http";

// POST /api/objects/:id  — admins only.
//   { action: "status", status: "ACTIVE" | "PAUSED" }
//   { action: "budget", kind: "daily_budget" | "lifetime_budget", amount: 120.5 }   (major units)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let actor = "?", before: unknown = null, after: unknown = null, accountId = "", name = "";
  const { id } = await ctx.params;
  try {
    actor = (await requireMember("admin")).email;
    if (!editingEnabled()) return NextResponse.json({ error: "Editing is turned off: this app is view-only." }, { status: 403 });
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
    const body = await req.json();

    // Re-read the object from Meta: proves it belongs to an account this app manages,
    // and gives the audit log a true "before" value.
    const obj = await getObject(id);
    accountId = `act_${obj.account_id}`;
    name = obj.name;
    const acc = await getAccount(accountId);

    if (body.action === "status") {
      if (!["ACTIVE", "PAUSED"].includes(body.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
      before = obj.status;
      after = body.status;
      await setStatus(id, body.status);
    } else if (body.action === "budget") {
      const kind = body.kind;
      const amount = Number(body.amount);
      if (!["daily_budget", "lifetime_budget"].includes(kind) || !(amount > 0) || amount > 1_000_000) {
        return NextResponse.json({ error: "Enter a budget above 0." }, { status: 400 });
      }
      if (obj[kind as "daily_budget"] == null) {
        return NextResponse.json({ error: "This item doesn't have that kind of budget (it may use the campaign's budget)." }, { status: 400 });
      }
      const f = minorFactor(acc.currency);
      before = Number(obj[kind as "daily_budget"]) / f;
      after = amount;
      await setBudget(id, kind, amount * f);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    clearCache(accountId);
    await audit({ actor, account_id: accountId, object_id: id, object_name: name, action: body.action, before, after, ok: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (actor !== "?" && accountId) {
      await audit({ actor, account_id: accountId, object_id: id, object_name: name, action: "failed", before, after, ok: false,
        error: e instanceof Error ? e.message : String(e) });
    }
    return fail(e);
  }
}
