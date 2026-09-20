import { getCurrentUser } from "@/lib/auth/get-user";
import { redirect } from "next/navigation";
import DashboardPage from "@/components/receipts/DashboardPage";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return <DashboardPage />;
}
