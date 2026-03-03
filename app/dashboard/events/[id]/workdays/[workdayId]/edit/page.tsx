"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import DateInput from "@/components/DateInput";
import TimeInput from "@/components/TimeInput";
import { getWorkModeCookie } from "@/lib/workMode";

interface Event {
  id: string;
  title: string;
  clientName: string | null;
  location: { id: string; name: string } | null;
}

interface Location {
  id: string;
  name: string;
}

interface Workday {
  id: string;
  date: string;
  eventId: string;
  event: Event;
  locationId: string | null;
  location: Location | null;
  startTime: string | null; // legacy
  endTime: string | null;   // legacy
  timeSpans?: string | null; // JSON string
  notes?: string | null;
}

interface TimeSpan { start: string; end: string }

export default function EditWorkdayPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session, status } = useSession();
  const workdayId = params?.workdayId as string;
  const eventId = params?.id as string;

  const [workday, setWorkday] = useState<Workday | null>(null);
  const [date, setDate] = useState("");
  const [timeSpans, setTimeSpans] = useState<TimeSpan[]>([{ start: "", end: "" }]);
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [timeSpanErrors, setTimeSpanErrors] = useState<Map<number, string>>(new Map());
  const [showPastWorkdayDialog, setShowPastWorkdayDialog] = useState(false);
  const [isWorkdayPast, setIsWorkdayPast] = useState(false);
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const isWorker = (session?.user as any)?.isWorker === true;
  const isNonStandardWorker = !isStandardUser && isWorker;
  const inWorkerMode = isNonStandardWorker && getWorkModeCookie() === "worker";
  const isAdminOrSuperAdmin = !inWorkerMode && ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin === true || session?.user?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    if (inWorkerMode) {
      router.replace("/dashboard");
      return;
    }
    if (!isAdminOrSuperAdmin) {
      router.replace(`/dashboard/events/${eventId}?tab=workdays`);
    }
  }, [status, isAdminOrSuperAdmin, inWorkerMode, eventId, router]);

  // Verifica se un intervallo orario si sovrappone con altri
  const checkTimeOverlap = (spans: TimeSpan[], currentIdx: number, newStart: string, newEnd: string): string | null => {
    if (!newStart || !newEnd) return null;
    
    const parseTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    
    const startMin = parseTime(newStart);
    let endMin = parseTime(newEnd);
    
    if (endMin <= startMin) {
      endMin += 24 * 60;
    }
    
    for (let i = 0; i < spans.length; i++) {
      if (i === currentIdx) continue;
      const ts = spans[i];
      if (!ts.start || !ts.end) continue;
      
      const tsStart = parseTime(ts.start);
      let tsEnd = parseTime(ts.end);
      
      if (tsEnd <= tsStart) {
        tsEnd += 24 * 60;
      }
      
      if ((startMin >= tsStart && startMin < tsEnd) || 
          (endMin > tsStart && endMin <= tsEnd) ||
          (startMin <= tsStart && endMin >= tsEnd)) {
        return `Intervallo sovrapposto con ${ts.start} - ${ts.end}`;
      }
    }
    
    return null;
  };

  useEffect(() => {
    fetchWorkday();
  }, [workdayId]);

  const parseSpans = (jsonStr?: string | null): TimeSpan[] => {
    if (!jsonStr) return [];
    try {
      const arr = JSON.parse(jsonStr);
      if (Array.isArray(arr)) return arr.filter((s: any) => s.start && s.end);
      return [];
    } catch {
      return [];
    }
  };

  const fetchWorkday = async () => {
    try {
      const res = await fetch(`/api/workdays/${workdayId}`);
      if (res.ok) {
        const data = await res.json();
        const { closedMonths: cm, ...wdData } = data;
        const closedMonths = Array.isArray(cm) ? cm : [];
        const workdayDate = new Date(wdData.date);
        const monthClosed = closedMonths.some((c: { year: number; month: number }) => c.year === workdayDate.getFullYear() && c.month === workdayDate.getMonth() + 1);
        if (monthClosed && !isSuperAdmin) {
          router.replace(`/dashboard/events/${eventId}/workdays/${workdayId}?readonly=1`);
          return;
        }
        setWorkday(wdData);
        setDate(workdayDate.toISOString().split('T')[0]);
        const spans = parseSpans(wdData.timeSpans);
        setTimeSpans(spans.length > 0 ? spans : [{ start: wdData.startTime || "", end: wdData.endTime || "" }]);
        setNotes(wdData.notes || "");
        
        // Verifica se la giornata è passata
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        workdayDate.setHours(0, 0, 0, 0);
        const isPast = workdayDate < now;
        setIsWorkdayPast(isPast);
      }
    } catch (error) {
      console.error("Error fetching workday:", error);
      setError("Errore durante il caricamento della giornata");
    } finally {
      setLoadingData(false);
    }
  };

  const performSave = async () => {
    setLoading(true);

    try {
      const payload: any = {
        date,
        // usa solo timeSpans multi-intervallo; azzera i legacy
        startTime: null,
        endTime: null,
        timeSpans: timeSpans.filter(ts => ts.start && ts.end),
        notes: notes || null,
      };

      const res = await fetch(`/api/workdays/${workdayId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push(`/dashboard/events/${eventId}?tab=workdays`);
      } else {
        const data = await res.json();
        setError(data.error || "Errore durante la modifica della giornata");
      }
    } catch (err) {
      console.error("Error updating workday:", err);
      setError("Errore durante la modifica della giornata");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!date) {
      setError("La data è obbligatoria");
      return;
    }

    // Se la giornata è passata e l'utente non è Admin/SuperAdmin, blocca
    if (isWorkdayPast && !isAdminOrSuperAdmin) {
      setError("Le giornate terminate possono essere modificate solo da Admin o Super Admin");
      return;
    }

    // Se la giornata è passata e l'utente è Admin/SuperAdmin, mostra dialog di conferma
    if (isWorkdayPast && isAdminOrSuperAdmin) {
      setShowPastWorkdayDialog(true);
      return;
    }

    await performSave();
  };

  const confirmPastWorkdaySave = async () => {
    setShowPastWorkdayDialog(false);
    await performSave();
  };

  const cancelPastWorkdaySave = () => {
    setShowPastWorkdayDialog(false);
  };

  if (loadingData) {
    return <PageSkeleton />;
  }

  if (!workday) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Giornata non trovata</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="min-w-0 overflow-hidden">
        <h1 className="text-3xl font-bold mb-6">Modifica Giornata di Lavoro</h1>

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 min-w-0">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Campi ereditati dall'evento */}
          <div>
            <label htmlFor="eventTitle" className="block text-sm font-medium text-gray-700 mb-1">
              Titolo Evento
            </label>
            <input
              type="text"
              id="eventTitle"
              value={workday.event.title}
              disabled
              className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="eventLocation" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              type="text"
              id="eventLocation"
              value={workday.location?.name || workday.event.location?.name || "-"}
              disabled
              className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="eventClient" className="block text-sm font-medium text-gray-700 mb-1">
              Cliente/i
            </label>
            <input
              type="text"
              id="eventClient"
              value={workday.event.clientName || "-"}
              disabled
              className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          {/* Data */}
          <div className="min-w-0 w-full overflow-hidden">
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
              Data *
            </label>
            <DateInput
              id="date"
              name="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Intervalli orari multipli */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Intervalli orari *</span>
              <button
                type="button"
                onClick={() => setTimeSpans([...timeSpans, { start: "", end: "" }])}
                className="text-sm px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                + Aggiungi intervallo
              </button>
            </div>

            {timeSpans.map((ts, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex flex-col md:flex-row md:gap-2 md:items-end gap-3">
                {/* Pulsanti su/giù - solo se ci sono più intervalli */}
                {timeSpans.length > 1 && (
                  <div className="flex flex-col gap-1 order-first md:order-none">
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === 0) return;
                        const next = [...timeSpans];
                        [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                        setTimeSpans(next);
                      }}
                      disabled={idx === 0}
                      className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30"
                      title="Sposta su"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === timeSpans.length - 1) return;
                        const next = [...timeSpans];
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        setTimeSpans(next);
                      }}
                      disabled={idx === timeSpans.length - 1}
                      className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30"
                      title="Sposta giù"
                    >
                      ↓
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 min-w-0 flex-1 w-full md:min-w-0">
                  <div className="min-w-0 w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orario Inizio</label>
                    <TimeInput
                      value={ts.start}
                      onChange={(e) => {
                        const next = [...timeSpans];
                        next[idx].start = e.target.value;
                        setTimeSpans(next);
                        const errorMsg = checkTimeOverlap(next, idx, e.target.value, ts.end);
                        const newErrors = new Map(timeSpanErrors);
                        if (errorMsg) newErrors.set(idx, errorMsg);
                        else newErrors.delete(idx);
                        setTimeSpanErrors(newErrors);
                      }}
                      onBlur={(e) => {
                        if (e.target.value && !e.target.value.includes(":")) {
                          const normalized = `${e.target.value}:00`;
                          const next = [...timeSpans];
                          next[idx].start = normalized;
                          setTimeSpans(next);
                          const errorMsg = checkTimeOverlap(next, idx, normalized, ts.end);
                          const newErrors = new Map(timeSpanErrors);
                          if (errorMsg) newErrors.set(idx, errorMsg);
                          else newErrors.delete(idx);
                          setTimeSpanErrors(newErrors);
                        }
                      }}
                      className={timeSpanErrors.get(idx) ? "border-red-500" : ""}
                    />
                  </div>
                  <div className="min-w-0 w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ora Fine</label>
                    <TimeInput
                      value={ts.end}
                      onChange={(e) => {
                        const next = [...timeSpans];
                        next[idx].end = e.target.value;
                        setTimeSpans(next);
                        const errorMsg = checkTimeOverlap(next, idx, ts.start, e.target.value);
                        const newErrors = new Map(timeSpanErrors);
                        if (errorMsg) newErrors.set(idx, errorMsg);
                        else newErrors.delete(idx);
                        setTimeSpanErrors(newErrors);
                      }}
                      onBlur={(e) => {
                        if (e.target.value && !e.target.value.includes(":")) {
                          const normalized = `${e.target.value}:00`;
                          const next = [...timeSpans];
                          next[idx].end = normalized;
                          setTimeSpans(next);
                          const errorMsg = checkTimeOverlap(next, idx, ts.start, normalized);
                          const newErrors = new Map(timeSpanErrors);
                          if (errorMsg) newErrors.set(idx, errorMsg);
                          else newErrors.delete(idx);
                          setTimeSpanErrors(newErrors);
                        }
                      }}
                      className={timeSpanErrors.get(idx) ? "border-red-500" : ""}
                    />
                  </div>
                </div>
                {/* Pulsante rimuovi intervallo - mostrato solo se ci sono più intervalli */}
                {timeSpans.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = timeSpans.filter((_, i) => i !== idx);
                      setTimeSpans(next);
                      // Rimuovi eventuali errori associati a questo intervallo
                      const newErrors = new Map(timeSpanErrors);
                      newErrors.delete(idx);
                      setTimeSpanErrors(newErrors);
                    }}
                    className="px-3 py-2 text-red-600 hover:text-red-800 font-medium"
                    title="Rimuovi intervallo"
                  >
                    ×
                  </button>
                )}
                </div>
                {timeSpanErrors.get(idx) && (
                  <p className="text-red-600 text-xs">{timeSpanErrors.get(idx)}</p>
                )}
              </div>
            ))}
          </div>

          {/* Note */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Note
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 h-11 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="Note opzionali sulla giornata di lavoro"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : "Salva modifiche"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/events/${eventId}?tab=workdays`)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={showPastWorkdayDialog}
        title="Attenzione: Giornata Terminata"
        message="Questa giornata di lavoro è già terminata. Sei sicuro di voler procedere con le modifiche?"
        onConfirm={confirmPastWorkdaySave}
        onCancel={cancelPastWorkdaySave}
      />
    </DashboardShell>
  );
}
