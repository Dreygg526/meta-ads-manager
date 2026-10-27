import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import Team from "@/components/Team";

export default async function TeamPage() {
  const m = await currentMember();
  if (!m) redirect("/login");
  if (m.role !== "admin") redirect("/");
  return <Team me={m.email} />;
}
