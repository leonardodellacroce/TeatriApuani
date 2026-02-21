import DashboardShell from "./DashboardShell";

/**
 * Skeleton di caricamento: mostra subito la shell (navbar) + placeholder animati.
 * Percepito come più veloce rispetto al testo "Caricamento...".
 */
export default function PageSkeleton() {
  return (
    <DashboardShell>
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-24 bg-gray-200 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-20 bg-gray-200 rounded" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </div>
    </DashboardShell>
  );
}
