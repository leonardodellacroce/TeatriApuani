import DashboardShell from "./DashboardShell";

/** Caricamento minimale: shell + placeholder leggero, nessuna animazione. */
export default function PageSkeleton() {
  return (
    <DashboardShell>
      <div className="flex items-center justify-center min-h-[12rem]" />
    </DashboardShell>
  );
}
