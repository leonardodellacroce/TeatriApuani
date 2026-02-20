import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const userRole = session.user.role as string;
  const hasAccess = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);

  if (!hasAccess) {
    redirect("/");
  }

  return <>{children}</>;
}

