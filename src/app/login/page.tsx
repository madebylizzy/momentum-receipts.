import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth/get-user";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="py-12">
      <LoginForm />
    </div>
  );
}
