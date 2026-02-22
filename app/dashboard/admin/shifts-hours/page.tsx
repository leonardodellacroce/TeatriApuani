"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import SearchableSelect from "@/components/SearchableSelect";

type Row = {
  assignmentId: string;
  assignment: {
    id: string;
    startTime: string | null;
    endTime: string | null;
    area: string | null;
    note: string | null;
    hasScheduledBreak: boolean | null;
    scheduledBreakStartTime: string | null;
    scheduledBreakEndTime: string | null;
    workday: {
      date: string;
      event: { id: string; title: string };
      location: { id: string; name: string } | null;
    };
    taskType: { id: string; name: string; type: string };
  };
  userId: string;
  userName: string;
  userCode: string;
  dutyName: string | null;
  timeEntry: {
    id: string;
    hoursWorked: number;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
    hasTakenBreak: boolean | null;
    actualBreakStartTime: string | null;
    actualBreakEndTime: string | null;
    date: string;
  } | null;
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function isShiftFuture(workdayDate: string | Date | undefined): boolean {
  if (!workdayDate) return false;
  const dateStr = toDateStrInRome(workdayDate);
  return dateStr > getTodayStr();
}

export default function AdminShiftsHoursPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
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
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [users, setUsers] = useState<{ id: string; name: string | null; cognome: string | null; code: string }[]>([]);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
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
  const [onlyMissingHours, setOnlyMissingHours] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResultModal, setNotifyResultModal] = useState<{ message: string; isError?: boolean } | null>(null);

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

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const formatAbbreviatedName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return fullName || "-";
    return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (selectedUserId && selectedUserId !== "all") {
        params.set("userId", selectedUserId);
      }
      const res = await fetch(`/api/admin/shifts-hours?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRows(data.rows || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users?standard=true");
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const role = (session.user as any).role || "";
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(role)) {
      router.push("/dashboard");
      return;
    }
    fetchUsers();
  }, [status, session?.user, router]);

  useEffect(() => {
    if (!session?.user) return;
    const role = (session.user as any).role || "";
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(role)) return;
    fetchData();
  }, [session?.user, startDate, endDate, selectedUserId]);

  const handleOpenHoursModal = (row: Row) => {
    if (isShiftFuture(row.assignment.workday?.date)) return;
    setEditingRow(row);
    const te = row.timeEntry;
    const a = row.assignment;
    const scheduled = parseBreaks((a as any).scheduledBreaks, a.scheduledBreakStartTime, a.scheduledBreakEndTime);
    const actual = parseBreaks((te as any)?.actualBreaks, te?.actualBreakStartTime, te?.actualBreakEndTime);
    setFormData({
      startTime: te?.startTime || a.startTime || "",
      endTime: te?.endTime || a.endTime || "",
      actualBreaks: actual.length > 0 ? actual : scheduled.map(b => ({ ...b })),
      notes: te?.notes || "",
    });
    setEditingTimeEntryId(te?.id ?? null);
    setShowHoursModal(true);
  };

  const handleCloseHoursModal = () => {
    setShowHoursModal(false);
    setEditingRow(null);
    setEditingTimeEntryId(null);
    setFormData({ startTime: "", endTime: "", actualBreaks: [], notes: "" });
  };

  const handleSaveHours = async () => {
    if (!editingRow || !formData.startTime || !formData.endTime) {
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
          body: JSON.stringify({
            ...payload,
            assignmentId: editingRow.assignmentId,
            userId: editingRow.userId,
          }),
        });
      }
      if (res.ok) {
        handleCloseHoursModal();
        fetchData();
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
        fetchData();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch {
      alert("Errore durante l'eliminazione");
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

  const handleNotifyMissingHours = async () => {
    setNotifyLoading(true);
    try {
      const res = await fetch("/api/admin/notify-missing-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          userId: selectedUserId && selectedUserId !== "all" ? selectedUserId : undefined,
          onlyMissingHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const n = data.usersNotified ?? data.created ?? 0;
      const failed = data.failed ?? 0;
      const msg =
        failed > 0
          ? `Notifiche inviate a ${n} dipendente/i. Impossibile inviare a ${failed} dipendente/i.`
          : `Notifiche inviate a ${n} dipendente/i.`;
      setNotifyResultModal({ message: msg });
    } catch (e) {
      setNotifyResultModal({
        message: e instanceof Error ? e.message : "Errore durante l'invio delle notifiche",
        isError: true,
      });
    } finally {
      setNotifyLoading(false);
    }
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const selectedUserName = selectedUserId && selectedUserId !== "all" && selectedUser
    ? `${selectedUser.name || ""} ${selectedUser.cognome || ""}`.trim() || selectedUser.code || selectedUser.id
    : null;
  const showAllEmployees = !selectedUserId || selectedUserId === "all";

  const sortedRows = [...rows].sort((a, b) => {
    const dateA = a.assignment.workday?.date || "";
    const dateB = b.assignment.workday?.date || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const evA = a.assignment.workday?.event?.title || "";
    const evB = b.assignment.workday?.event?.title || "";
    if (evA !== evB) return evA.localeCompare(evB);
    return (a.assignment.startTime || "").localeCompare(b.assignment.startTime || "");
  });

  const filteredRows = onlyMissingHours
    ? sortedRows.filter((r) => !r.timeEntry && !isShiftFuture(r.assignment.workday?.date))
    : sortedRows;

  return (
    <DashboardShell>
      <div>
        <h1 className="text-3xl font-bold mb-2">Turni e Ore</h1>
        <p className="text-gray-600 mb-6">
          Visualizza i turni e le ore inserite dai lavoratori. Puoi correggere eventuali errori.
        </p>

        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4 w-full">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Dipendente</label>
              <SearchableSelect
                value={selectedUserId}
                onChange={setSelectedUserId}
                placeholder="Cerca dipendente..."
                emptyOption={{ value: "all", label: "Tutti i dipendenti" }}
                options={[...users]
                  .sort((a, b) =>
                    (a.name || "").localeCompare(b.name || "") ||
                    (a.cognome || "").localeCompare(b.cognome || "")
                  )
                  .map((u) => ({
                    value: u.id,
                    label: `${u.name || ""} ${u.cognome || ""}`.trim() || u.id,
                  }))}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Inizio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Fine</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                ← Precedente
              </button>
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Successivo →
              </button>
              <button
                type="button"
                onClick={handleNotifyMissingHours}
                disabled={notifyLoading}
                className="px-4 py-2 h-10 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {notifyLoading ? "Invio..." : "Notifica inserimento ore"}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer h-10 mt-4">
            <input
              type="checkbox"
              checked={onlyMissingHours}
              onChange={(e) => setOnlyMissingHours(e.target.checked)}
              className="w-4 h-4 text-gray-900 border-gray-300 rounded"
            />
            <span className="text-sm font-medium text-gray-700">Solo ore non inserite</span>
          </label>
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">
              Turni e ore{selectedUserName ? ` - ${selectedUserName}` : " - Tutti i dipendenti"}
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Caricamento...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {onlyMissingHours ? "Nessun turno con ore non inserite nel periodo selezionato" : "Nessun turno nel periodo selezionato"}
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] px-4 sm:px-6">
              <table className="w-full divide-y divide-gray-200 text-sm min-w-[900px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="pl-1 pr-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap w-[90px] min-w-[90px]" title="Data">Data</th>
                    <th className="pl-2 pr-0.5 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap min-w-[100px]" title="Location">Location</th>
                    <th className="pl-0.5 pr-1.5 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap min-w-[130px]" title="Evento">Evento</th>
                    {showAllEmployees && (
                      <th className="px-0.5 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap min-w-[85px]" title="Dipendente">Dipendente</th>
                    )}
                    <th className="pl-0.5 pr-0 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap min-w-[95px]" title="Orari">Orari</th>
                    <th className="pl-0.5 pr-0 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap min-w-[100px]" title="Mansione">Mansione</th>
                    <th className="pl-0 pr-1 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap min-w-[80px]" title="Ore">Ore</th>
                    <th className="pl-3 pr-0.5 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap min-w-[70px]" title="Note">Note</th>
                    <th className="pl-0.5 pr-1 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap w-[75px] min-w-[75px]" title="Azioni">Azioni</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRows.map((row) => {
                    const a = row.assignment;
                    const wd = a.workday;
                    const dateStr = wd?.date ? new Date(wd.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";
                    const eventTitle = wd?.event?.title || "-";
                    const locName = wd?.location?.name || "-";
                    return (
                      <tr key={`${row.assignmentId}-${row.userId}`} className="hover:bg-gray-50">
                        <td className="pl-1 pr-2 py-2 text-gray-900 whitespace-nowrap text-sm">{dateStr}</td>
                        <td className="pl-2 pr-0.5 py-2 text-gray-500 text-sm break-words" title={locName}>{locName}</td>
                        <td className="pl-0.5 pr-1.5 py-2 text-gray-900 text-sm break-words" title={eventTitle}>{eventTitle}</td>
                        {showAllEmployees && (
                          <td className="px-0.5 py-2 text-gray-900 text-sm break-words" title={row.userName}>
                            {formatAbbreviatedName(row.userName)}
                          </td>
                        )}
                        <td className="pl-0.5 pr-0 py-2 text-gray-900 text-sm break-words">
                          {a.startTime && a.endTime ? (
                            <>
                              <div className="font-medium">{a.startTime} - {a.endTime}</div>
                              {(() => {
                                const actual = parseBreaks((row.timeEntry as any)?.actualBreaks, row.timeEntry?.actualBreakStartTime, row.timeEntry?.actualBreakEndTime);
                                const scheduled = parseBreaks((a as any).scheduledBreaks, a.scheduledBreakStartTime, a.scheduledBreakEndTime);
                                const breaks = actual.length > 0 ? actual : scheduled;
                                if (breaks.length === 0) return null;
                                return (
                                  <div className="mt-0.5 text-xs text-gray-400 font-normal flex flex-col gap-0.5">
                                    {breaks.map((b, i) => (
                                      <span key={i} className="flex items-center gap-1">
                                        <span>{b.start} - {b.end}</span>
                                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-label="Pausa">
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
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="pl-0.5 pr-0 py-2 text-gray-500 text-sm break-words">
                          {(a.taskType?.name || row.dutyName) ? (
                            <>
                              {a.taskType?.name && (
                                <span>{a.taskType.name}</span>
                              )}
                              {row.dutyName && (
                                <span className={a.taskType?.name ? "block mt-0.5 text-xs text-gray-400" : ""}>{row.dutyName}</span>
                              )}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="pl-0 pr-1 py-2 whitespace-nowrap text-sm">
                          {row.timeEntry ? (
                            <span className="font-medium text-gray-900">{formatHours(row.timeEntry.hoursWorked)}</span>
                          ) : isShiftFuture(row.assignment.workday?.date) ? (
                            <span className="font-medium text-gray-900" title="Non inseribili">Non inseribili</span>
                          ) : (
                            <span className="text-red-600 font-medium" title="Non inserite">Non inserite</span>
                          )}
                        </td>
                        <td className="pl-3 pr-0.5 py-2">
                          {row.timeEntry?.notes ? (
                            <button
                              onClick={() => {
                                setSelectedNote(row.timeEntry!.notes);
                                setShowNotesModal(true);
                              }}
                              aria-label="Visualizza Note"
                              title="Visualizza Note"
                              className="h-7 w-7 inline-flex items-center justify-center rounded bg-gray-900 text-white hover:bg-gray-800"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="pl-0.5 pr-1 py-2">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => !isShiftFuture(row.assignment.workday?.date) && handleOpenHoursModal(row)}
                              disabled={isShiftFuture(row.assignment.workday?.date)}
                              aria-label={row.timeEntry ? "Modifica" : "Inserisci"}
                              title={isShiftFuture(row.assignment.workday?.date) ? "Non è possibile inserire ore per turni futuri" : (row.timeEntry ? "Modifica ore" : "Inserisci ore")}
                              className="h-7 w-7 inline-flex items-center justify-center rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {row.timeEntry ? (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                                ) : (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                )}
                              </svg>
                            </button>
                            {row.timeEntry && !isShiftFuture(row.assignment.workday?.date) && (
                              <button
                                onClick={() => handleDeleteClick(row.timeEntry!.id)}
                                aria-label="Elimina"
                                title="Elimina ore"
                                className="h-7 w-7 inline-flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
              <div className="p-4 whitespace-pre-wrap text-sm text-gray-700">{selectedNote || "-"}</div>
            </div>
          </div>
        )}

        {showHoursModal && editingRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">
                {editingTimeEntryId ? "Modifica Ore" : "Inserisci Ore"}
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Dipendente: <strong>{editingRow.userName}</strong>
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
                <div><span className="font-medium text-gray-600">Data:</span> {editingRow.assignment.workday?.date ? new Date(editingRow.assignment.workday.date).toLocaleDateString("it-IT") : "-"}</div>
                <div><span className="font-medium text-gray-600">Evento:</span> {editingRow.assignment.workday?.event?.title || "-"}</div>
                <div><span className="font-medium text-gray-600">Location:</span> {editingRow.assignment.workday?.location?.name || "-"}</div>
                <div><span className="font-medium text-gray-600">Mansione:</span> {editingRow.dutyName || "-"}</div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orario Inizio *</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orario Fine *</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
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
                      actualBreaks: [...formData.actualBreaks, { start: editingRow.assignment.scheduledBreakStartTime || formData.startTime || "", end: editingRow.assignment.scheduledBreakEndTime || formData.endTime || "" }]
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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

        {notifyResultModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-3">
                {notifyResultModal.isError ? "Errore" : "Notifiche inviate"}
              </h2>
              <p className="text-gray-700 text-sm mb-6">{notifyResultModal.message}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setNotifyResultModal(null)}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
