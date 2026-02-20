"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Location {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  color: string | null;
  isArchived: boolean;
}

type SortField = "code" | "name";
type SortOrder = "asc" | "desc";

export default function LocationsArchivePage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const sortedLocations = [...locations].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations?archived=true");
      if (res.ok) {
        const data = await res.json();
        setLocations(data);
      }
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = (id: string) => {
    setPendingArchive(id);
    setShowArchiveDialog(true);
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;

    try {
      const res = await fetch(`/api/locations/${pendingArchive}/archive`, {
        method: "PATCH",
      });

      if (res.ok) {
        fetchLocations();
      } else {
        alert("Errore durante l'operazione");
      }
    } catch (error) {
      console.error("Error archiving location:", error);
      alert("Errore durante l'operazione");
    } finally {
      setShowArchiveDialog(false);
      setPendingArchive(null);
    }
  };

  const cancelArchive = () => {
    setShowArchiveDialog(false);
    setPendingArchive(null);
  };

  const handleDelete = (id: string) => {
    setPendingDelete(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    try {
      const res = await fetch(`/api/locations/${pendingDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchLocations();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch (error) {
      console.error("Error deleting location:", error);
      alert("Errore durante l'eliminazione");
    } finally {
      setShowDeleteDialog(false);
      setPendingDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteDialog(false);
    setPendingDelete(null);
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento...</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/settings/locations")}
              aria-label="Indietro"
              title="Indietro"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold">Archivio Location</h1>
          </div>
        </div>

        {locations.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-gray-500">Nessuna location archiviata</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Codice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedLocations.map((location) => (
                  <tr key={location.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {location.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {location.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => router.push(`/settings/locations/${location.id}/view`)}
                        aria-label="Visualizza"
                        title="Visualizza"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700 hover:shadow-lg transition-colors mr-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleArchive(location.id)}
                        aria-label="Riattiva"
                        title="Riattiva"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-orange-600 text-white hover:bg-orange-700 hover:shadow-lg transition-colors mr-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(location.id)}
                        aria-label="Elimina"
                        title="Elimina"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmDialog
          isOpen={showArchiveDialog}
          title="Conferma Operazione"
          message="Sei sicuro di voler riattivare questa location?"
          onConfirm={confirmArchive}
          onCancel={cancelArchive}
        />

        <ConfirmDialog
          isOpen={showDeleteDialog}
          title="Conferma Eliminazione"
          message="Sei sicuro di voler eliminare questa location? Questa azione non può essere annullata."
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      </div>
    </DashboardShell>
  );
}

