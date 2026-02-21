"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
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
}

type SortField = "code" | "name";
type SortOrder = "asc" | "desc";

export default function LocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [provinceFilter, setProvinceFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);

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

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
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

  // Ottieni valori unici per i dropdown
  const uniqueProvinces = Array.from(new Set(locations.map(loc => loc.province).filter(Boolean) as string[]));
  const uniqueCities = Array.from(new Set(locations.map(loc => loc.city).filter(Boolean) as string[]));

  // Filtra le location
  const filteredLocations = locations.filter(location => {
    const matchProvince = !provinceFilter || location.province === provinceFilter;
    const matchCity = !cityFilter || location.city === cityFilter;
    return matchProvince && matchCity;
  });

  // Ordina le location filtrate
  const sortedLocations = [...filteredLocations].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/settings")}
              aria-label="Indietro"
              title="Indietro"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold">Location</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/settings/locations/archive")}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Archivio
            </button>
            <button
              onClick={() => router.push("/settings/locations/new")}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Nuova Location
            </button>
          </div>
        </div>

        {/* Filtri */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <label htmlFor="province-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filtra per Provincia
            </label>
            <select
              id="province-filter"
              value={provinceFilter}
              onChange={(e) => setProvinceFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all duration-200 cursor-pointer"
            >
              <option value="">Tutte le province</option>
              {uniqueProvinces.sort().map(province => (
                <option key={province} value={province!}>
                  {province}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="city-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filtra per Città
            </label>
            <select
              id="city-filter"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all duration-200 cursor-pointer"
            >
              <option value="">Tutte le città</option>
              {uniqueCities.sort().map(city => (
                <option key={city} value={city!}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setProvinceFilter("");
                setCityFilter("");
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Cancella filtri
            </button>
          </div>
        </div>

        {locations.length === 0 ? (
          <p className="text-gray-600">Nessuna location trovata.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("code")}
                    >
                      Codice
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("name")}
                    >
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Città
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provincia
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Colore
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {location.city || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {location.province || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div 
                        className="w-6 h-6 rounded-md border border-gray-300"
                        style={{ backgroundColor: location.color || "#gray" }}
                      />
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-2">
                        {/* Visualizza */}
                        <button
                          onClick={() => router.push(`/settings/locations/${location.id}/view`)}
                          aria-label="Visualizza"
                          title="Visualizza"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>

                        {/* Modifica */}
                        <button
                          onClick={() => router.push(`/settings/locations/${location.id}`)}
                          aria-label="Modifica"
                          title="Modifica"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                          </svg>
                        </button>

                        {/* Archivia */}
                        <button
                          onClick={() => handleArchive(location.id)}
                          aria-label="Archivia"
                          title="Archivia"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7H4l2-2h12l2 2zM4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M9 12h6" />
                          </svg>
                        </button>

                        {/* Elimina */}
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
                      </div>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <ConfirmDialog
          isOpen={showArchiveDialog}
          title="Conferma Operazione"
          message="Sei sicuro di voler archiviare questa location?"
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

