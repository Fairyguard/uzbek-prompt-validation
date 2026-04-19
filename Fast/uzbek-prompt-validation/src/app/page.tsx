import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { firstRoleHome } from "@/lib/rbac";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  redirect(firstRoleHome(session.user.roles));
}
