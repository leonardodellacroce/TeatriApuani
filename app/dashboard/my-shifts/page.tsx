"use client";

import { useEffect, useMemo, useState } from "react";
import React from "react";
import { useSession } from "next-auth/react";
import { getWorkModeCookie } from "@/lib/workMode";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";

interface TimeEntryData {
  id: string;
  hoursWorked: number;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  hasTakenBreak: boolean | null;
  actualBreakStartTime: string | null;
  actualBreakEndTime: string | null;
  date: string;
}

interface ShiftAssignment {
  id: string;
  startTime: string | null;
  endTime: string | null;
  area: string | null;
  note: string | null;
  dutyName?: string | null;
  hasScheduledBreak?: boolean;
  scheduledBreakStartTime?: string | null;
  scheduledBreakEndTime?: string | null;
  workday: {
    date: string;
    event: { id: string; title: string };
    location: { id: string; name: string } | null;
  };
  taskType: {
    id: string;
    name: string;
    type: string;
  };
  timeEntry?: TimeEntryData | null;
}

type GroupKey = string;
type Group = {
  date: string;
  event: ShiftAssignment["workday"]["event"];
  location: ShiftAssignment["workday"]["location"];
  items: ShiftAssignment[];
};

function toISODate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGroupDateKey(dateStr: string) {
  return dateStr ? toISODate(new Date(dateStr)) : "";
}

function getTodayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toDateStrInRome(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isShiftFuture(workdayDate: string | Date): boolean {
  const dateStr = toDateStrInRome(workdayDate);
  return dateStr > getTodayStr();
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function getDefaultDateRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

export default function MyShiftsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlStart = searchParams.get("startDate");
  const urlEnd = searchParams.get("endDate");
  const hasValidParams = urlStart && urlEnd && ISO_DATE_REGEX.test(urlStart) && ISO_DATE_REGEX.test(urlEnd);

  const defaultRange = getDefaultDateRange();
  const [startDate, setStartDate] = useState(() =>
    hasValidParams ? urlStart! : defaultRange.startDate
  );
  const [endDate, setEndDate] = useState(() =>
    hasValidParams ? urlEnd! : defaultRange.endDate
  );

  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);

  // Sincronizza con i query params quando si arriva dalla notifica (es. ?startDate=2026-01-01&endDate=2026-01-31)
  useEffect(() => {
    if (hasValidParams && (urlStart !== startDate || urlEnd !== endDate)) {
      setStartDate(urlStart!);
      setEndDate(urlEnd!);
    }
  }, [urlStart, urlEnd, hasValidParams, startDate, endDate]);

  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

  // Modal ore lavorate
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftAssignment | null>(null);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    startTime: string;
    endTime: string;
    actualBreaks: Array<{ start: string; end: string }>;
    notes: string;
  }>({
    startTime: "",
    endTime: "",
    actualBreaks: [],
    notes: "",
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const calculateHours = (start: string, end: string, breaks: Array<{ start: string; end: string }>): number => {
    if (!start || !end) return 0;
    try {
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
            totalMinutes -= beMin - bsMin;
          }
        }
      }
      return totalMinutes / 60;
    } catch {
      return 0;
    }
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/my-shifts?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch shifts");
      const data = await res.json();
      if (data.shifts) {
        setShifts(Array.isArray(data.shifts) ? data.shifts : []);
      } else {
        setShifts(Array.isArray(data) ? data : []);
      }
    } catch {
      setShifts([]);
    } finally {
      setLoading(false);
    }
  };

  const parseBreaks = (json: string | null, legacyStart?: string | null, legacyEnd?: string | null): Array<{ start: string; end: string }> => {
    if (json) {
      try {
        const arr = JSON.parse(json);
        if (Array.isArray(arr)) return arr.filter((b: any) => b?.start && b?.end);
      } catch {}
    }
    if (legacyStart && legacyEnd) return [{ start: legacyStart, end: legacyEnd }];
    return [];
  };

  const handleOpenHoursModal = (shift: ShiftAssignment, timeEntry?: TimeEntryData | null) => {
    if (isShiftFuture(shift.workday.date)) return;
    setEditingShift(shift);
    setEditingTimeEntryId(timeEntry?.id ?? null);
    const scheduled = parseBreaks((shift as any).scheduledBreaks, shift.scheduledBreakStartTime, shift.scheduledBreakEndTime);
    const actual = parseBreaks((timeEntry as any)?.actualBreaks, timeEntry?.actualBreakStartTime, timeEntry?.actualBreakEndTime);
    setFormData({
      startTime: timeEntry?.startTime || shift.startTime || "",
      endTime: timeEntry?.endTime || shift.endTime || "",
      actualBreaks: actual.length > 0 ? actual : (scheduled.length > 0 ? scheduled.map(b => ({ ...b })) : []),
      notes: timeEntry?.notes || "",
    });
    setShowHoursModal(true);
  };

  const handleCloseHoursModal = () => {
    setShowHoursModal(false);
    setEditingShift(null);
    setEditingTimeEntryId(null);
    setFormData({ startTime: "", endTime: "", actualBreaks: [], notes: "" });
  };

  const handleSaveHours = async () => {
    if (!editingShift || !formData.startTime || !formData.endTime) {
      alert("Inserisci sia l'orario di inizio che quello di fine");
      return;
    }
    const calculatedHours = calculateHours(formData.startTime, formData.endTime, formData.actualBreaks);
    if (calculatedHours <= 0) {
      alert("L'orario di fine deve essere successivo all'orario di inizio");
      return;
    }
    const validBreaks = formData.actualBreaks.filter(b => b.start && b.end);
    try {
      const payload: any = {
        hoursWorked: calculatedHours,
        startTime: formData.startTime,
        endTime: formData.endTime,
        actualBreaks: validBreaks,
        notes: formData.notes || null,
      };
      let res;
      if (editingTimeEntryId) {
        res = await fetch(`/api/time-entries/${editingTimeEntryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/time-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, assignmentId: editingShift.id }),
        });
      }
      if (res.ok) {
        handleCloseHoursModal();
        fetchShifts();
      } else {
        const err = await res.json();
        alert(`Errore: ${err.error || "Operazione fallita"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Errore durante il salvataggio");
    }
  };

  const handleDeleteClick = (id: string) => {
    setEntryToDelete(id);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return;
    try {
      const res = await fetch(`/api/time-entries/${entryToDelete}`, { method: "DELETE" });
      if (res.ok) {
        setShowDeleteDialog(false);
        setEntryToDelete(null);
        fetchShifts();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch {
      alert("Errore durante l'eliminazione");
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
    fetchShifts();
  }, [status, session?.user, router, startDate, endDate]);

  const groups = useMemo(() => {
    const map = new Map<GroupKey, Group>();
    for (const s of shifts) {
      if (!s.workday?.date || !s.workday?.event) continue;
      const date = s.workday.date;
      const event = s.workday.event;
      const location = s.workday.location;
      const key = `${date}|${event.id}|${location?.id || "no-location"}`;
      if (!map.has(key)) {
        map.set(key, { date, event, location, items: [] });
      }
      map.get(key)!.items.push(s);
    }
    const arr = Array.from(map.values());
    // Ordina items per orario
    arr.forEach((g) => {
      g.items.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "") || a.taskType.name.localeCompare(b.taskType.name));
    });
    return arr;
  }, [shifts]);

  const todayKey = useMemo(() => toISODate(new Date()), []);

  const compareGroupDateAsc = useMemo(() => {
    return (a: Group, b: Group) =>
      a.date.localeCompare(b.date) ||
      a.event.title.localeCompare(b.event.title) ||
      (a.location?.name || "").localeCompare(b.location?.name || "");
  }, []);
  const compareGroupDateDesc = useMemo(() => {
    return (a: Group, b: Group) =>
      b.date.localeCompare(a.date) ||
      a.event.title.localeCompare(b.event.title) ||
      (a.location?.name || "").localeCompare(b.location?.name || "");
  }, []);
  const todayGroups = useMemo(() => {
    return groups
      .filter((g) => getGroupDateKey(g.date) === todayKey)
      .slice()
      .sort(compareGroupDateAsc);
  }, [groups, todayKey, compareGroupDateAsc]);
  const futureGroups = useMemo(() => {
    // Futuro: più vicino ad oggi in alto (data crescente)
    return groups
      .filter((g) => getGroupDateKey(g.date) > todayKey)
      .slice()
      .sort(compareGroupDateAsc);
  }, [groups, todayKey, compareGroupDateAsc]);
  const pastGroups = useMemo(() => {
    // Passato: più vicino ad oggi in alto (data decrescente)
    return groups
      .filter((g) => getGroupDateKey(g.date) < todayKey)
      .slice()
      .sort(compareGroupDateDesc);
  }, [groups, todayKey, compareGroupDateDesc]);

  const handlePrevMonth = () => {
    // Parse startDate manually to avoid timezone issues
    const [yearStr, monthStr] = startDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // getMonth() is 0-based
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    setStartDate(toISODate(start));
    setEndDate(toISODate(end));
  };

  const handleNextMonth = () => {
    // Parse startDate manually to avoid timezone issues
    const [yearStr, monthStr] = startDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // getMonth() is 0-based
    const start = new Date(year, month + 1, 1);
    const end = new Date(year, month + 2, 0);
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

  const renderTable = (title: string, tableGroups: Group[], emptyText: string) => {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">...</div>
        ) : tableGroups.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{emptyText}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Evento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo / Area
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orari
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ore Lavorate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Note
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tableGroups.map((group) => {
                  const dateStr = new Date(group.date).toLocaleDateString("it-IT");
                  return (
                    <React.Fragment key={`${title}-${group.date}-${group.event.id}-${group.location?.id || "no-location"}`}>
                      {group.items.map((s, idx) => {
                        const isFirst = idx === 0;
                        const rowSpan = group.items.length;
                        return (
                          <tr key={s.id}>
                            {isFirst ? (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium" rowSpan={rowSpan}>
                                  {dateStr}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900 font-medium" rowSpan={rowSpan}>
                                  {group.event.title}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" rowSpan={rowSpan}>
                                  {group.location?.name || "-"}
                                </td>
                              </>
                            ) : null}

                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span>
                                {s.taskType.name}
                                {s.area && ` - ${s.area}`}
                                {s.dutyName && (
                                  <span className="block mt-1 text-xs text-gray-400">{s.dutyName}</span>
                                )}
                              </span>
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                              <div>{s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : "-"}</div>
                              {(() => {
                                const actual = parseBreaks((s.timeEntry as any)?.actualBreaks, s.timeEntry?.actualBreakStartTime, s.timeEntry?.actualBreakEndTime);
                                const scheduled = parseBreaks((s as any).scheduledBreaks, s.scheduledBreakStartTime, s.scheduledBreakEndTime);
                                const breaks = actual.length > 0 ? actual : scheduled;
                                if (breaks.length === 0) return null;
                                return (
                                  <div className="mt-1 text-xs text-gray-400 font-normal flex flex-col gap-0.5">
                                    {breaks.map((b, i) => (
                                      <span key={i} className="flex items-center gap-1">
                                        <span>{b.start} - {b.end}</span>
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-label="Pausa">
                                          <path d="M5 8h10v6a5 5 0 0 1-5 5H9a4 4 0 0 1-4-4V8z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M15 10h2.5a2.5 2.5 0 0 1 0 5H15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M4 8h12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M9 3c0 1 1 1 1 2s-1 1-1 2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d="M12 3c0 1 1 1 1 2s-1 1-1 2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                              {s.note && (
                                <button
                                  onClick={() => {
                                    setSelectedNote(s.note || null);
                                    setShowNotesModal(true);
                                  }}
                                  className="mt-1 text-xs text-gray-500 hover:text-gray-700 underline"
                                  title="Note turno"
                                >
                                  Note turno
                                </button>
                              )}
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {s.timeEntry ? (
                                <span className="font-medium text-gray-900">{formatHours(s.timeEntry.hoursWorked)}</span>
                              ) : isShiftFuture(s.workday.date) ? (
                                <span className="font-medium text-gray-900">Non inseribili</span>
                              ) : (
                                <span className="text-red-600 font-medium">Non inserite</span>
                              )}
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {s.timeEntry?.notes ? (
                                <button
                                  onClick={() => {
                                    setSelectedNote(s.timeEntry!.notes || null);
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

                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  onClick={() => !isShiftFuture(s.workday.date) && handleOpenHoursModal(s, s.timeEntry)}
                                  disabled={isShiftFuture(s.workday.date)}
                                  aria-label={s.timeEntry ? "Modifica" : "Inserisci"}
                                  title={isShiftFuture(s.workday.date) ? "Non è possibile inserire ore per turni futuri" : (s.timeEntry ? "Modifica ore" : "Inserisci ore")}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {s.timeEntry ? (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                                    ) : (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    )}
                                  </svg>
                                </button>
                                {s.timeEntry && !isShiftFuture(s.workday.date) && (
                                  <button
                                    onClick={() => handleDeleteClick(s.timeEntry!.id)}
                                    aria-label="Elimina"
                                    title="Elimina ore"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardShell>
      <div>
        <h1 className="text-3xl font-bold mb-2">I Miei Turni</h1>

        {/* Filtri */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[240px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Inizio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="min-w-[240px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Fine</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                ← Precedente
              </button>
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Successivo →
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {renderTable("Turni di Oggi", todayGroups, "Nessun turno previsto per oggi")}
          {renderTable("Turni Futuri", futureGroups, "Nessun turno futuro nel periodo selezionato")}
          {renderTable("Turni Passati", pastGroups, "Nessun turno passato nel periodo selezionato")}
        </div>

        {/* Modal Note */}
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

        {/* Modal Inserisci/Modifica Ore */}
        {showHoursModal && editingShift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">
                {editingTimeEntryId ? "Modifica Ore" : "Inserisci Ore"}
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
                <div><span className="font-medium text-gray-600">Data:</span> {new Date(editingShift.workday.date).toLocaleDateString("it-IT")}</div>
                <div><span className="font-medium text-gray-600">Evento:</span> {editingShift.workday.event.title}</div>
                <div><span className="font-medium text-gray-600">Location:</span> {editingShift.workday.location?.name || "-"}</div>
                <div><span className="font-medium text-gray-600">Tipo:</span> {editingShift.taskType.name}{editingShift.dutyName ? ` - ${editingShift.dutyName}` : ""}</div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orario Inizio *</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orario Fine *</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
                      required
                    />
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Pause effettive</div>
                  {formData.actualBreaks.map((brk, idx) => (
                    <div key={idx} className="flex gap-2 items-end mb-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Inizio</label>
                        <input
                          type="time"
                          value={brk.start}
                          onChange={(e) => {
                            const next = [...formData.actualBreaks];
                            next[idx] = { ...next[idx], start: e.target.value };
                            setFormData({ ...formData, actualBreaks: next });
                          }}
                          className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Fine</label>
                        <input
                          type="time"
                          value={brk.end}
                          onChange={(e) => {
                            const next = [...formData.actualBreaks];
                            next[idx] = { ...next[idx], end: e.target.value };
                            setFormData({ ...formData, actualBreaks: next });
                          }}
                          className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, actualBreaks: formData.actualBreaks.filter((_, i) => i !== idx) })}
                        className="px-2 py-2 text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      actualBreaks: [...formData.actualBreaks, { start: editingShift.scheduledBreakStartTime || formData.startTime || "", end: editingShift.scheduledBreakEndTime || formData.endTime || "" }]
                    })}
                    className="text-sm px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    + Aggiungi pausa
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ore Lavorate</label>
                  <input
                    type="text"
                    value={formData.startTime && formData.endTime
                      ? calculateHours(formData.startTime, formData.endTime, formData.actualBreaks).toFixed(2)
                      : "0.00"}
                    readOnly
                    className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
                    placeholder="Es. Straordinario, emergenza..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={handleCloseHoursModal} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Annulla
                </button>
                <button onClick={handleSaveHours} className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                  Salva
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          isOpen={showDeleteDialog}
          title="Conferma Eliminazione"
          message="Sei sicuro di voler eliminare queste ore inserite? L'operazione non può essere annullata."
          onConfirm={handleDeleteConfirm}
          onCancel={() => { setShowDeleteDialog(false); setEntryToDelete(null); }}
        />
      </div>
    </DashboardShell>
  );
}


