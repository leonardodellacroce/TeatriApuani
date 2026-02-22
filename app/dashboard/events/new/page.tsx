"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import SearchableSelect from "@/components/SearchableSelect";
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

export default function NewEventPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const isWorker = (session?.user as any)?.isWorker === true;
  const inWorkerMode = !isStandardUser && isWorker && getWorkModeCookie() === "worker";
  const canCreateEvent = !inWorkerMode && ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");

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
  const [error, setError] = useState("");
  const [conflictingEvents, setConflictingEvents] = useState<any[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (inWorkerMode || !canCreateEvent) {
      router.replace("/dashboard/events");
      return;
    }
    fetchClients();
    fetchLocations();
  }, [status, inWorkerMode, canCreateEvent]);

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        // Filtra solo i clienti non archiviati
        const activeClients = data.filter((client: any) => !client.isArchived);
        setClients(activeClients);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
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
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    // Calcola i giorni tra data inizio e data fine (inclusi entrambi i giorni)
    if (name === "startDate" || name === "endDate") {
      const startDate = name === "startDate" ? value : formData.startDate;
      const endDate = name === "endDate" ? value : formData.endDate;
      
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 per includere entrambi i giorni
        setCalculatedDays(diffDays);
      } else {
        setCalculatedDays(null);
      }
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

  const addClientField = () => {
    setSelectedClients([...selectedClients, { id: "", name: "" }]);
  };

  const removeClientField = (index: number) => {
    if (selectedClients.length > 1) {
      setSelectedClients(selectedClients.filter((_, i) => i !== index));
    }
  };

  const createEvent = async () => {
    const validClients = selectedClients.filter(c => c.id && c.name);
    const clientNames = validClients.map(c => c.name).join(", ");
    const clientIds = validClients.map(c => c.id);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          clientName: clientNames || null, // Mantieni per retrocompatibilità
          clientIds: clientIds.length > 0 ? clientIds : null,
          locationId: formData.locationId || null,
          startDate: formData.startDate,
          endDate: formData.endDate,
          notes: formData.notes,
        }),
      });

      if (res.ok) {
        router.push("/dashboard/events");
      } else {
        const data = await res.json();
        console.error("Error response:", data);
        setError(data.error || data.details || "Errore durante la creazione dell'evento");
      }
    } catch (error) {
      console.error("Error creating event:", error);
      setError("Errore durante la creazione dell'evento");
    } finally {
      setLoading(false);
      setPendingSubmit(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    // Validazione: almeno un cliente deve essere selezionato
    const validClients = selectedClients.filter(c => c.id && c.name);
    if (validClients.length === 0) {
      setError("Seleziona almeno un cliente");
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
          
          const conflicts = allEvents.filter((event: any) => {
            if (!event.locationId || event.locationId !== formData.locationId) return false;
            
            const eventStart = new Date(event.startDate);
            const eventEnd = new Date(event.endDate);
            
            // Check overlap: new event overlaps if its date range intersects with existing event's date range
            return (newStart <= eventEnd && newEnd >= eventStart);
          });
          
          if (conflicts.length > 0) {
            setConflictingEvents(conflicts);
            setShowConflictDialog(true);
            setPendingSubmit(true);
            return;
          }
        }
      } catch (error) {
        console.error("Error checking for conflicts:", error);
      }
    }
    
    // No conflicts, proceed directly
    setLoading(true);
    await createEvent();
  };

  const handleConfirmCreate = async () => {
    setShowConflictDialog(false);
    setLoading(true);
    await createEvent();
  };

  const handleCancelCreate = () => {
    setShowConflictDialog(false);
    setConflictingEvents([]);
    setPendingSubmit(false);
  };

  return (
    <DashboardShell>
      <div>
        <h1 className="text-3xl font-bold mb-6">Nuovo Evento</h1>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
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
                <div className="flex-1">
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
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              {loading ? "Creazione..." : "Crea Evento"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Annulla
            </button>
          </div>
        </form>
        </div>

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
                    {conflictingEvents.map((event) => {
                      const startDate = new Date(event.startDate).toLocaleDateString('it-IT');
                      const endDate = new Date(event.endDate).toLocaleDateString('it-IT');
                      return (
                        <tr key={event.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{event.title}</td>
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
                  onClick={handleCancelCreate}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  onClick={handleConfirmCreate}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Conferma comunque
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

