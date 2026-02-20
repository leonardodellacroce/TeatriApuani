import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AreasDutiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  // Solo SUPER_ADMIN può accedere
  const userRole = session.user.role as string;
  const isSuperAdmin = userRole === "SUPER_ADMIN";
  
  if (!isSuperAdmin) {
    redirect("/");
  }

  return <>{children}</>;
}


