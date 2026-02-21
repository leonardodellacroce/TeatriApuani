"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import ConfirmEditDialog from "@/components/ConfirmEditDialog";
import { getWorkModeCookie } from "@/lib/workMode";

interface Client {
  id: string;
  ragioneSociale: string | null;
  nome: string | null;
  cognome: string | null;
  code: string;
}

interface Location {
  id: string;
  name: string;
}

interface SelectedClient {
  id: string;
  name: string;
}

interface Event {
  id: string;
  title: string;
  clientName: string | null;
  locationId: string | null;
  startDate: string;
  endDate: string;
  notes: string | null;
}

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params?.id as string;

  const [formData, setFormData] = useState({
    title: "",
    locationId: "",
    startDate: "",
    endDate: "",
    notes: "",
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedClients, setSelectedClients] = useState<SelectedClient[]>([{ id: "", name: "" }]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [calculatedDays, setCalculatedDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [originalData, setOriginalData] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showPastEventDialog, setShowPastEventDialog] = useState(false);
  const [originalClients, setOriginalClients] = useState<SelectedClient[]>([]);
  const [isEventPast, setIsEventPast] = useState(false);
  const { data: session, status } = useSession();
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin === true;
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const isWorker = (session?.user as any)?.isWorker === true;
  const inWorkerMode = !isStandardUser && isWorker && getWorkModeCookie() === "worker";
  const canEditEvent = !inWorkerMode && ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");

  useEffect(() => {
    if (status === "loading") return;
    if (inWorkerMode || !canEditEvent) {
      router.replace(`/dashboard/events/${eventId}`);
      return;
    }
  }, [status, inWorkerMode, canEditEvent, eventId]);

  useEffect(() => {
    const loadData = async () => {
      // Carica prima i clienti e le location
      const [loadedClients] = await Promise.all([fetchClients(), fetchLocations()]);
      // Poi carica l'evento passando i clienti caricati
      await fetchEvent(loadedClients);
    };
    loadData();
  }, [eventId]);

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        const activeClients = data.filter((client: any) => !client.isArchived);
        console.log('[fetchClients] Loaded clients:', activeClients.length);
        setClients(activeClients);
        return activeClients;
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
    return [];
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
    }
  };

  const getClientDisplayName = (client: Client): string => {
    if (client.ragioneSociale) {
      return client.ragioneSociale;
    } else if (client.nome && client.cognome) {
      return `${client.nome} ${client.cognome}`;
    } else if (client.nome) {
      return client.nome;
    }
    return client.code;
  };

  const fetchEvent = async (loadedClients?: Client[]) => {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        
        // Converti la data per l'input (YYYY-MM-DD), usando UTC per evitare problemi di timezone
        const startDateObj = new Date(data.startDate);
        const endDateObj = new Date(data.endDate);
        
        // Usa la data locale senza conversione di timezone
        const startDate = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-${String(startDateObj.getDate()).padStart(2, '0')}`;
        const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
        
        const initialFormData = {
          title: data.title,
          locationId: data.locationId || "",
          startDate,
          endDate,
          notes: data.notes || "",
        };
        
        setFormData(initialFormData);
        setOriginalData(initialFormData);
        
        // Verifica se l'evento è passato
        const eventEndDate = new Date(data.endDate);
        const now = new Date();
        const isPast = eventEndDate < now;
        setIsEventPast(isPast);

        // Usa i clienti passati come parametro o quelli nello stato
        const availableClients = loadedClients || clients;
        console.log('[fetchEvent] data.clientIds:', data.clientIds);
        console.log('[fetchEvent] clients available:', availableClients.length);
        
        let clientsLoaded = false;
        if (data.clientIds && data.clientIds !== 'null') {
          try {
            const clientIds = JSON.parse(data.clientIds);
            console.log('[fetchEvent] Parsed clientIds:', clientIds);
            if (Array.isArray(clientIds) && clientIds.length > 0) {
              const matchedClients = clientIds.map((clientId: string) => {
                const client = availableClients.find((c: Client) => c.id === clientId);
                console.log('[fetchEvent] Looking for clientId:', clientId, 'found:', client ? 'YES' : 'NO');
                if (client) {
                  return { id: client.id, name: getClientDisplayName(client) };
                } else {
                  console.warn('[fetchEvent] Client not found for ID:', clientId);
                  return { id: '', name: clientId }; // Fallback senza ID
                }
              });
              console.log('[fetchEvent] Loaded clients from clientIds:', matchedClients);
              setSelectedClients(matchedClients);
              setOriginalClients(matchedClients);
              clientsLoaded = true;
            }
          } catch (error) {
            console.error("Error parsing clientIds:", error);
          }
        }
        
        if (!clientsLoaded && data.clientName && availableClients.length > 0) {
          // Fallback al vecchio formato clientName per retrocompatibilità
          const clientNames = data.clientName.split(", ");
          
          const matchedClients = clientNames.map((name: string) => {
            const client = availableClients.find((c: Client) => {
              const displayName = getClientDisplayName(c);
              return displayName === name;
            });
            
            if (client) {
              return { id: client.id, name: getClientDisplayName(client) };
            } else {
              return { id: "", name };
            }
          });
          
          if (matchedClients.length > 0) {
            setSelectedClients(matchedClients);
            setOriginalClients(matchedClients);
          }
        } else if (data.clientName && availableClients.length === 0) {
          // Se i clienti non sono ancora caricati, usa i nomi dall'evento
          const clientNames = data.clientName.split(", ");
          const tempClients = clientNames.map((name: string) => ({ id: "", name }));
          setSelectedClients(tempClients);
          setOriginalClients(tempClients);
        }

        // Calcola i giorni previsti
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          setCalculatedDays(diffDays);
        }
      }
    } catch (error) {
      console.error("Error fetching event:", error);
      setError("Errore durante il caricamento dell'evento");
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    if (name === "startDate" || name === "endDate") {
      const startDate = name === "startDate" ? value : formData.startDate;
      const endDate = name === "endDate" ? value : formData.endDate;
      
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        setCalculatedDays(diffDays);
      } else {
        setCalculatedDays(null);
      }
    }
  };

  const getFilteredClients = (index: number) => {
    const currentSearch = selectedClients[index].name.toLowerCase();
    return clients.filter((client) => {
      const displayName = getClientDisplayName(client).toLowerCase();
      return displayName.includes(currentSearch);
    });
  };

  const handleClientSelect = (index: number, client: Client) => {
    const updated = [...selectedClients];
    updated[index] = {
      id: client.id,
      name: getClientDisplayName(client),
    };
    console.log('[handleClientSelect] Selected client:', { id: client.id, name: getClientDisplayName(client) });
    console.log('[handleClientSelect] Updated selectedClients:', updated);
    setSelectedClients(updated);
    setOpenDropdownIndex(null);
  };

  const handleClientChange = (index: number, field: string, value: string) => {
    const updated = [...selectedClients];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedClients(updated);
  };

  const addClientField = () => {
    setSelectedClients([...selectedClients, { id: "", name: "" }]);
  };

  const removeClientField = (index: number) => {
    if (selectedClients.length > 1) {
      setSelectedClients(selectedClients.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    const validClients = selectedClients.filter(c => c.name && c.name.trim() !== "");
    if (validClients.length === 0) {
      setError("Seleziona almeno un cliente");
      return;
    }

    // Se l'evento è passato e l'utente non è SuperAdmin, blocca
    if (isEventPast && !isSuperAdmin) {
      setError("Gli eventi passati possono essere modificati solo dal Super Admin");
      return;
    }

    // Se l'evento è passato e l'utente è SuperAdmin, mostra dialog di conferma
    if (isEventPast && isSuperAdmin) {
      setShowPastEventDialog(true);
      return;
    }

    // Mostra il dialog di conferma normale
    setShowConfirmDialog(true);
  };

  const confirmSave = async () => {
    setLoading(true);
    setShowConfirmDialog(false);

    try {
      const validClients = selectedClients.filter(c => c.name && c.name.trim() !== "");
      console.log('[confirmSave] selectedClients:', selectedClients);
      console.log('[confirmSave] validClients:', validClients);
      
      const clientNames = validClients.map(c => c.name).join(", ");
      const clientIds = validClients.map(c => c.id).filter(id => id);
      
      console.log('[confirmSave] clientNames:', clientNames);
      console.log('[confirmSave] clientIds before filter:', validClients.map(c => c.id));
      console.log('[confirmSave] clientIds after filter:', clientIds);
      
      const payload: any = {
        title: formData.title,
        clientName: clientNames || null, // Mantieni per retrocompatibilità
        locationId: formData.locationId || null,
        startDate: formData.startDate,
        endDate: formData.endDate,
        notes: formData.notes,
      };
      
      // Invia clientIds SOLO se ci sono ID validi, altrimenti non inviare il campo
      if (clientIds.length > 0) {
        payload.clientIds = clientIds;
      } else {
        console.warn('[confirmSave] No valid clientIds, not sending clientIds field to preserve existing value');
      }
      
      console.log('[confirmSave] Final payload:', JSON.stringify(payload, null, 2));
      
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const tab = searchParams.get('tab') || 'details';
        router.push(`/dashboard/events/${eventId}?tab=${tab}`);
      } else {
        const data = await res.json();
        console.error('Error response from server:', data);
        setError(data.error || "Errore durante la modifica dell'evento");
        if (data.details) {
          console.error('Error details:', data.details);
          alert('Errore dettagliato: ' + data.details);
        }
      }
    } catch (error) {
      console.error("Error updating event:", error);
      setError("Errore durante la modifica dell'evento");
    } finally {
      setLoading(false);
    }
  };

  const cancelSave = () => {
    setShowConfirmDialog(false);
  };

  const confirmPastEventSave = () => {
    setShowPastEventDialog(false);
    setShowConfirmDialog(true);
  };

  const cancelPastEventSave = () => {
    setShowPastEventDialog(false);
  };

  if (loadingData) {
    return <PageSkeleton />;
  }

  return (
    <DashboardShell>
      <div>
        <h1 className="text-3xl font-bold mb-6">Modifica Evento</h1>

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Titolo *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clienti *
            </label>
            {selectedClients.map((selectedClient, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={selectedClient.name}
                    onChange={(e) => {
                      const updated = [...selectedClients];
                      updated[index] = { ...updated[index], name: e.target.value };
                      setSelectedClients(updated);
                      setOpenDropdownIndex(index);
                    }}
                    onFocus={() => {
                      setOpenDropdownIndex(index);
                    }}
                    placeholder="Cerca cliente..."
                    className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                  {openDropdownIndex === index && selectedClient.name && getFilteredClients(index).length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {getFilteredClients(index).map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleClientSelect(index, client)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100"
                        >
                          {getClientDisplayName(client)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {index === selectedClients.length - 1 && (
                  <button
                    type="button"
                    onClick={addClientField}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    +
                  </button>
                )}
                {selectedClients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeClientField(index)}
                    className="px-3 py-2 bg-red-200 text-red-700 rounded-lg hover:bg-red-300 transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="locationId" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <select
              id="locationId"
              name="locationId"
              value={formData.locationId}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer"
            >
              <option value="">Seleziona una location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                Data Inizio *
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                Data Fine *
              </label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>

          {calculatedDays !== null && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                Giornate di lavoro previste: <span className="font-semibold">{calculatedDays}</span>
              </p>
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Note
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : "Salva Modifiche"}
            </button>
            <button
              type="button"
              onClick={() => {
                const tab = searchParams.get('tab') || 'details';
                router.push(`/dashboard/events/${eventId}?tab=${tab}`);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={showPastEventDialog}
        title="Attenzione: Evento Terminato"
        message="Questo evento è già terminato. Sei sicuro di voler procedere con le modifiche?"
        onConfirm={confirmPastEventSave}
        onCancel={cancelPastEventSave}
      />

      <ConfirmEditDialog
        isOpen={showConfirmDialog}
        title="Conferma Modifiche"
        onConfirm={confirmSave}
        onCancel={cancelSave}
        oldData={originalData && {
          title: originalData.title || "-",
          clients: originalClients.length > 0 ? originalClients.map(c => c.name).join(", ") : "-",
          location: originalData.locationId ? locations.find(l => l.id === originalData.locationId)?.name || "-" : "-",
          startDate: originalData.startDate || "-",
          endDate: originalData.endDate || "-",
          notes: originalData.notes || "-",
        }}
        newData={{
          title: formData.title || "-",
          clients: selectedClients.filter(c => c.name).map(c => c.name).join(", ") || "-",
          location: formData.locationId ? locations.find(l => l.id === formData.locationId)?.name || "-" : "-",
          startDate: formData.startDate || "-",
          endDate: formData.endDate || "-",
          notes: formData.notes || "-",
        }}
        fieldLabels={{
          title: "Titolo",
          clients: "Clienti",
          location: "Location",
          startDate: "Data Inizio",
          endDate: "Data Fine",
          notes: "Note",
        }}
      />
    </DashboardShell>
  );
}

