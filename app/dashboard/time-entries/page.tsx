"use client";

import { useState, useEffect } from "react";
import React from "react";
import { useSession } from "next-auth/react";
import { getWorkModeCookie } from "@/lib/workMode";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";

interface TimeEntry {
  id: string;
  assignmentId: string;
  userId: string;
  date: string;
  hoursWorked: number;
  startTime: string | null;
  endTime: string | null;
  hasTakenBreak: boolean | null;
  actualBreakStartTime: string | null;
  actualBreakEndTime: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  plannedHours: number;
  difference: number;
  dutyName?: string | null;
  assignment: {
    id: string;
    startTime: string | null;
    endTime: string | null;
    area: string | null;
    hasScheduledBreak?: boolean;
    scheduledBreakStartTime?: string | null;
    scheduledBreakEndTime?: string | null;
    workday: {
      date: string;
      event: {
        id: string;
        title: string;
      };
      location: {
        id: string;
        name: string;
      } | null;
    };
    taskType: {
      id: string;
      name: string;
      type: string;
    };
  };
}

interface Assignment {
  id: string;
  startTime: string | null;
  endTime: string | null;
  area: string | null;
  plannedHours: number;
  dutyName?: string | null;
  hasScheduledBreak?: boolean;
  scheduledBreakStartTime?: string | null;
  scheduledBreakEndTime?: string | null;
  workday: {
    date: string;
    event: {
      id: string;
      title: string;
    };
    location: {
      id: string;
      name: string;
    } | null;
  };
  taskType: {
    id: string;
    name: string;
    type: string;
  };
}

export default function TimeEntriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Primo del mese corrente
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0); // Ultimo giorno del mese corrente
    return d.toISOString().split("T")[0];
  });

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [formData, setFormData] = useState({
    hoursWorked: "",
    startTime: "",
    endTime: "",
    hasTakenBreak: false,
    actualBreakStartTime: "",
    actualBreakEndTime: "",
    notes: "",
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && session?.user) {
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
      fetchData();
    }
  }, [status, session?.user, router, startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [entriesRes, assignmentsRes] = await Promise.all([
        fetch(`/api/time-entries?startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/time-entries/my-assignments?startDate=${startDate}&endDate=${endDate}`),
      ]);

      if (entriesRes.ok) {
        const data = await entriesRes.json();
        console.log("[time-entries] Time entries loaded:", data.length);
        setTimeEntries(data);
      } else {
        const error = await entriesRes.text();
        console.error("[time-entries] Error loading time entries:", error);
      }

      if (assignmentsRes.ok) {
        const data = await assignmentsRes.json();
        console.log("[time-entries] Assignments without entries loaded:", data.length, data);
        setAssignments(data);
      } else {
        const error = await assignmentsRes.text();
        console.error("[time-entries] Error loading assignments:", error);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Navigazione mese
  const goToPreviousMonth = () => {
    // Parse startDate manually to avoid timezone issues
    const [yearStr, monthStr] = startDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // getMonth() is 0-based
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const yearStart = start.getFullYear();
    const monthStart = String(start.getMonth() + 1).padStart(2, '0');
    const dayStart = String(start.getDate()).padStart(2, '0');
    const yearEnd = end.getFullYear();
    const monthEnd = String(end.getMonth() + 1).padStart(2, '0');
    const dayEnd = String(end.getDate()).padStart(2, '0');
    setStartDate(`${yearStart}-${monthStart}-${dayStart}`);
    setEndDate(`${yearEnd}-${monthEnd}-${dayEnd}`);
  };

  const goToNextMonth = () => {
    // Parse startDate manually to avoid timezone issues
    const [yearStr, monthStr] = startDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // getMonth() is 0-based
    const start = new Date(year, month + 1, 1);
    const end = new Date(year, month + 2, 0);
    const yearStart = start.getFullYear();
    const monthStart = String(start.getMonth() + 1).padStart(2, '0');
    const dayStart = String(start.getDate()).padStart(2, '0');
    const yearEnd = end.getFullYear();
    const monthEnd = String(end.getMonth() + 1).padStart(2, '0');
    const dayEnd = String(end.getDate()).padStart(2, '0');
    setStartDate(`${yearStart}-${monthStart}-${dayStart}`);
    setEndDate(`${yearEnd}-${monthEnd}-${dayEnd}`);
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const yearStart = start.getFullYear();
    const monthStart = String(start.getMonth() + 1).padStart(2, '0');
    const dayStart = String(start.getDate()).padStart(2, '0');
    const yearEnd = end.getFullYear();
    const monthEnd = String(end.getMonth() + 1).padStart(2, '0');
    const dayEnd = String(end.getDate()).padStart(2, '0');
    setStartDate(`${yearStart}-${monthStart}-${dayStart}`);
    setEndDate(`${yearEnd}-${monthEnd}-${dayEnd}`);
  };

  // Calcola ore da startTime/endTime, sottraendo la pausa se presente
  const calculateHours = (start: string, end: string, hasBreak: boolean, breakStart?: string, breakEnd?: string): number => {
    if (!start || !end) return 0;
    try {
      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);
      if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;
      
      const startMinutes = startH * 60 + startM;
      let endMinutes = endH * 60 + endM;
      
      // Gestisci turni che passano mezzanotte
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60;
      }
      
      let totalMinutes = endMinutes - startMinutes;
      
      // Se c'è una pausa fatta, sottraila
      if (hasBreak && breakStart && breakEnd) {
        const [breakStartH, breakStartM] = breakStart.split(":").map(Number);
        const [breakEndH, breakEndM] = breakEnd.split(":").map(Number);
        if (!isNaN(breakStartH) && !isNaN(breakStartM) && !isNaN(breakEndH) && !isNaN(breakEndM)) {
          let breakStartMinutes = breakStartH * 60 + breakStartM;
          let breakEndMinutes = breakEndH * 60 + breakEndM;
          
          // Normalizza la pausa nello stesso intervallo delle ore lavorate
          if (breakStartMinutes < startMinutes) {
            breakStartMinutes += 24 * 60;
          }
          if (breakEndMinutes < breakStartMinutes) {
            breakEndMinutes += 24 * 60;
          }
          
          const breakDuration = breakEndMinutes - breakStartMinutes;
          totalMinutes -= breakDuration;
        }
      }
      
      return totalMinutes / 60;
    } catch (e) {
      return 0;
    }
  };

  const handleOpenModal = (assignment?: Assignment, entry?: TimeEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setSelectedAssignment(null);
      const hasBreak = entry.hasTakenBreak ?? false;
      setFormData({
        hoursWorked: entry.hoursWorked.toString(),
        startTime: entry.startTime || "",
        endTime: entry.endTime || "",
        hasTakenBreak: hasBreak,
        // Carica i valori della pausa solo se effettivamente presente
        actualBreakStartTime: hasBreak ? (entry.actualBreakStartTime || "") : "",
        actualBreakEndTime: hasBreak ? (entry.actualBreakEndTime || "") : "",
        notes: entry.notes || "",
      });
    } else if (assignment) {
      setSelectedAssignment(assignment);
      setEditingEntry(null);
      // Se c'è una pausa prevista, inizializza con quella, altrimenti false
      const hasBreak = assignment.hasScheduledBreak ?? false;
      setFormData({
        hoursWorked: "", // Sarà calcolato automaticamente
        startTime: assignment.startTime || "",
        endTime: assignment.endTime || "",
        hasTakenBreak: hasBreak, // Default: true se c'è pausa prevista, false altrimenti
        actualBreakStartTime: assignment.scheduledBreakStartTime || "",
        actualBreakEndTime: assignment.scheduledBreakEndTime || "",
        notes: "",
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingEntry(null);
    setSelectedAssignment(null);
    setFormData({
      hoursWorked: "",
      startTime: "",
      endTime: "",
      hasTakenBreak: false,
      actualBreakStartTime: "",
      actualBreakEndTime: "",
      notes: "",
    });
  };

  const handleSave = async () => {
    // Validazione orari obbligatori
    if (!formData.startTime || !formData.endTime) {
      alert("Inserisci sia l'orario di inizio che quello di fine");
      return;
    }

    // Calcola ore automaticamente (considerando la pausa solo se il checkbox è selezionato)
    const calculatedHours = calculateHours(
      formData.startTime, 
      formData.endTime, 
      formData.hasTakenBreak,
      // Passa i valori della pausa solo se il checkbox è selezionato
      formData.hasTakenBreak && formData.actualBreakStartTime ? formData.actualBreakStartTime : undefined,
      formData.hasTakenBreak && formData.actualBreakEndTime ? formData.actualBreakEndTime : undefined
    );
    if (calculatedHours <= 0) {
      alert("L'orario di fine deve essere successivo all'orario di inizio");
      return;
    }

    // Validazione pausa se selezionata
    if (formData.hasTakenBreak && (!formData.actualBreakStartTime || !formData.actualBreakEndTime)) {
      alert("Inserisci gli orari di inizio e fine pausa");
      return;
    }

    try {
      const payload: any = {
        hoursWorked: calculatedHours,
        startTime: formData.startTime,
        endTime: formData.endTime,
        notes: formData.notes || null,
      };
      
      // Gestione pausa: sempre includere i campi se c'è una pausa prevista o se si sta modificando un entry esistente
      // Questo permette di rimuovere la pausa anche se non c'è una pausa prevista
      const assignmentHasBreak = (selectedAssignment?.hasScheduledBreak ?? false) || (editingEntry?.assignment?.hasScheduledBreak ?? false);
      const hadBreak = editingEntry?.hasTakenBreak ?? false;
      const hadBreakValues = !!(editingEntry?.actualBreakStartTime || editingEntry?.actualBreakEndTime);
      
      // Includi sempre i campi della pausa se:
      // 1. C'è una pausa prevista (per permettere di deselezionarla)
      // 2. L'utente ha selezionato la pausa
      // 3. Si sta modificando un entry che aveva una pausa o aveva valori di pausa (per permettere di rimuoverla)
      if (assignmentHasBreak || formData.hasTakenBreak || hadBreak || hadBreakValues) {
        payload.hasTakenBreak = formData.hasTakenBreak ?? false;
        // Se il checkbox è deselezionato, imposta SEMPRE a null per rimuovere completamente la pausa
        if (formData.hasTakenBreak) {
          payload.actualBreakStartTime = formData.actualBreakStartTime || null;
          payload.actualBreakEndTime = formData.actualBreakEndTime || null;
        } else {
          // Forza a null quando deselezionato - questo rimuove la pausa dal database
          payload.actualBreakStartTime = null;
          payload.actualBreakEndTime = null;
        }
      }

      let res;
      if (editingEntry) {
        res = await fetch(`/api/time-entries/${editingEntry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (selectedAssignment) {
        res = await fetch("/api/time-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            assignmentId: selectedAssignment.id,
          }),
        });
      } else {
        return;
      }

      if (res.ok) {
        handleCloseModal();
        fetchData();
      } else {
        const error = await res.json();
        alert(`Errore: ${error.error || "Operazione fallita"}`);
      }
    } catch (error) {
      console.error("Error saving time entry:", error);
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
      const res = await fetch(`/api/time-entries/${entryToDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setShowDeleteDialog(false);
        setEntryToDelete(null);
        fetchData();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch (error) {
      console.error("Error deleting time entry:", error);
      alert("Errore durante l'eliminazione");
    }
  };

  // Calcola statistiche
  const allItems = [...timeEntries.map((te) => ({ ...te.assignment, timeEntry: te })), ...assignments];

  const totalPlanned = allItems.reduce((sum, item) => sum + ((item as any).plannedHours || 0), 0);
  const totalWorked = timeEntries.reduce((sum, te) => sum + te.hoursWorked, 0);
  const totalDifference = totalWorked - totalPlanned;

  // Raggruppa per data + evento + location
  type GroupedItem = { type: 'timeEntry'; entry: TimeEntry } | { type: 'assignment'; assignment: Assignment };
  
  const itemsToGroup: GroupedItem[] = [
    ...timeEntries.map(te => ({ type: 'timeEntry' as const, entry: te })),
    ...assignments.map(a => ({ type: 'assignment' as const, assignment: a })),
  ];
  
  // Raggruppa per chiave: date|eventId|locationId
  const groupedByEvent = itemsToGroup.reduce((acc, item) => {
    const date = item.type === 'timeEntry' 
      ? new Date(item.entry.date).toISOString().split('T')[0]
      : new Date(item.assignment.workday.date).toISOString().split('T')[0];
    
    const eventId = item.type === 'timeEntry'
      ? item.entry.assignment.workday.event.id
      : item.assignment.workday.event.id;
    
    const locationId = item.type === 'timeEntry'
      ? item.entry.assignment.workday.location?.id || 'no-location'
      : item.assignment.workday.location?.id || 'no-location';
    
    const key = `${date}|${eventId}|${locationId}`;
    if (!acc[key]) {
      acc[key] = {
        date,
        event: item.type === 'timeEntry' ? item.entry.assignment.workday.event : item.assignment.workday.event,
        location: item.type === 'timeEntry' ? item.entry.assignment.workday.location : item.assignment.workday.location,
        items: []
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, { date: string; event: { id: string; title: string }; location: { id: string; name: string } | null; items: GroupedItem[] }>);

  // Separa i gruppi in due categorie
  type GroupType = { date: string; event: { id: string; title: string }; location: { id: string; name: string } | null; items: GroupedItem[] };
  const groupsWithAssignments: GroupType[] = [];
  const groupsWithOnlyTimeEntries: GroupType[] = [];
  
  Object.values(groupedByEvent).forEach(group => {
    const hasAssignments = group.items.some(item => item.type === 'assignment');
    const hasOnlyTimeEntries = group.items.every(item => item.type === 'timeEntry');
    
    // Se ha almeno un assignment (ore non inserite), va nella prima tabella con TUTTI gli items
    if (hasAssignments) {
      groupsWithAssignments.push(group);
    }
    // Solo se ha SOLO timeEntries (tutte le ore inserite), va nella seconda tabella
    else if (hasOnlyTimeEntries) {
      groupsWithOnlyTimeEntries.push(group);
    }
  });

  // Ordinamento "per vicinanza a oggi":
  // - date future (>= oggi) in alto, dalla più vicina (data crescente)
  // - poi date passate, dalla più vicina (data decrescente)
  const todayKey = new Date().toISOString().split("T")[0];
  const compareGroupsByProximityToToday = (a: GroupType, b: GroupType) => {
    const aKey = a.date;
    const bKey = b.date;

    const aIsFutureOrToday = aKey >= todayKey;
    const bIsFutureOrToday = bKey >= todayKey;
    if (aIsFutureOrToday !== bIsFutureOrToday) return aIsFutureOrToday ? -1 : 1;

    // Entrambe future: crescente (più vicino ad oggi prima)
    if (aIsFutureOrToday) {
      const c = aKey.localeCompare(bKey);
      if (c !== 0) return c;
    } else {
      // Entrambe passate: decrescente (più vicino ad oggi prima)
      const c = bKey.localeCompare(aKey);
      if (c !== 0) return c;
    }

    const e = a.event.title.localeCompare(b.event.title);
    if (e !== 0) return e;
    return (a.location?.name || "").localeCompare(b.location?.name || "");
  };

  const sortedGroupsWithAssignments = groupsWithAssignments.slice().sort(compareGroupsByProximityToToday);
  const sortedGroupsWithOnlyTimeEntries = groupsWithOnlyTimeEntries.slice().sort(compareGroupsByProximityToToday);

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
          <h1 className="text-3xl font-bold text-gray-900">Le Mie Ore</h1>
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[240px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Inizio
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="min-w-[240px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Fine
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={goToPreviousMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                ← Precedente
              </button>
              <button
                onClick={goToCurrentMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Oggi
              </button>
              <button
                onClick={goToNextMonth}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Successivo →
              </button>
            </div>
          </div>
        </div>

        {/* Tabella 1: Eventi con ore da valorizzare */}
        {(
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Ore da Inserire</h2>
            </div>
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
                  {sortedGroupsWithAssignments.map((group, groupIndex) => {
                  const dateStr = new Date(group.date).toLocaleDateString("it-IT");
                  return (
                    <React.Fragment key={`${group.date}-${group.event.id}-${group.location?.id || 'no-location'}`}>
                      {group.items.map((item, itemIndex) => {
                        const isFirstInGroup = itemIndex === 0;
                        
                        if (item.type === 'timeEntry') {
                          const entry = item.entry;
                          const diff = entry.difference;
                          return (
                            <tr key={entry.id}>
                              {isFirstInGroup ? (
                                <>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium" rowSpan={group.items.length}>
                                    {dateStr}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-900 font-medium" rowSpan={group.items.length}>
                                    {group.event.title}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" rowSpan={group.items.length}>
                                    {group.location?.name || "-"}
                                  </td>
                                </>
                              ) : null}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {entry.assignment.taskType.name}
                                {entry.assignment.area && ` - ${entry.assignment.area}`}
                                {entry.dutyName && (
                                  <div className="mt-1 text-xs text-gray-400">
                                    {entry.dutyName}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                <div>
                                  {entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : "-"}
                                </div>
                                {entry.hasTakenBreak && entry.actualBreakStartTime && entry.actualBreakEndTime && (
                                  <div className="mt-1 text-xs text-gray-400 font-normal">
                                    <span className="inline-flex items-center gap-1">
                                      <span>{entry.actualBreakStartTime} - {entry.actualBreakEndTime}</span>
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
                                {entry.notes ? (
                                  <button
                                    onClick={() => {
                                      setSelectedNote(entry.notes || null);
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
                                  "-"
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    onClick={() => handleOpenModal(undefined, entry)}
                                    aria-label="Modifica"
                                    title="Modifica"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteClick(entry.id)}
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
                          );
                        } else {
                          const assignment = item.assignment;
                          return (
                            <tr key={assignment.id}>
                              {isFirstInGroup ? (
                                <>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium" rowSpan={group.items.length}>
                                    {dateStr}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-900 font-medium" rowSpan={group.items.length}>
                                    {group.event.title}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" rowSpan={group.items.length}>
                                    {group.location?.name || "-"}
                                  </td>
                                </>
                              ) : null}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {assignment.taskType.name}
                                {assignment.area && ` - ${assignment.area}`}
                                {assignment.dutyName && (
                                  <div className="mt-1 text-xs text-gray-400">
                                    {assignment.dutyName}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                                Non inserite
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <button
                                  onClick={() => handleOpenModal(assignment)}
                                  aria-label="Inserisci"
                                  title="Inserisci"
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      })}
                      {groupIndex < sortedGroupsWithAssignments.length - 1 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-1 bg-gray-100"></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {sortedGroupsWithAssignments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      Nessun evento con ore da valorizzare
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Tabella 2: Eventi con ore inserite */}
        {(
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Ore Inserite</h2>
            </div>
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
                  {sortedGroupsWithOnlyTimeEntries.map((group, groupIndex) => {
                    const dateStr = new Date(group.date).toLocaleDateString("it-IT");
                    return (
                      <React.Fragment key={`${group.date}-${group.event.id}-${group.location?.id || 'no-location'}`}>
                        {group.items.map((item, itemIndex) => {
                          const isFirstInGroup = itemIndex === 0;
                          
                          if (item.type === 'timeEntry') {
                            const entry = item.entry;
                            return (
                              <tr key={entry.id}>
                                {isFirstInGroup ? (
                                  <>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium" rowSpan={group.items.length}>
                                      {dateStr}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium" rowSpan={group.items.length}>
                                      {group.event.title}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" rowSpan={group.items.length}>
                                      {group.location?.name || "-"}
                                    </td>
                                  </>
                                ) : null}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {entry.assignment.taskType.name}
                                  {entry.assignment.area && ` - ${entry.assignment.area}`}
                                  {entry.dutyName && (
                                    <div className="mt-1 text-xs text-gray-400">
                                      {entry.dutyName}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                  <div>
                                    {entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : "-"}
                                  </div>
                                  {entry.hasTakenBreak && entry.actualBreakStartTime && entry.actualBreakEndTime && (
                                    <div className="mt-1 text-xs text-gray-400 font-normal">
                                      <span className="inline-flex items-center gap-1">
                                        <span>{entry.actualBreakStartTime} - {entry.actualBreakEndTime}</span>
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
                                  {entry.notes ? (
                                    <button
                                      onClick={() => {
                                        setSelectedNote(entry.notes || null);
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
                                    "-"
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      onClick={() => handleOpenModal(undefined, entry)}
                                      aria-label="Modifica"
                                      title="Modifica"
                                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteClick(entry.id)}
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
                            );
                          }
                          return null;
                        })}
                        {groupIndex < sortedGroupsWithOnlyTimeEntries.length - 1 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-1 bg-gray-100"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {sortedGroupsWithOnlyTimeEntries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                        Nessun evento con ore inserite
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && timeEntries.length === 0 && assignments.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            <p className="mb-2">Nessun turno trovato nel periodo selezionato.</p>
            <p className="text-sm">Verifica che ci siano turni assegnati per questo periodo o modifica il range di date.</p>
          </div>
        )}

        {/* Modal Inserisci/Modifica */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">
                {editingEntry ? "Modifica Ore" : "Inserisci Ore"}
              </h2>

              {/* Info Assignment (solo lettura) */}
              {(editingEntry?.assignment || selectedAssignment) && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Data:</span>{" "}
                      {new Date(
                        (editingEntry?.assignment || selectedAssignment)!.workday.date
                      ).toLocaleDateString("it-IT")}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Evento:</span>{" "}
                      {(editingEntry?.assignment || selectedAssignment)!.workday.event.title}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Location:</span>{" "}
                      {(editingEntry?.assignment || selectedAssignment)!.workday.location?.name ||
                        "-"}
                      {((editingEntry?.assignment || selectedAssignment)!.startTime &&
                        (editingEntry?.assignment || selectedAssignment)!.endTime) && (
                        <div className="mt-1">
                          <span className="font-medium text-gray-600">Ore Programmate:</span>{" "}
                          {`${(editingEntry?.assignment || selectedAssignment)!.startTime} - ${
                            (editingEntry?.assignment || selectedAssignment)!.endTime
                          }`}
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Tipo:</span>{" "}
                      {(editingEntry?.assignment || selectedAssignment)!.taskType.name}
                      {(editingEntry?.dutyName || selectedAssignment?.dutyName) && (
                        <div className="mt-1">
                          <span className="font-medium text-gray-600">Mansione:</span>{" "}
                          {editingEntry?.dutyName || selectedAssignment?.dutyName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Orario Inizio *
                    </label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => {
                        const newStartTime = e.target.value;
                        setFormData({ 
                          ...formData, 
                          startTime: newStartTime,
                        });
                      }}
                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Orario Fine *
                    </label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => {
                        const newEndTime = e.target.value;
                        setFormData({ 
                          ...formData, 
                          endTime: newEndTime,
                        });
                      }}
                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Sezione Pausa */}
                {((editingEntry?.assignment || selectedAssignment)?.hasScheduledBreak === true) && (
                  <div className="border-t border-gray-200 pt-4">
                    <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Pausa prevista:</span>{" "}
                        {((editingEntry?.assignment || selectedAssignment)?.scheduledBreakStartTime || "")} - {((editingEntry?.assignment || selectedAssignment)?.scheduledBreakEndTime || "")}
                      </p>
                    </div>
                    <div className="mb-3">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.hasTakenBreak}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            const assignment = editingEntry?.assignment || selectedAssignment;
                            setFormData({
                              ...formData,
                              hasTakenBreak: isChecked,
                              // Quando si seleziona, precompila con la pausa prevista se disponibile, altrimenti mantieni i valori esistenti
                              // Quando si deseleziona, svuota COMPLETAMENTE i campi della pausa
                              actualBreakStartTime: isChecked 
                                ? (assignment?.scheduledBreakStartTime || formData.actualBreakStartTime || "")
                                : "",
                              actualBreakEndTime: isChecked
                                ? (assignment?.scheduledBreakEndTime || formData.actualBreakEndTime || "")
                                : "",
                            });
                          }}
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                        />
                        <span className="text-sm font-medium text-gray-700">Ho fatto la pausa</span>
                      </label>
                    </div>
                    {formData.hasTakenBreak && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Inizio pausa
                          </label>
                          <input
                            type="time"
                            value={formData.actualBreakStartTime}
                            onChange={(e) => setFormData({ ...formData, actualBreakStartTime: e.target.value })}
                            className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fine pausa
                          </label>
                          <input
                            type="time"
                            value={formData.actualBreakEndTime}
                            onChange={(e) => setFormData({ ...formData, actualBreakEndTime: e.target.value })}
                            className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Opzionale: permettere all'utente di inserire una pausa anche se non prevista */}
                {((editingEntry?.assignment || selectedAssignment)?.hasScheduledBreak !== true) && (
                  <div className="border-t border-gray-200 pt-4">
                    <div className="mb-3">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.hasTakenBreak}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setFormData({
                              ...formData,
                              hasTakenBreak: isChecked,
                              // Quando si deseleziona, svuota COMPLETAMENTE i campi della pausa
                              actualBreakStartTime: isChecked ? (formData.actualBreakStartTime || "") : "",
                              actualBreakEndTime: isChecked ? (formData.actualBreakEndTime || "") : "",
                            });
                          }}
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                        />
                        <span className="text-sm font-medium text-gray-700">Ho fatto una pausa</span>
                      </label>
                    </div>
                    {formData.hasTakenBreak && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Inizio pausa
                          </label>
                          <input
                            type="time"
                            value={formData.actualBreakStartTime}
                            onChange={(e) => setFormData({ ...formData, actualBreakStartTime: e.target.value })}
                            className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fine pausa
                          </label>
                          <input
                            type="time"
                            value={formData.actualBreakEndTime}
                            onChange={(e) => setFormData({ ...formData, actualBreakEndTime: e.target.value })}
                            className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ore Lavorate
                  </label>
                  <input
                    type="text"
                    value={formData.startTime && formData.endTime 
                      ? calculateHours(
                          formData.startTime, 
                          formData.endTime,
                          formData.hasTakenBreak,
                          // Passa i valori della pausa solo se il checkbox è selezionato
                          formData.hasTakenBreak && formData.actualBreakStartTime ? formData.actualBreakStartTime : undefined,
                          formData.hasTakenBreak && formData.actualBreakEndTime ? formData.actualBreakEndTime : undefined
                        ).toFixed(2)
                      : "0.00"
                    }
                    readOnly
                    className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calcolato automaticamente dagli orari di inizio e fine{formData.hasTakenBreak ? " (pausa esclusa)" : ""}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note (opzionale)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Es. Straordinario per emergenza, Assenza giustificata..."
                  />
                </div>
              </div>

              {/* Azioni */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteDialog}
          title="Conferma Eliminazione"
          message="Sei sicuro di voler eliminare queste ore inserite? L'operazione non può essere annullata."
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setShowDeleteDialog(false);
            setEntryToDelete(null);
          }}
        />

        {/* Notes Modal */}
        {showNotesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl bg-white rounded-lg shadow-xl border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Note</h3>
                <button
                  onClick={() => {
                    setShowNotesModal(false);
                    setSelectedNote(null);
                  }}
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

