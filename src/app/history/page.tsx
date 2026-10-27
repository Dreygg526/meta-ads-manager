import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import HistoryView from "@/components/HistoryView";

export default async function HistoryPage() {
  const m = await currentMember();
  if (!m) redirect("/login");
  if (m.role !== "admin") redirect("/");
  return <HistoryView />;
}
