import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Solo SUPER_ADMIN può accedere agli Utenti di Gestione.
 * ADMIN e RESPONSABILE vengono reindirizzati alle impostazioni.
 */
export default async function ManagementUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const role = session.user.role as string;
  if (role !== "SUPER_ADMIN") {
    redirect("/settings");
  }

  return <>{children}</>;
}
