import { redirect } from "next/navigation";
import { currentMember, editingEnabled } from "@/lib/auth";
import AdsManager from "@/components/AdsManager";

export default async function Home() {
  const member = await currentMember();
  if (!member) redirect("/login");
  return <AdsManager member={member} canEdit={editingEnabled() && member.role === "admin"} />;
}
