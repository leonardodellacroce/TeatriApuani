"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import { getWorkModeCookie } from "@/lib/workMode";

interface Event {
  id: string;
  title: string;
  clientName: string | null;
  startDate: string;
  endDate: string;
  location: { id: string; name: string } | null;
  workdays: Array<{ id: string; date: string; timeSpans: string; notes: string }>;
}

interface TimeSpan { start: string; end: string }
interface WorkdayFormData {
  date: string;
  timeSpans: TimeSpan[]; // multiple intervals
  notes?: string;
}

export default function NewWorkdayPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params?.id as string;
  const { data: session, status } = useSession();
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const isWorker = (session?.user as any)?.isWorker === true;
  const inWorkerMode = !isStandardUser && isWorker && getWorkModeCookie() === "worker";
  const canCreateWorkday = !inWorkerMode && ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");

  const [event, setEvent] = useState<Event | null>(null);
  const [workdays, setWorkdays] = useState<WorkdayFormData[]>([
    { date: "", timeSpans: [{ start: "", end: "" }], notes: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [timeSpanErrors, setTimeSpanErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (status === "loading") return;
    if (inWorkerMode) {
      router.replace("/dashboard");
      return;
    }
    if (!canCreateWorkday) {
      router.replace(`/dashboard/events/${eventId}?tab=workdays`);
      return;
    }
    fetchEvent();
  }, [status, canCreateWorkday, inWorkerMode, eventId]);

  const fetchEvent = async () => {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setEvent(data);
      } else {
        setError("Errore durante il caricamento dell'evento");
      }
    } catch (error) {
      console.error("Error fetching event:", error);
      setError("Errore durante il caricamento dell'evento");
    } finally {
      setLoadingData(false);
    }
  };

  const handleWorkdayChange = (index: number, field: keyof WorkdayFormData, value: string) => {
    const updated = [...workdays];
    updated[index] = { ...updated[index], [field]: value };
    setWorkdays(updated);
  };

  const addWorkdayField = () => {
    setWorkdays([...workdays, { date: "", timeSpans: [{ start: "", end: "" }], notes: "" }]);
  };

  const removeWorkdayField = (index: number) => {
    if (workdays.length > 1) {
      setWorkdays(workdays.filter((_, i) => i !== index));
    }
  };

  const getMinDate = () => {
    if (!event) return "";
    const date = new Date(event.startDate);
    return date.toISOString().split('T')[0];
  };

  const getMaxDate = () => {
    if (!event) return "";
    const date = new Date(event.endDate);
    return date.toISOString().split('T')[0];
  };

  const getExistingDates = () => {
    if (!event?.workdays) return [];
    return event.workdays.map(w => {
      const d = new Date(w.date);
      return d.toISOString().split('T')[0];
    });
  };

  // Calcola la posizione cronologica (1-based) nell'intervallo evento
  const getOrdinalForNewWorkday = (workdayIndex: number): number => {
    const wd = workdays[workdayIndex];
    const ord = getOrdinalFromDateString(wd?.date);
    if (ord !== null) return ord;
    // Fallback: se non è stata selezionata la data, mostra "-"
    return 0;
  };

  const getMaxWorkdaysAllowed = () => {
    if (!event) return 0;
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Converte una data in inizio-giorno UTC per calcoli discreti
  const toUtcDayStart = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));

  // Restituisce l'ordinal del giorno (1-based) all'interno dell'intervallo evento
  const getOrdinalFromDateString = (dateStr: string | undefined): number | null => {
    if (!event || !dateStr) return null;
    const start = toUtcDayStart(new Date(event.startDate));
    const target = toUtcDayStart(new Date(dateStr));
    const diffMs = target.getTime() - start.getTime();
    const ordinal = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
    return ordinal;
  };

  const isDateDuplicate = (date: string, index: number) => {
    const currentIndexDates = workdays.map((w, i) => i !== index ? w.date : "").filter(d => d);
    return currentIndexDates.includes(date) || getExistingDates().includes(date);
  };

  // Verifica se un intervallo orario si sovrappone con altri nello stesso workday
  const checkTimeOverlap = (timeSpans: Array<{ start: string; end: string }>, currentIdx: number, newStart: string, newEnd: string): string | null => {
    if (!newStart || !newEnd) return null;
    
    const parseTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    
    const startMin = parseTime(newStart);
    let endMin = parseTime(newEnd);
    
    // Gestisci turni notturni
    if (endMin <= startMin) {
      endMin += 24 * 60;
    }
    
    for (let i = 0; i < timeSpans.length; i++) {
      if (i === currentIdx) continue;
      const ts = timeSpans[i];
      if (!ts.start || !ts.end) continue;
      
      const tsStart = parseTime(ts.start);
      let tsEnd = parseTime(ts.end);
      
      if (tsEnd <= tsStart) {
        tsEnd += 24 * 60;
      }
      
      // Verifica sovrapposizione
      if ((startMin >= tsStart && startMin < tsEnd) || 
          (endMin > tsStart && endMin <= tsEnd) ||
          (startMin <= tsStart && endMin >= tsEnd)) {
        return `Intervallo sovrapposto con ${ts.start} - ${ts.end}`;
      }
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const maxAllowed = getMaxWorkdaysAllowed();
    const existingCount = event?.workdays?.length || 0;
    const totalWorkdays = existingCount + workdays.length;

    // Validazione: verificare che non si superi il numero di giorni dell'evento
    if (totalWorkdays > maxAllowed) {
      setError(`Non è possibile creare più giornate di lavoro rispetto ai ${maxAllowed} giorni dell'evento`);
      return;
    }

    // Validazione: verificare che non ci siano date duplicate
    const allDates = workdays.map(w => w.date);
    const uniqueDates = new Set(allDates);
    if (allDates.length !== uniqueDates.size) {
      setError("Non è possibile selezionare due volte la stessa data");
      return;
    }

    // Validazione: verificare che non ci siano date già esistenti
    const existingDates = getExistingDates();
    const hasDuplicates = workdays.some(w => existingDates.includes(w.date));
    if (hasDuplicates) {
      setError("Una o più date sono già state utilizzate");
      return;
    }

    setLoading(true);

    try {
      // Crea tutte le giornate
      const promises = workdays.map(workday => {
        // Filtra gli intervalli vuoti
        const validTimeSpans = workday.timeSpans?.filter(ts => ts.start && ts.end) || [];
        
        return fetch("/api/workdays", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventId: eventId,
            locationId: event?.location?.id || null,
            date: workday.date,
            startTime: null,
            endTime: null,
            timeSpans: validTimeSpans.length > 0 ? validTimeSpans : null,
            notes: workday.notes || null,
          }),
        });
      });

      const results = await Promise.all(promises);
      const allOk = results.every(r => r.ok);

      if (allOk) {
        router.push(`/dashboard/events/${eventId}?tab=workdays`);
      } else {
        const errors = await Promise.all(results.map(async (r) => {
          try {
            const data = await r.json();
            console.error("Error details:", data);
            return data;
          } catch (e) {
            console.error("Failed to parse error response:", e);
            return { error: `HTTP ${r.status}: ${r.statusText}` };
          }
        }));
        const errorMsg = errors[0]?.error || errors[0]?.details || results.find(r => !r.ok)?.statusText || "Errore durante la creazione delle giornate";
        setError(errorMsg);
      }
    } catch (error) {
      console.error("Error creating workdays:", error);
      setError("Errore durante la creazione delle giornate");
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento...</p>
        </div>
      </DashboardShell>
    );
  }

  if (!event) {
    return (
      <DashboardShell>
        <div className="text-center py-12 text-gray-500">
          <p>Evento non trovato</p>
        </div>
      </DashboardShell>
    );
  }

  // Ordina i blocchi delle nuove giornate per posizione cronologica (quelle senza data alla fine)
  const workdayOrder = workdays
    .map((w, i) => ({ index: i, ordinal: getOrdinalForNewWorkday(i), hasDate: Boolean(w.date) }))
    .sort((a, b) => {
      const ao = a.hasDate ? a.ordinal : Number.POSITIVE_INFINITY;
      const bo = b.hasDate ? b.ordinal : Number.POSITIVE_INFINITY;
      return ao - bo;
    });

  return (
    <DashboardShell>
      <div>
        <h1 className="text-3xl font-bold mb-6">Nuove Giornate di Lavoro</h1>

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Titolo evento (non modificabile) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titolo Evento
            </label>
            <input
              type="text"
              value={event.title}
              disabled
              className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          {/* Location (non modificabile) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              type="text"
              value={event.location?.name || "-"}
              disabled
              className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          {/* Cliente/i (non modificabile) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cliente/i
            </label>
            <input
              type="text"
              value={event.clientName || "-"}
              disabled
              className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          {/* Giornate di lavoro */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Giornate di Lavoro *
                </label>
                {event && (
                  <p className="text-xs text-gray-500 mt-1">
                    Max {getMaxWorkdaysAllowed()} giornate (già create: {event.workdays?.length || 0})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={addWorkdayField}
                disabled={workdays.length >= getMaxWorkdaysAllowed() - (event?.workdays?.length || 0)}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Aggiungi Giornata
              </button>
            </div>

            {/* Giornate già create (solo visualizzazione) */}
            {event?.workdays && event.workdays.length > 0 && (
              <div className="space-y-3">
                {event.workdays.map((existingWorkday, idx) => (
                  <div key={existingWorkday.id} className="border border-gray-300 rounded-lg p-4 bg-gray-50 opacity-75">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {`Giornata ${getOrdinalFromDateString(new Date(existingWorkday.date).toISOString().split('T')[0])} (già creata)`}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500">Data: </span>
                        <span className="text-xs text-gray-700">
                          {new Date(existingWorkday.date).toLocaleDateString('it-IT')}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Orari: </span>
                        <span className="text-xs text-gray-700">
                          {(() => {
                            try {
                              const spans = existingWorkday.timeSpans ? JSON.parse(existingWorkday.timeSpans as any) : null;
                              return spans && spans.length > 0
                                ? spans.map((s: any) => `${s.start} - ${s.end}`).join(', ')
                                : '-';
                            } catch {
                              return '-';
                            }
                          })()}
                        </span>
                      </div>
                      {existingWorkday.notes && (
                        <div>
                          <span className="text-xs text-gray-500">Note: </span>
                          <span className="text-xs text-gray-700">{existingWorkday.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {workdayOrder.map(({ index, ordinal }) => (
              <div key={index} className="border border-gray-300 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {workdays[index].date && ordinal > 0 ? `Giornata ${ordinal}` : 'Nuova Giornata'}
                  </span>
                  {workdays.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWorkdayField(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      × Rimuovi
                    </button>
                  )}
                </div>

                {/* Data */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data *
                  </label>
                  <input
                    type="date"
                    value={workdays[index].date}
                    onChange={(e) => handleWorkdayChange(index, "date", e.target.value)}
                    min={getMinDate()}
                    max={getMaxDate()}
                    required
                    className={`w-full px-3 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                      isDateDuplicate(workdays[index].date, index) && workdays[index].date
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                  />
                  {isDateDuplicate(workdays[index].date, index) && workdays[index].date && (
                    <p className="text-red-600 text-xs mt-1">
                      Questa data è già stata selezionata o già esiste
                    </p>
                  )}
                </div>

                {/* Orari multipli */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Intervalli orari *</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...workdays];
                        updated[index].timeSpans.push({ start: "", end: "" });
                        setWorkdays(updated);
                      }}
                      className="text-sm px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      + Aggiungi intervallo
                    </button>
                  </div>

                      {workdays[index].timeSpans.map((ts, tsIdx) => (
                    <div key={tsIdx} className="space-y-2">
                      <div className="flex gap-2 items-end">
                      {/* Pulsanti su/giù - solo se ci sono più intervalli */}
                      {workdays[index].timeSpans.length > 1 && (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (tsIdx === 0) return;
                              const updated = [...workdays];
                              const arr = updated[index].timeSpans;
                              [arr[tsIdx], arr[tsIdx - 1]] = [arr[tsIdx - 1], arr[tsIdx]];
                              setWorkdays(updated);
                            }}
                            disabled={tsIdx === 0}
                            className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30"
                            title="Sposta su"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (tsIdx === workdays[index].timeSpans.length - 1) return;
                              const updated = [...workdays];
                              const arr = updated[index].timeSpans;
                              [arr[tsIdx], arr[tsIdx + 1]] = [arr[tsIdx + 1], arr[tsIdx]];
                              setWorkdays(updated);
                            }}
                            disabled={tsIdx === workdays[index].timeSpans.length - 1}
                            className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30"
                            title="Sposta giù"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Orario Inizio</label>
                        <input
                          type="time"
                          value={ts.start}
                          onChange={(e) => {
                            const updated = [...workdays];
                            updated[index].timeSpans[tsIdx].start = e.target.value;
                            setWorkdays(updated);
                            
                            // Verifica sovrapposizione
                            const errorMsg = checkTimeOverlap(updated[index].timeSpans, tsIdx, e.target.value, ts.end);
                            const key = `${index}-${tsIdx}`;
                            const newErrors = new Map(timeSpanErrors);
                            if (errorMsg) {
                              newErrors.set(key, errorMsg);
                            } else {
                              newErrors.delete(key);
                            }
                            setTimeSpanErrors(newErrors);
                          }}
                          onBlur={(e) => {
                            // Normalizza il formato HH:MM se è incompleto
                            if (e.target.value && !e.target.value.includes(":")) {
                              const normalized = `${e.target.value}:00`;
                              const updated = [...workdays];
                              updated[index].timeSpans[tsIdx].start = normalized;
                              setWorkdays(updated);
                              
                              // Verifica sovrapposizione
                              const errorMsg = checkTimeOverlap(updated[index].timeSpans, tsIdx, normalized, ts.end);
                              const key = `${index}-${tsIdx}`;
                              const newErrors = new Map(timeSpanErrors);
                              if (errorMsg) {
                                newErrors.set(key, errorMsg);
                              } else {
                                newErrors.delete(key);
                              }
                              setTimeSpanErrors(newErrors);
                            }
                          }}
                          className={`w-full px-3 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                            timeSpanErrors.get(`${index}-${tsIdx}`) ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ora Fine</label>
                        <input
                          type="time"
                          value={ts.end}
                          onChange={(e) => {
                            const updated = [...workdays];
                            updated[index].timeSpans[tsIdx].end = e.target.value;
                            setWorkdays(updated);
                            
                            // Verifica sovrapposizione
                            const errorMsg = checkTimeOverlap(updated[index].timeSpans, tsIdx, ts.start, e.target.value);
                            const key = `${index}-${tsIdx}`;
                            const newErrors = new Map(timeSpanErrors);
                            if (errorMsg) {
                              newErrors.set(key, errorMsg);
                            } else {
                              newErrors.delete(key);
                            }
                            setTimeSpanErrors(newErrors);
                          }}
                          onBlur={(e) => {
                            // Normalizza il formato HH:MM se è incompleto
                            if (e.target.value && !e.target.value.includes(":")) {
                              const normalized = `${e.target.value}:00`;
                              const updated = [...workdays];
                              updated[index].timeSpans[tsIdx].end = normalized;
                              setWorkdays(updated);
                              
                              // Verifica sovrapposizione
                              const errorMsg = checkTimeOverlap(updated[index].timeSpans, tsIdx, ts.start, normalized);
                              const key = `${index}-${tsIdx}`;
                              const newErrors = new Map(timeSpanErrors);
                              if (errorMsg) {
                                newErrors.set(key, errorMsg);
                              } else {
                                newErrors.delete(key);
                              }
                              setTimeSpanErrors(newErrors);
                            }
                          }}
                          className={`w-full px-3 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                            timeSpanErrors.get(`${index}-${tsIdx}`) ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                      </div>
                      {/* Pulsante rimuovi intervallo - mostrato solo se ci sono più intervalli */}
                      {workdays[index].timeSpans.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...workdays];
                            updated[index].timeSpans = updated[index].timeSpans.filter((_, i) => i !== tsIdx);
                            setWorkdays(updated);
                            // Rimuovi eventuali errori associati a questo intervallo
                            const key = `${index}-${tsIdx}`;
                            const newErrors = new Map(timeSpanErrors);
                            newErrors.delete(key);
                            setTimeSpanErrors(newErrors);
                          }}
                          className="px-3 py-2 text-red-600 hover:text-red-800 font-medium"
                          title="Rimuovi intervallo"
                        >
                          ×
                        </button>
                      )}
                      </div>
                      {timeSpanErrors.get(`${index}-${tsIdx}`) && (
                        <p className="text-red-600 text-xs">{timeSpanErrors.get(`${index}-${tsIdx}`)}</p>
                      )}
                    </div>
                  ))}

                </div>

                {/* Note */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note
                  </label>
                  <textarea
                    value={workdays[index].notes || ""}
                    onChange={(e) => handleWorkdayChange(index, "notes", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Note opzionali sulla giornata di lavoro"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              {loading ? "Creazione..." : "Crea Giornate"}
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
    </DashboardShell>
  );
}
