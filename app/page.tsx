import { redirect } from "next/navigation";

export default function Home() {
  // Home rimossa: la nuova home è la dashboard
  redirect("/dashboard");
}
