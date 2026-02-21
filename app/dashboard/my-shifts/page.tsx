"use client";

import { useEffect, useMemo, useState } from "react";
import React from "react";
import { useSession } from "next-auth/react";
import { getWorkModeCookie } from "@/lib/workMode";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

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

export default function MyShiftsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return toISODate(d);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return toISODate(d);
  });

  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

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
    (async () => {
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
    })();
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
          <div className="p-8 text-center text-gray-500">Caricamento...</div>
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
                    Note
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
                              {s.hasScheduledBreak && s.scheduledBreakStartTime && s.scheduledBreakEndTime && (
                                <div className="mt-1 text-xs text-gray-400 font-normal">
                                  <span className="inline-flex items-center gap-1">
                                    <span>
                                      {s.scheduledBreakStartTime} - {s.scheduledBreakEndTime}
                                    </span>
                                    <svg
                                      className="w-3.5 h-3.5"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      aria-label="Pausa"
                                    >
                                      <path
                                        d="M5 8h10v6a5 5 0 0 1-5 5H9a4 4 0 0 1-4-4V8z"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                      <path
                                        d="M15 10h2.5a2.5 2.5 0 0 1 0 5H15"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                      <path
                                        d="M4 8h12"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                      <path
                                        d="M9 3c0 1 1 1 1 2s-1 1-1 2"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                      <path
                                        d="M12 3c0 1 1 1 1 2s-1 1-1 2"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  </span>
                                </div>
                              )}
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {s.note ? (
                                <button
                                  onClick={() => {
                                    setSelectedNote(s.note || null);
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
      </div>
    </DashboardShell>
  );
}


