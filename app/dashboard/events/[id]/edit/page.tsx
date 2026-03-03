"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import SearchableSelect from "@/components/SearchableSelect";
import DateInput from "@/components/DateInput";
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
  const [calculatedDays, setCalculatedDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [originalData, setOriginalData] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showPastEventDialog, setShowPastEventDialog] = useState(false);
  const [originalClients, setOriginalClients] = useState<SelectedClient[]>([]);
  const [isEventPast, setIsEventPast] = useState(false);
  const [workdayDateRange, setWorkdayDateRange] = useState<{ min: string; max: string } | null>(null);
  const [conflictingEvents, setConflictingEvents] = useState<any[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const { data: session, status } = useSession();
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin === true || session?.user?.role === "SUPER_ADMIN";
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
        const { closedMonths: cm, ...eventData } = data;
        const closedMonths = Array.isArray(cm) ? cm : [];
        const hasWorkdayInClosedMonth = (eventData.workdays || []).some((wd: { date: string }) => {
          const d = new Date(wd.date);
          return closedMonths.some((c: { year: number; month: number }) => c.year === d.getFullYear() && c.month === d.getMonth() + 1);
        });
        if (hasWorkdayInClosedMonth && !isSuperAdmin) {
          router.replace(`/dashboard/events/${eventId}`);
          return;
        }
        
        // Converti la data per l'input (YYYY-MM-DD), usando UTC per evitare problemi di timezone
        const startDateObj = new Date(eventData.startDate);
        const endDateObj = new Date(eventData.endDate);
        
        // Usa la data locale senza conversione di timezone
        const startDate = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-${String(startDateObj.getDate()).padStart(2, '0')}`;
        const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
        
        const initialFormData = {
          title: eventData.title,
          locationId: eventData.locationId || "",
          startDate,
          endDate,
          notes: eventData.notes || "",
        };
        
        setFormData(initialFormData);
        setOriginalData(initialFormData);

        // Range date giornate di lavoro (per vincolo modifica date)
        const workdaysList = eventData.workdays || [];
        if (workdaysList.length > 0) {
          const dates = workdaysList.map((wd: { date: string }) => {
            const d = new Date(wd.date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          });
          const sorted = [...dates].sort();
          setWorkdayDateRange({ min: sorted[0], max: sorted[sorted.length - 1] });
        } else {
          setWorkdayDateRange(null);
        }
        
        // Verifica se l'evento è passato: confronta le date di calendario, non i datetime.
        // Un evento che termina il 24/02 non è "passato" se siamo ancora il 24/02.
        const eventEndDate = new Date(eventData.endDate);
        const now = new Date();
        const eventEndDay = new Date(eventEndDate.getFullYear(), eventEndDate.getMonth(), eventEndDate.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const isPast = eventEndDay < today;
        setIsEventPast(isPast);

        // Usa i clienti passati come parametro o quelli nello stato
        const availableClients = loadedClients || clients;
        console.log('[fetchEvent] data.clientIds:', eventData.clientIds);
        console.log('[fetchEvent] clients available:', availableClients.length);
        
        let clientsLoaded = false;
        if (eventData.clientIds && eventData.clientIds !== 'null') {
          try {
            const clientIds = JSON.parse(eventData.clientIds);
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
        
        if (!clientsLoaded && eventData.clientName && availableClients.length > 0) {
          // Fallback al vecchio formato clientName per retrocompatibilità
          const clientNames = eventData.clientName.split(", ");
          
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
        } else if (eventData.clientName && availableClients.length === 0) {
          // Se i clienti non sono ancora caricati, usa i nomi dall'evento
          const clientNames = eventData.clientName.split(", ");
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

    // Verifica sovrapposizioni con altri eventi nella stessa location
    if (formData.locationId) {
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const allEvents = await res.json();
          const newStart = new Date(formData.startDate);
          const newEnd = new Date(formData.endDate);

          const conflicts = allEvents.filter((ev: any) => {
            if (ev.id === eventId) return false;
            if (!ev.locationId || ev.locationId !== formData.locationId) return false;
            const eventStart = new Date(ev.startDate);
            const eventEnd = new Date(ev.endDate);
            return newStart <= eventEnd && newEnd >= eventStart;
          });

          if (conflicts.length > 0) {
            setConflictingEvents(conflicts);
            setShowConflictDialog(true);
            return;
          }
        }
      } catch (err) {
        console.error("Error checking for conflicts:", err);
      }
    }

    // Mostra il dialog di conferma normale
    setShowConfirmDialog(true);
  };

  const performSave = async () => {
    setLoading(true);

    try {
      // Vincolo date: se ci sono giornate di lavoro, le date devono contenerle
      if (workdayDateRange) {
        if (formData.startDate > workdayDateRange.min || formData.endDate < workdayDateRange.max) {
          setError("Non è possibile modificare le date: le giornate di lavoro esistenti devono restare nell'intervallo dell'evento.");
          setLoading(false);
          return;
        }
      }

      const validClients = selectedClients.filter(c => c.name && c.name.trim() !== "");
      const clientNames = validClients.map(c => c.name).join(", ");
      const clientIds = validClients.map(c => c.id).filter(id => id);

      const payload: any = {
        title: formData.title,
        clientName: clientNames || null,
        locationId: formData.locationId || null,
        startDate: formData.startDate,
        endDate: formData.endDate,
        notes: formData.notes,
      };
      if (clientIds.length > 0) payload.clientIds = clientIds;

      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const fromConvert = searchParams.get("fromConvert") === "1";
        if (fromConvert) {
          const firstWorkdayId = data?.workdays?.[0]?.id;
          if (firstWorkdayId) {
            router.push(`/dashboard/events/${eventId}/workdays/${firstWorkdayId}`);
          } else {
            router.push(`/dashboard/events/${eventId}?tab=workdays`);
          }
        } else {
          const tab = searchParams.get("tab") || "details";
          router.push(`/dashboard/events/${eventId}?tab=${tab}`);
        }
      } else {
        const data = await res.json();
        setError(data.error || "Errore durante la modifica dell'evento");
      }
    } catch (error) {
      console.error("Error updating event:", error);
      setError("Errore durante la modifica dell'evento");
    } finally {
      setLoading(false);
    }
  };

  const confirmSave = async () => {
    setShowConfirmDialog(false);
    await performSave();
  };

  const handleConfirmConflictSave = async () => {
    setShowConflictDialog(false);
    setConflictingEvents([]);
    await performSave();
  };

  const handleCancelConflictSave = () => {
    setShowConflictDialog(false);
    setConflictingEvents([]);
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

  const fromConvert = searchParams.get("fromConvert") === "1";

  return (
    <DashboardShell>
      <div className="min-w-0 max-w-full overflow-x-hidden">
        <h1 className="text-3xl font-bold mb-6">{fromConvert ? "Crea evento da ore libere" : "Modifica Evento"}</h1>

        {fromConvert && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 max-w-xl">
            Inserisci cliente per completare l&apos;evento creato dalle ore libere.
            <br />
            Dopo il salvataggio sarai reindirizzato alla giornata di lavoro per verificare la correttezza dei dati.
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 md:p-6 border border-gray-200 mb-6 max-w-xl w-full max-w-full min-w-0 overflow-hidden">
        <form onSubmit={handleSubmit} className="space-y-4 min-w-0 w-full max-w-full">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <div className="min-w-0 w-full">
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
              className="w-full px-3 h-11 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div className="min-w-0 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clienti *
            </label>
            {selectedClients.map((selectedClient, index) => (
              <div key={index} className="flex gap-2 mb-2 min-w-0 w-full max-w-full">
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    value={selectedClient.id}
                    onChange={(val) => {
                      const client = clients.find((c) => c.id === val);
                      const updated = [...selectedClients];
                      updated[index] = client
                        ? { id: client.id, name: getClientDisplayName(client) }
                        : { id: "", name: "" };
                      setSelectedClients(updated);
                    }}
                    placeholder="Cerca cliente..."
                    emptyOption={{ value: "", label: "Seleziona cliente..." }}
                    options={[...clients]
                      .filter((c) => !selectedClients.some((sc, j) => j !== index && sc.id === c.id))
                      .sort((a, b) => getClientDisplayName(a).localeCompare(getClientDisplayName(b)))
                      .map((c) => ({ value: c.id, label: getClientDisplayName(c) }))}
                  />
                </div>
                {index === selectedClients.length - 1 && (
                  <button
                    type="button"
                    onClick={addClientField}
                    className="px-3 h-11 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                  >
                    +
                  </button>
                )}
                {selectedClients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeClientField(index)}
                    className="px-3 h-11 bg-red-200 text-red-700 rounded-lg hover:bg-red-300 transition-colors flex-shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="min-w-0 w-full">
            <label htmlFor="locationId" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <SearchableSelect
              id="locationId"
              value={formData.locationId}
              onChange={(v) => setFormData({ ...formData, locationId: v })}
              placeholder="Cerca location..."
              emptyOption={{ value: "", label: "Seleziona una location" }}
              options={[...locations]
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .map((location) => ({
                  value: location.id,
                  label: location.name,
                }))}
            />
          </div>

          {/* Mobile: stessi blocchi di Titolo/Location/Note. Desktop: grid affiancato */}
          <div className="block md:grid md:grid-cols-2 md:gap-4 min-w-0 w-full space-y-4 md:space-y-0">
            <div className="min-w-0 w-full">
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                Data Inizio *
              </label>
              <DateInput
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                required
              />
            </div>

            <div className="min-w-0 w-full">
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                Data Fine *
              </label>
              <DateInput
                id="endDate"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {calculatedDays !== null && (
            <div className="py-2 px-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                Giornate di lavoro previste: <span className="font-semibold">{calculatedDays}</span>
              </p>
            </div>
          )}

          <div className="min-w-0 w-full">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Note
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-y"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 h-11 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : (fromConvert ? "Continua" : "Salva Modifiche")}
            </button>
            <button
              type="button"
              disabled={cancelLoading}
              onClick={async () => {
                if (fromConvert) {
                  const freeHoursId = searchParams.get("freeHoursId");
                  if (freeHoursId) {
                    setCancelLoading(true);
                    try {
                      const res = await fetch(`/api/free-hours/${freeHoursId}/revert-conversion`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                      });
                      if (res.ok) {
                        router.push("/dashboard/admin/shifts-hours");
                        return;
                      }
                      const data = await res.json();
                      setError(data.error || "Errore nell'annullamento");
                    } catch {
                      setError("Errore nell'annullamento");
                    } finally {
                      setCancelLoading(false);
                    }
                  } else {
                    router.push("/dashboard/admin/shifts-hours");
                  }
                } else {
                  const tab = searchParams.get('tab') || 'details';
                  router.push(`/dashboard/events/${eventId}?tab=${tab}`);
                }
              }}
              className="px-4 h-11 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelLoading ? "Annullamento..." : "Annulla"}
            </button>
          </div>
        </form>
        </div>
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

      {/* Conflict Dialog */}
      {showConflictDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Evento già presente nella location
            </h2>
            <p className="text-gray-700 mb-4">
              Esistono già eventi nella stessa location nel periodo selezionato:
            </p>
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-4 max-h-60 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Evento</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Inizio</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Fine</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {conflictingEvents.map((ev) => {
                    const startDate = new Date(ev.startDate).toLocaleDateString("it-IT");
                    const endDate = new Date(ev.endDate).toLocaleDateString("it-IT");
                    return (
                      <tr key={ev.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">{ev.title}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{startDate}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{endDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelConflictSave}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmConflictSave}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Conferma comunque
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

