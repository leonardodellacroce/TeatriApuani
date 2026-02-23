"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/** Redirect alla pagina impostazioni notifiche, tab Notifiche di sistema */
export default function NotificationSystemPage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    router.replace("/settings/notifications?tab=system");
  }, [status, router]);

  return null;
}
