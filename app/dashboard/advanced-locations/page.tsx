"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

interface Location {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
}

interface DocumentTemplate {
  id: string;
  title: string;
  locationId: string | null;
}

export default function AdvancedLocationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");

  useEffect(() => {
    if (status === "loading") return; // Aspetta che la sessione sia caricata
    
    if (!isAdmin) {
      router.push("/dashboard");
      return;
    }
    fetchData();
  }, [isAdmin, status, router]);

  const fetchData = async () => {
    try {
      const [locationsRes, templatesRes] = await Promise.all([
        fetch("/api/locations"),
        fetch("/api/doc-templates"),
      ]);

      if (locationsRes.ok) {
        const data = await locationsRes.json();
        // Filtra solo le location abilitate in gestione avanzata
        const enabledLocations = data.filter((loc: any) => loc.enabledInAdvancedManagement === true);
        setLocations(enabledLocations);
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInstance = async (templateId: string, templateTitle: string, locationName: string) => {
    const title = prompt(`Nome del documento (${locationName} - ${templateTitle}):`, `${locationName} - ${templateTitle}`);
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
        alert("Errore durante la creazione del documento");
      }
    } catch (error) {
      console.error("Error creating instance:", error);
      alert("Errore durante la creazione del documento");
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
          <h1 className="text-3xl font-bold text-gray-900">Gestione Avanzata Location</h1>
          <button
            onClick={() => router.push("/dashboard/advanced-locations/document-templates")}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            Template documenti
          </button>
        </div>

        {locations.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">Nessuna location trovata. Creane una dalle Impostazioni.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {locations.map((location) => {
              const locationTemplates = templates.filter(t => t.locationId === location.id);
              
              return (
                <div
                  key={location.id}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="bg-gray-50 p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {location.name}
                    </h3>
                    {location.address && (
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Indirizzo:</span> {location.address}
                      </p>
                    )}
                  </div>
                  
                  <div className="p-4">
                    {locationTemplates.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">
                        Nessun template associato a questa location.
                        Vai alla pagina Template per assegnare un template.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {locationTemplates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => handleCreateInstance(template.id, template.title, location.name)}
                            className="p-4 border border-gray-200 rounded-lg hover:border-gray-900 hover:shadow-md transition-all text-left group"
                          >
                            <div className="flex items-start gap-3">
                              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 group-hover:text-gray-900 truncate">
                                  {template.title}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Clicca per creare documento
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

