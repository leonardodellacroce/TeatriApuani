import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function CompaniesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const userRole = session.user.role as string;
  
  // Solo ADMIN e SUPER_ADMIN possono accedere alle aziende
  if (!["ADMIN", "SUPER_ADMIN"].includes(userRole)) {
    redirect("/");
  }

  return <>{children}</>;
}

