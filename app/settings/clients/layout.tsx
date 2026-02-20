import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function ClientsLayout({
  children,
}: { 
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const userRole = session.user.role as string;
  const hasAccess = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

  if (!hasAccess) {
    redirect("/");
  }

  return <>{children}</>;
}


