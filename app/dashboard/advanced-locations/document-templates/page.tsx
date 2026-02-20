"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";

interface DocumentTemplate {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  locationId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Location {
  id: string;
  name: string;
  address: string | null;
}

export default function DocumentTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [templateToAssign, setTemplateToAssign] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");

  useEffect(() => {
    if (status === "loading") return; // Aspetta che la sessione sia caricata
    
    if (!isAdmin) {
      router.push("/dashboard");
      return;
    }
    fetchTemplates();
    fetchLocations();
  }, [isAdmin, status, router]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/doc-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      if (res.ok) {
        const data = await res.json();
        // Filtra solo le location con enabledInAdvancedManagement
        setLocations(data.filter((loc: any) => loc.enabledInAdvancedManagement));
      }
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
  };

  const handleDeleteClick = (id: string) => {
    setTemplateToDelete(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;

    try {
      const res = await fetch(`/api/doc-templates/${templateToDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateToDelete));
        setShowDeleteDialog(false);
        setTemplateToDelete(null);
      } else {
        alert("Errore durante l'eliminazione del template");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      alert("Errore durante l'eliminazione del template");
    }
  };

  const cancelDelete = () => {
    setShowDeleteDialog(false);
    setTemplateToDelete(null);
  };

  const handleCreateInstance = async (templateId: string, templateTitle: string) => {
    const title = prompt(`Nome del nuovo documento (basato su "${templateTitle}"):`, templateTitle);
    if (!title) return;

    try {
      const res = await fetch("/api/docs/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          title,
          dataJson: {},
        }),
      });

      if (res.ok) {
        const instance = await res.json();
        router.push(`/dashboard/advanced-locations/documents/${instance.id}`);
      } else {
        alert("Errore durante la creazione dell'istanza");
      }
    } catch (error) {
      console.error("Error creating instance:", error);
      alert("Errore durante la creazione dell'istanza");
    }
  };

  const handleView = async (id: string) => {
    try {
      const res = await fetch(`/api/doc-templates/${id}/preview-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.pdfUrl) {
          window.open(result.pdfUrl, "_blank");
        }
      } else {
        alert("Errore durante la generazione del PDF");
      }
    } catch (error) {
      console.error("Error viewing template:", error);
      alert("Errore durante la visualizzazione del template");
    }
  };

  const handleAssignLocation = (templateId: string, currentLocationId: string | null) => {
    setTemplateToAssign(templateId);
    setSelectedLocationId(currentLocationId || "");
    setShowLocationDialog(true);
  };

  const confirmAssignLocation = async () => {
    if (!templateToAssign) return;

    try {
      const res = await fetch(`/api/doc-templates/${templateToAssign}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocationId || null,
        }),
      });

      if (res.ok) {
        fetchTemplates();
        setShowLocationDialog(false);
        setTemplateToAssign(null);
        setSelectedLocationId("");
      } else {
        alert("Errore durante l'assegnazione della location");
      }
    } catch (error) {
      console.error("Error assigning location:", error);
      alert("Errore durante l'assegnazione della location");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      // Carica il template originale
      const res = await fetch(`/api/doc-templates/${id}`);
      if (!res.ok) {
        alert("Errore durante il caricamento del template");
        return;
      }

      const original = await res.json();

      // Crea una copia con un nuovo titolo
      const copyRes = await fetch("/api/doc-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${original.title} (copia)`,
          description: original.description,
          pageSettings: JSON.parse(original.pageSettings),
          blocks: JSON.parse(original.blocksJson),
        }),
      });

      if (copyRes.ok) {
        // Ricarica la lista dei template
        fetchTemplates();
      } else {
        alert("Errore durante la duplicazione del template");
      }
    } catch (error) {
      console.error("Error duplicating template:", error);
      alert("Errore durante la duplicazione del template");
    }
  };

  if (status === "loading" || loading) {
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard/advanced-locations")}
              aria-label="Indietro"
              title="Indietro"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Template Documenti</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard/advanced-locations/documents")}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Visualizza Documenti
            </button>
            <button
              onClick={() => router.push("/dashboard/advanced-locations/document-templates/new")}
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
              aria-label="Nuovo Template"
              title="Nuovo Template"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filtra per Location
              </label>
              <select
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Tutte le location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
                <option value="__none__">Senza location</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filtra per Categoria
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Tutte le categorie</option>
                {Array.from(new Set(templates.map(t => t.category).filter(Boolean))).map((cat) => (
                  <option key={cat} value={cat!}>
                    {cat}
                  </option>
                ))}
                <option value="__none__">Senza categoria</option>
              </select>
            </div>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">Nessun template trovato.</p>
            <button
              onClick={() => router.push("/dashboard/advanced-locations/document-templates/new")}
              className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Crea il primo template
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoria
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Creazione
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates
                  .filter((template) => {
                    if (filterLocation === "__none__") return !template.locationId;
                    if (filterLocation) return template.locationId === filterLocation;
                    return true;
                  })
                  .filter((template) => {
                    if (filterCategory === "__none__") return !template.category;
                    if (filterCategory) return template.category === filterCategory;
                    return true;
                  })
                  .map((template) => (
                  <tr key={template.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{template.title}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">
                        {template.category ? (
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">
                            {template.category}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        {template.locationId ? (
                          <span className="text-gray-900 font-medium">
                            {locations.find(l => l.id === template.locationId)?.name || "Location eliminata"}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAssignLocation(template.id, null)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Assegna location
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(template.createdAt).toLocaleDateString("it-IT")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {template.locationId && (
                          <button
                            onClick={() => handleAssignLocation(template.id, template.locationId)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg transition-colors"
                            aria-label="Cambia Location"
                            title="Cambia Location"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => handleCreateInstance(template.id, template.title)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700 hover:shadow-lg transition-colors"
                          aria-label="Crea Istanza"
                          title="Crea Istanza"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleView(template.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                          aria-label="Visualizza PDF"
                          title="Visualizza PDF"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => router.push(`/dashboard/advanced-locations/document-templates/${template.id}`)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                          aria-label="Modifica"
                          title="Modifica"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDuplicate(template.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                          aria-label="Duplica"
                          title="Duplica"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteClick(template.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors"
                          aria-label="Elimina"
                          title="Elimina"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Conferma Eliminazione"
        message="Sei sicuro di voler eliminare questo template? Questa azione non può essere annullata."
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Dialog assegnazione location */}
      {showLocationDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Assegna Location</h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleziona una location
              </label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Nessuna location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowLocationDialog(false);
                  setTemplateToAssign(null);
                  setSelectedLocationId("");
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={confirmAssignLocation}
                className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

