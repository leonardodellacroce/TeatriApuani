"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Redirect: "Le Mie Ore" è stata integrata in "I Miei Turni"
export default function TimeEntriesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/my-shifts");
  }, [router]);
  return null;
}
