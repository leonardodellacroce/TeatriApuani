"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getWorkModeCookie } from "@/lib/workMode";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";

interface FreeHoursEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  hoursWorked: number;
  taskTypeId?: string | null;
  dutyId?: string | null;
  locationId?: string | null;
  area?: string | null;
  taskType?: { id: string; name: string } | null;
  duty?: { id: string; name: string; area: string } | null;
  location?: { id: string; name: string } | null;
  actualBreaks?: string | null;
  notes: string | null;
  status: string;
}

interface AreaOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
}

interface TaskTypeOption {
  id: string;
  name: string;
  areas: string | null;
}

interface DutyOption {
  id: string;
  name: string;
  code: string;
  area: string;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDefaultDateRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

export default function FreeHoursPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const defaultRange = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<FreeHoursEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formOptions, setFormOptions] = useState<{
    areas: AreaOption[];
    taskTypes: TaskTypeOption[];
    duties: DutyOption[];
    locations: LocationOption[];
  }>({ areas: [], taskTypes: [], duties: [], locations: [] });
  const [formData, setFormData] = useState<{
    date: string;
    areaId: string;
    locationId: string;
    startTime: string;
    endTime: string;
    taskTypeId: string;
    dutyId: string;
    actualBreaks: Array<{ start: string; end: string }>;
    notes: string;
  }>({
    date: toISODate(new Date()),
    areaId: "",
    locationId: "",
    startTime: "",
    endTime: "",
    taskTypeId: "",
    dutyId: "",
    actualBreaks: [],
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [entryToEdit, setEntryToEdit] = useState<FreeHoursEntry | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

  const calculateHours = (start: string, end: string, breaks: Array<{ start: string; end: string }>): number => {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    let totalMinutes = endMinutes - startMinutes;
    for (const b of breaks) {
      if (b.start && b.end) {
        const [bsH, bsM] = b.start.split(":").map(Number);
        const [beH, beM] = b.end.split(":").map(Number);
        if (!isNaN(bsH) && !isNaN(bsM) && !isNaN(beH) && !isNaN(beM)) {
          let bsMin = bsH * 60 + bsM;
          let beMin = beH * 60 + beM;
          if (bsMin < startMinutes) bsMin += 24 * 60;
          if (beMin < bsMin) beMin += 24 * 60;
          totalMinutes -= Math.max(0, beMin - bsMin);
        }
      }
    }
    return totalMinutes / 60;
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/free-hours?startDate=${startDate}&endDate=${endDate}&status=PENDING`);
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes((session.user as any).role || "");
    const isWorker = (session.user as any).isWorker === true;
    const isNonStandardWorker = !isStandardUser && isWorker;
    const workMode = getWorkModeCookie();
    if (!isStandardUser && !isWorker) {
      router.push("/dashboard");
      return;
    }
    if (isNonStandardWorker && workMode === "admin") {
      router.push("/dashboard");
      return;
    }
    fetchEntries();
  }, [status, session?.user, router, startDate, endDate]);

  useEffect(() => {
    const loadFormOptions = async () => {
      try {
        const res = await fetch("/api/free-hours/form-options");
        if (res.ok) {
          const data = await res.json();
          setFormOptions({
            areas: data.areas || [],
            taskTypes: data.taskTypes || [],
            duties: data.duties || [],
            locations: data.locations || [],
          });
        }
      } catch {}
    };
    loadFormOptions();
  }, []);

  const openEdit = (e: FreeHoursEntry) => {
    let breaks: Array<{ start: string; end: string }> = [];
    if (e.actualBreaks) {
      try {
        const parsed = JSON.parse(e.actualBreaks);
        if (Array.isArray(parsed)) {
          breaks = parsed.filter((b: unknown) => b && typeof b === "object" && "start" in b && "end" in b);
        }
      } catch {}
    }
    const areaName = e.area || e.duty?.area;
    const areaId =
      areaName && formOptions.areas.length > 0
        ? formOptions.areas.find((a) => a.name === areaName)?.id ?? ""
        : "";
    setFormData({
      date: e.date.slice(0, 10),
      areaId,
      locationId: e.locationId || "",
      startTime: e.startTime,
      endTime: e.endTime,
      taskTypeId: e.taskTypeId || "",
      dutyId: e.dutyId || "",
      actualBreaks: breaks,
      notes: e.notes || "",
    });
    setEntryToEdit(e);
    setError("");
    setShowForm(true);
  };

  const filteredTaskTypes = formData.areaId
    ? formOptions.taskTypes.filter((tt) => {
        if (!tt.areas) return false;
        try {
          const arr = JSON.parse(tt.areas) as string[];
          return Array.isArray(arr) && arr.includes(formData.areaId);
        } catch {
          return false;
        }
      })
    : [];

  const selectedTaskType = formOptions.taskTypes.find((tt) => tt.id === formData.taskTypeId);
  const taskTypeAreaNames: string[] = [];
  if (selectedTaskType?.areas) {
    try {
      const areaIds = JSON.parse(selectedTaskType.areas) as string[];
      if (Array.isArray(areaIds)) {
        areaIds.forEach((aid) => {
          const a = formOptions.areas.find((ar) => ar.id === aid);
          if (a) taskTypeAreaNames.push(a.name);
        });
      }
    } catch {}
  }
  const filteredDuties =
    taskTypeAreaNames.length > 0
      ? formOptions.duties.filter((d) => taskTypeAreaNames.includes(d.area))
      : formData.areaId
        ? formOptions.duties.filter((d) => {
            const area = formOptions.areas.find((a) => a.id === formData.areaId);
            return area && d.area === area.name;
          })
        : [];

  const doSubmit = async () => {
    const body = {
      date: formData.date,
      locationId: formData.locationId,
      startTime: formData.startTime,
      endTime: formData.endTime,
      taskTypeId: formData.taskTypeId,
      dutyId: formData.dutyId,
      actualBreaks: formData.actualBreaks.filter((b) => b.start && b.end),
      notes: formData.notes || null,
    };

    const url = entryToEdit ? `/api/free-hours/${entryToEdit.id}` : "/api/free-hours";
    const res = await fetch(url, {
      method: entryToEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) {
      setShowForm(false);
      setEntryToEdit(null);
      setFormData({
        date: toISODate(new Date()),
        areaId: "",
        locationId: "",
        startTime: "",
        endTime: "",
        taskTypeId: "",
        dutyId: "",
        actualBreaks: [],
        notes: "",
      });
      fetchEntries();
    } else {
      setError(data.error || "Errore nel salvataggio");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!formData.startTime || !formData.endTime) {
      setError("Inserisci orario di inizio e fine");
      return;
    }
    if (!formData.areaId) {
      setError("Seleziona l'area");
      return;
    }
    if (!formData.locationId) {
      setError("Seleziona la location");
      return;
    }
    if (!formData.taskTypeId) {
      setError("Seleziona la tipologia di turno");
      return;
    }
    if (!formData.dutyId) {
      setError("Seleziona la mansione svolta");
      return;
    }
    const hours = calculateHours(formData.startTime, formData.endTime, formData.actualBreaks);
    if (hours <= 0) {
      setError("L'orario di fine deve essere successivo all'orario di inizio");
      return;
    }
    setSaving(true);
    try {
      await doSubmit();
    } catch {
      setError("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return;
    try {
      const res = await fetch(`/api/free-hours/${entryToDelete}`, { method: "DELETE" });
      if (res.ok) {
        setShowDeleteDialog(false);
        setEntryToDelete(null);
        fetchEntries();
      } else {
        const data = await res.json();
        alert(data.error || "Errore nel salvataggio");
      }
    } catch {
      alert("Errore nell'eliminazione");
    }
  };

  const handlePrevMonth = () => {
    const [y, m] = startDate.split("-").map(Number);
    const start = new Date(y, m - 2, 1);
    const end = new Date(y, m - 1, 0);
    setStartDate(toISODate(start));
    setEndDate(toISODate(end));
  };

  const handleNextMonth = () => {
    const [y, m] = startDate.split("-").map(Number);
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    setStartDate(toISODate(start));
    setEndDate(toISODate(end));
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(toISODate(start));
    setEndDate(toISODate(end));
  };

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.push("/dashboard/my-shifts")}
            aria-label="Indietro"
            title="Indietro"
            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Ore Libere</h1>
        </div>
        <p className="text-gray-600 mb-6">
          Inserisci ore lavorate non associate a un evento. Gli amministratori riceveranno una notifica e potranno convertirle in un evento.
        </p>

        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[240px] overflow-hidden">
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Inizio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-w-0 px-3 h-11 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="min-w-[240px] overflow-hidden">
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Fine</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-w-0 px-3 h-11 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="px-4 py-2 h-11 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                ← Precedente
              </button>
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="px-4 py-2 h-11 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="px-4 py-2 h-11 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Successivo →
              </button>
            </div>
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => {
                  setEntryToEdit(null);
                  setFormData({
                    date: toISODate(new Date()),
                    areaId: "",
                    locationId: "",
                    startTime: "",
                    endTime: "",
                    taskTypeId: "",
                    dutyId: "",
                    actualBreaks: [],
                    notes: "",
                  });
                  setError("");
                  setShowForm(true);
                }}
                className="px-4 py-2 h-11 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
              >
                + Inserisci ore libere
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Ore in attesa di conversione</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Caricamento...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Nessuna ora libera nel periodo selezionato. Clicca &quot;Inserisci ore libere&quot; per aggiungerne.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orario</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo / Mansione</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ore</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(e.date).toLocaleDateString("it-IT")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {e.startTime} - {e.endTime}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {e.location?.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {e.taskType?.name || "-"}
                        {e.duty?.name && (
                          <span className="block text-xs text-gray-400">{e.duty.name}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{formatHours(e.hoursWorked)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {e.notes ? (
                          <button
                            onClick={() => {
                              setSelectedNote(e.notes || null);
                              setShowNotesModal(true);
                            }}
                            aria-label="Visualizza Note"
                            title="Visualizza Note"
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openEdit(e)}
                            aria-label="Modifica"
                            title="Modifica"
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              setEntryToDelete(e.id);
                              setShowDeleteDialog(true);
                            }}
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
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">{entryToEdit ? "Modifica ore libere" : "Inserisci ore libere"}</h2>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                    required
                  >
                    <option value="">Seleziona...</option>
                    {formOptions.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area *</label>
                  <select
                    value={formData.areaId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        areaId: e.target.value,
                        taskTypeId: "",
                        dutyId: "",
                      })
                    }
                    className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                    required
                  >
                    <option value="">Seleziona...</option>
                    {formOptions.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia turno *</label>
                  <select
                    value={formData.taskTypeId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        taskTypeId: e.target.value,
                        dutyId: "",
                      })
                    }
                    className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                    required
                  >
                    <option value="">Seleziona...</option>
                    {filteredTaskTypes.map((tt) => (
                      <option key={tt.id} value={tt.id}>
                        {tt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mansione svolta *</label>
                  <select
                    value={formData.dutyId}
                    onChange={(e) => setFormData({ ...formData, dutyId: e.target.value })}
                    className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                    required
                  >
                    <option value="">Seleziona...</option>
                    {filteredDuties.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="min-w-0 overflow-hidden">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orario Inizio *</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orario Fine *</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Pause effettive</div>
                  {formData.actualBreaks.map((brk, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row md:gap-2 md:items-end gap-3 mb-2">
                      <div className="flex-1 min-w-0 w-full md:min-w-[100px]">
                        <label className="block text-xs text-gray-500 mb-1">Inizio</label>
                        <input
                          type="time"
                          value={brk.start}
                          onChange={(e) => {
                            const next = [...formData.actualBreaks];
                            next[idx] = { ...next[idx], start: e.target.value };
                            setFormData({ ...formData, actualBreaks: next });
                          }}
                          className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex-1 min-w-0 w-full md:min-w-[100px]">
                        <label className="block text-xs text-gray-500 mb-1">Fine</label>
                        <input
                          type="time"
                          value={brk.end}
                          onChange={(e) => {
                            const next = [...formData.actualBreaks];
                            next[idx] = { ...next[idx], end: e.target.value };
                            setFormData({ ...formData, actualBreaks: next });
                          }}
                          className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            actualBreaks: formData.actualBreaks.filter((_, i) => i !== idx),
                          })
                        }
                        className="px-2 py-2 text-red-600 hover:text-red-800 flex-shrink-0 self-end md:self-auto"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        actualBreaks: [...formData.actualBreaks, { start: formData.startTime || "", end: formData.endTime || "" }],
                      })
                    }
                    className="text-sm px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    + Aggiungi pausa
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ore lavorate</label>
                  <input
                    type="text"
                    value={
                      formData.startTime && formData.endTime
                        ? calculateHours(formData.startTime, formData.endTime, formData.actualBreaks).toFixed(2)
                        : "0.00"
                    }
                    readOnly
                    className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Es. Straordinario, emergenza..."
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEntryToEdit(null);
                      setError("");
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                  >
                    {saving ? "Salvataggio..." : "Salva"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showNotesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl bg-white rounded-lg shadow-xl border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Note</h3>
                <button
                  onClick={() => setShowNotesModal(false)}
                  aria-label="Chiudi"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
                >
                  ×
                </button>
              </div>
              <div className="p-4 whitespace-pre-wrap text-sm text-gray-700">
                {selectedNote || "-"}
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          isOpen={showDeleteDialog}
          title="Conferma eliminazione"
          message="Sei sicuro di voler eliminare queste ore libere?"
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setShowDeleteDialog(false);
            setEntryToDelete(null);
          }}
        />
      </div>
    </DashboardShell>
  );
}
