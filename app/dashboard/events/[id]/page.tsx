"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getIncompleteScheduleInfo, getWorkdayAlertStates, getPersonnelAlertState, getClientAlertState } from "../utils";
import { getWorkModeCookie } from "@/lib/workMode";

interface Event {
  id: string;
  title: string;
  clientName: string | null;
  startDate: string;
  endDate: string;
  notes: string | null;
  location: { name: string } | null;
  isClosed: boolean;
  workdays: Workday[];
}

interface Assignment {
  id: string;
  startTime: string;
  endTime: string;
  taskType: { id: string; name: string } | null;
}

interface Workday {
  id: string;
  date: string;
  isOpen: boolean;
  location: { name: string } | null;
  locationId: string | null;
  startTime: string | null;
  endTime: string | null;
  timeSpans: string | null; // JSON string
  assignments?: Assignment[];
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const eventId = params?.id as string;

  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const isWorker = (session?.user as any)?.isWorker === true;
  const isNonStandardWorker = !isStandardUser && isWorker;
  const workMode = getWorkModeCookie();
  const inWorkerMode = isNonStandardWorker && workMode === "worker";

  const canEditEvents = !inWorkerMode && ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");
  const canDeleteEvents = !inWorkerMode && (["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "") || (session?.user as any)?.isAdmin === true || (session?.user as any)?.isSuperAdmin === true);
  const canManageWorkdays = !inWorkerMode && ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"details" | "workdays">("details");
  const [toggleTarget, setToggleTarget] = useState<{id: string, isOpen: boolean} | null>(null);
  const [toggleEventTarget, setToggleEventTarget] = useState<{id: string, isClosed: boolean} | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteWorkdayTarget, setDeleteWorkdayTarget] = useState<string | null>(null);
  const [showCloseEventPrompt, setShowCloseEventPrompt] = useState(false);
  const [showReopenEventPrompt, setShowReopenEventPrompt] = useState(false);
  const [showPastEventEditDialog, setShowPastEventEditDialog] = useState(false);
  const [showPastWorkdayEditDialog, setShowPastWorkdayEditDialog] = useState(false);
  const [pendingWorkdayEditId, setPendingWorkdayEditId] = useState<string | null>(null);
  const [areaNamesMap, setAreaNamesMap] = useState<Record<string, string>>({});
  const [dutyIdToName, setDutyIdToName] = useState<Record<string, string>>({});
  const [dutyMapByWorkday, setDutyMapByWorkday] = useState<Record<string, Record<string,string>>>({});
  const [eventClientsNames, setEventClientsNames] = useState<string[]>([]);
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin === true;
  const isAdminOrSuperAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "workdays") setActiveTab("workdays");
    else if (isStandardUser) setActiveTab("workdays");
    fetchEventFull();
  }, [eventId, searchParams, isStandardUser]);

  const fetchEventFull = async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/full`);
      if (res.ok) {
        const { event: evt, areas: areasList, duties: dutiesList, eventClientsNames: clientNames } = await res.json();
        setEvent(evt);
        setEventClientsNames(clientNames || []);
        const areaMap: Record<string, string> = {};
        (Array.isArray(areasList) ? areasList : []).forEach((a: any) => {
          if (a?.id && a?.name) areaMap[a.id] = a.name;
        });
        setAreaNamesMap(areaMap);
        const dutyMap: Record<string, string> = {};
        (Array.isArray(dutiesList) ? dutiesList : []).forEach((d: any) => {
          const id = d?.id;
          const name = d?.name;
          const code = d?.code;
          if (id && name) dutyMap[id] = name;
          if (name) {
            dutyMap[name] = name;
            if (typeof name === "string") dutyMap[name.toLowerCase()] = name;
          }
          if (code && name) {
            dutyMap[code] = name;
            if (typeof code === "string") dutyMap[code.toLowerCase()] = name;
          }
        });
        setDutyIdToName(dutyMap);
        const wdMaps: Record<string, Record<string, string>> = {};
        (evt?.workdays || []).forEach((wd: any) => {
          if (wd?.dutyIdToName) wdMaps[wd.id] = wd.dutyIdToName;
        });
        setDutyMapByWorkday(wdMaps);
      }
    } catch (error) {
      console.error("Error fetching event:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleWorkday = async () => {
    if (!toggleTarget) return;

    // Se stiamo cercando di aprire una giornata ma l'evento è chiuso, mostra il prompt per riaprire
    if (toggleTarget.isOpen && event?.isClosed) {
      setShowReopenEventPrompt(true);
      return; // Non procedere finché l'utente non conferma
    }

    // Controlla prima del toggle se questa era l'ultima giornata aperta
    const wasClosing = !toggleTarget.isOpen;
    const openWorkdaysCount = event?.workdays?.filter(wd => wd.isOpen).length || 0;
    const wasLastOpen = wasClosing && openWorkdaysCount === 1;

    try {
      const res = await fetch(`/api/workdays/${toggleTarget.id}/toggle`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isOpen: toggleTarget.isOpen }),
      });

      if (res.ok) {
        // Ricarica l'evento per aggiornare le workdays
        await fetchEventFull();
        
        // Se era l'ultima giornata aperta, mostra il prompt per chiudere l'evento
        if (wasLastOpen && !event?.isClosed) {
          setShowCloseEventPrompt(true);
        }
        
        setToggleTarget(null);
      }
    } catch (error) {
      console.error("Error toggling workday:", error);
    }
  };

  const handleConfirmReopenEvent = async () => {
    setShowReopenEventPrompt(false);
    
    if (!toggleTarget) return;

    try {
      const res = await fetch(`/api/workdays/${toggleTarget.id}/toggle`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isOpen: toggleTarget.isOpen }),
      });

      if (res.ok) {
        // Ricarica l'evento per aggiornare le workdays
        await fetchEventFull();
        setToggleTarget(null);
      }
    } catch (error) {
      console.error("Error toggling workday:", error);
    }
  };

  const handleToggleEvent = async () => {
    if (!toggleEventTarget) return;

    try {
      const res = await fetch(`/api/events/${toggleEventTarget.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isClosed: toggleEventTarget.isClosed }),
      });

      if (res.ok) {
        await fetchEventFull();
        setToggleEventTarget(null);
      }
    } catch (error) {
      console.error("Error toggling event:", error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/events/${deleteTarget}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/dashboard/events");
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const handleDeleteWorkday = async () => {
    if (!deleteWorkdayTarget) return;

    try {
      const res = await fetch(`/api/workdays/${deleteWorkdayTarget}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchEventFull();
        setDeleteWorkdayTarget(null);
      }
    } catch (error) {
      console.error("Error deleting workday:", error);
    }
  };

  const handleCloseEventFromPrompt = async () => {
    if (!event) return;

    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isClosed: true }),
      });

      if (res.ok) {
        await fetchEventFull();
        setShowCloseEventPrompt(false);
      }
    } catch (error) {
      console.error("Error closing event:", error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatDateWithWeekday = (dateString: string) => {
    const date = new Date(dateString);
    const weekday = date.toLocaleDateString("it-IT", { weekday: "long" });
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return { weekday, short: `${day}/${month}/${year}` };
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("it-IT");
  };

  const parseTimeSpans = (timeSpansStr: string | null): Array<{ start: string; end: string }> | null => {
    if (!timeSpansStr) return null;
    try {
      return JSON.parse(timeSpansStr);
    } catch {
      return null;
    }
  };

  const getTimeSpansPlainText = (timeSpansStr: string | null, startTime?: string | null, endTime?: string | null): string => {
    const timeSpans = parseTimeSpans(timeSpansStr);
    if (timeSpans && timeSpans.length > 0) {
      return timeSpans.map((ts) => `${ts.start} - ${ts.end}`).join(", ");
    }
    if (startTime && endTime) return `${startTime} - ${endTime}`;
    return "-";
  };

  const calculateWorkDuration = (startTime: string | null, endTime: string | null, timeSpansStr?: string | null): string | null => {
    // Se ci sono timeSpans, calcola la durata totale
    const timeSpans = parseTimeSpans(timeSpansStr || null);
    if (timeSpans && timeSpans.length > 0) {
      let totalMinutes = 0;
      for (const span of timeSpans) {
        const [startHour, startMin] = span.start.split(':').map(Number);
        const [endHour, endMin] = span.end.split(':').map(Number);
        const startTotal = startHour * 60 + startMin;
        let endTotal = endHour * 60 + endMin;
        // Se notturno
        if (endTotal <= startTotal) {
          endTotal += 24 * 60;
        }
        totalMinutes += (endTotal - startTotal);
      }
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}m`;
    }

    // Fallback ai campi legacy
    if (!startTime || !endTime) return null;

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startTotal = startHour * 60 + startMin;
    let endTotal = endHour * 60 + endMin;

    // Se l'orario di fine è precedente all'orario di inizio, significa notturno
    // Aggiungi 24 ore all'orario di fine per il calcolo
    if (endTotal <= startTotal) {
      endTotal += 24 * 60;
    }

    const durationMinutes = endTotal - startTotal;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return `${hours}h ${minutes}m`;
  };

  const renderTimeSpans = (timeSpansStr: string | null): React.ReactNode => {
    const timeSpans = parseTimeSpans(timeSpansStr);
    if (!timeSpans || timeSpans.length === 0) return "-";
    return (
      <div className="flex flex-col gap-0.5">
        {timeSpans.map((ts, idx) => (
          <span key={`${ts.start}-${ts.end}-${idx}`} className="block">{`${ts.start} - ${ts.end}`}</span>
        ))}
      </div>
    );
  };

  const getMaxWorkdaysAllowed = () => {
    if (!event) return 0;
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const canAddWorkday = () => {
    const maxAllowed = getMaxWorkdaysAllowed();
    const existingCount = event?.workdays?.length || 0;
    return existingCount < maxAllowed;
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (!event) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Evento non trovato</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div>
        <div className="mb-6">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.push("/dashboard/events")}
              aria-label="Indietro"
              title="Indietro"
              className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold line-clamp-2 break-words">{event.title}</h1>
              <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
                <button
                  onClick={() => setToggleEventTarget({ id: eventId, isClosed: !event.isClosed })}
                  title={event.isClosed ? "Clicca per aprire l'evento" : "Clicca per chiudere l'evento"}
                  className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors cursor-pointer ${
                    event.isClosed
                      ? "bg-red-100 text-red-800 hover:bg-red-200"
                      : "bg-green-100 text-green-800 hover:bg-green-200"
                  }`}
                >
                  {event.isClosed ? "Chiuso" : "Aperto"}
                </button>
                {canEditEvents && (
                  <>
                    <button
                      onClick={() => {
                        if (event) {
                          const eventEndDate = new Date(event.endDate);
                          const now = new Date();
                          const isPast = eventEndDate < now;
                          if (isPast && !isSuperAdmin) {
                            alert("Gli eventi passati possono essere modificati solo dal Super Admin");
                            return;
                          }
                          if (isPast && isSuperAdmin) {
                            setShowPastEventEditDialog(true);
                            return;
                          }
                        }
                        router.push(`/dashboard/events/${eventId}/edit?tab=${activeTab}`);
                      }}
                      aria-label="Modifica Evento"
                      title="Modifica Evento"
                      className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" /></svg>
                    </button>
                    {canDeleteEvents && (
                      <button
                        onClick={() => setDeleteTarget(eventId)}
                        aria-label="Elimina Evento"
                        title="Elimina Evento"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" /></svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation - Solo per admin/responsabili */}
        {!isStandardUser && (
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab("details")}
                className={`${
                  activeTab === "details"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Dettagli
              </button>
              <button
                onClick={() => setActiveTab("workdays")}
                className={`${
                  activeTab === "workdays"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Giornate ({event.workdays?.length || 0})
              </button>
            </nav>
          </div>
        )}

        {/* Tab Content */}
        {!isStandardUser && activeTab === "details" && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Informazioni Evento</h2>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Titolo</dt>
                  <dd className="mt-1 text-sm text-gray-900">{event.title}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Cliente{eventClientsNames.length > 1 ? 'i' : ''}</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {eventClientsNames.length > 0 ? eventClientsNames.join(", ") : (event.clientName || "-")}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Location</dt>
                  <dd className="mt-1 text-sm text-gray-900">{event.location?.name || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Data Inizio</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(event.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Data Fine</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(event.endDate)}</dd>
                </div>
              </dl>
              {event.notes && (
                <div className="mt-4">
                  <dt className="text-sm font-medium text-gray-500">Note</dt>
                  <dd className="mt-1 text-sm text-gray-900">{event.notes}</dd>
                </div>
              )}
            </div>
          </div>
        )}

        {(isStandardUser || activeTab === "workdays") && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Giornate di Lavoro</h2>
                {event && (
                  <p className="text-sm text-gray-500 mt-1">
                    Giornate create: {event.workdays?.length || 0} / {getMaxWorkdaysAllowed()} consentite
                  </p>
                )}
              </div>
              {canEditEvents && (
                <div>
                  {canAddWorkday() ? (
                    <button
                      onClick={() => router.push(`/dashboard/events/${eventId}/workdays/new`)}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                    >
                      Aggiungi Giornata
                    </button>
                  ) : (
                    <button
                      disabled
                      className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed opacity-50"
                    >
                      Limite raggiunto ({getMaxWorkdaysAllowed()} giornate)
                    </button>
                  )}
                </div>
              )}
            </div>

            {event.workdays && event.workdays.length > 0 ? (
              <>
              {/* Mobile: card per ogni giornata */}
              <div className="lg:hidden space-y-3">
                {event.workdays.map((workday) => {
                  const { weekday, short } = formatDateWithWeekday(workday.date);
                  const canOpen = canManageWorkdays || workday.isOpen;
                  const a = getWorkdayAlertStates({ ...(workday as any), areaNamesMap } as any);
                  const c = getClientAlertState(workday as any);
                  const localMap = dutyMapByWorkday[workday.id] || dutyIdToName;
                  const p = getPersonnelAlertState({ ...(workday as any), dutyIdToName: localMap });
                  return (
                    <div
                      key={workday.id}
                      onClick={() => canOpen && router.push(`/dashboard/events/${eventId}/workdays/${workday.id}`)}
                      className={`bg-white rounded-lg border border-gray-200 p-4 shadow-sm ${canOpen ? "cursor-pointer active:bg-gray-50" : "opacity-60 cursor-not-allowed"}`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-gray-900 capitalize">{weekday}</div>
                            <div className="text-sm text-gray-500">{short}</div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                            workday.isOpen ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                            {workday.isOpen ? "Aperta" : "Chiusa"}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="text-gray-500">Location:</span> {workday.location?.name || "-"}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="text-gray-500">Orari:</span> {getTimeSpansPlainText(workday.timeSpans, workday.startTime, workday.endTime)}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="text-gray-500">Durata:</span> {calculateWorkDuration(workday.startTime, workday.endTime, workday.timeSpans) || "-"}
                        </div>
                        {canManageWorkdays && (
                          <div className="flex items-center gap-3 pt-2 flex-wrap">
                            <div className="flex items-center gap-2.5">
                              <svg className={`w-4 h-4 ${a.activityMissing ? 'text-red-600' : (a.activityCoverageGap ? 'text-yellow-600' : 'text-green-600')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <svg className={`w-4 h-4 ${a.shiftMissing || a.shiftCoverageGap ? (a.shiftMissing ? 'text-red-600' : 'text-yellow-600') : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span className={`text-sm font-normal ${c.color === 'red' ? 'text-red-600' : c.color === 'yellow' ? 'text-yellow-600' : 'text-green-600'}`} style={{ fontFamily: 'Arial, sans-serif' }}>€</span>
                              <svg className={`w-4 h-4 ${p.color === 'red' ? 'text-red-600' : p.color === 'yellow' ? 'text-yellow-600' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 7a3 3 0 110 6 3 3 0 010-6zM6 20a6 6 0 1112 0v1H6v-1z" /></svg>
                            </div>
                            <span className="text-xs font-semibold text-gray-900">Gestisci →</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: tabella */}
              <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orari
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Durata
                      </th>
                      {canManageWorkdays && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Gestione
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stato
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Azioni
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {event.workdays.map((workday) => (
                      <tr key={workday.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(workday.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {workday.location?.name || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {renderTimeSpans(workday.timeSpans) !== "-" 
                            ? renderTimeSpans(workday.timeSpans)
                            : workday.startTime && workday.endTime
                            ? `${workday.startTime} - ${workday.endTime}`
                            : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {calculateWorkDuration(workday.startTime, workday.endTime, workday.timeSpans) || "-"}
                        </td>
                        {canManageWorkdays && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const a = getWorkdayAlertStates({ ...(workday as any), areaNamesMap } as any);
                                return (
                                  <div className="relative flex items-center gap-2.5">
                                  <div className={`relative inline-flex ${a.activityMissing || a.activityCoverageGap ? 'group' : ''}`}>
                                      <svg className={`w-4 h-4 ${a.activityMissing ? 'text-red-600' : (a.activityCoverageGap ? 'text-yellow-600' : 'text-green-600')} flex-shrink-0 ${a.activityMissing || a.activityCoverageGap ? 'cursor-help' : 'cursor-default'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                                      </svg>
                                      {(a.activityMissing || a.activityCoverageGap) && (
                                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block p-2.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                                        <div className="font-semibold text-[11px] mb-1">Programmazione attività</div>
                                        <div className="flex items-center gap-2">
                                          <svg className={`w-4 h-4 ${a.activityMissing ? 'text-red-500' : 'text-yellow-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                                          </svg>
                                          <div className="text-[11px] leading-snug whitespace-nowrap">{a.activityMissing ? a.activityMessage : a.activityCoverageMessage}</div>
                                        </div>
                                        <div className="absolute left-3 top-full w-0 h-0 border-l-3 border-r-3 border-t-3 border-transparent border-t-gray-900"></div>
                                      </div>)}
                                    </div>
                                  <>
                                      <div className={`relative inline-flex ${a.shiftMissing || a.shiftCoverageGap ? 'group' : ''}`}>
                                        <svg className={`w-4 h-4 ${a.shiftMissing || a.shiftCoverageGap ? (a.shiftMissing ? 'text-red-600' : 'text-yellow-600') : 'text-green-600'} flex-shrink-0 ${a.shiftMissing || a.shiftCoverageGap ? 'cursor-help' : 'cursor-default'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {(a.shiftMissing || a.shiftCoverageGap) && (
                                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block p-2.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                                          <div className="font-semibold text-[11px] mb-1">Programmazione turni</div>
                                          {a.shiftMissing && (
                                            (a.shiftMessages && a.shiftMessages.length > 0 ? a.shiftMessages : [a.shiftMessage]).map((msg, idx) => (
                                              <div key={idx} className={`flex items-center gap-2 ${idx < ((a.shiftMessages?.length || 1) - 1) ? 'mb-1' : ''}`}>
                                                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <div className="text-[11px] leading-snug whitespace-nowrap">{msg}</div>
                                              </div>
                                            ))
                                          )}
                                          {a.shiftCoverageGap && (
                                            <div className="flex items-center gap-2">
                                              <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                              <div className="text-[11px] leading-snug whitespace-nowrap">{a.shiftCoverageMessage}</div>
                                            </div>
                                          )}
                                          <div className="absolute left-3 top-full w-0 h-0 border-l-3 border-r-3 border-t-3 border-transparent border-t-gray-900"></div>
                                        </div>)}
                                      </div>
                                      
                                      {/* icona € (stato clienti) */}
                                      {(() => {
                                        const c = getClientAlertState(workday as any);
                                        const color = c.color === 'red' ? 'text-red-600' : c.color === 'yellow' ? 'text-yellow-600' : 'text-green-600';
                                        return (
                                          <div className={`relative inline-flex ${c.color !== 'green' ? 'group' : ''}`}>
                                            <span className={`text-base font-normal ${color} flex-shrink-0 leading-none`} style={{ fontFamily: 'Arial, sans-serif', fontWeight: 400 }}>€</span>
                                            {c.messages && c.messages.length > 0 && (
                                              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block p-2.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                                                <div className="font-semibold text-[11px]">Clienti turni</div>
                                                <div className="flex items-center gap-2">
                                                  <span className={`text-base font-normal ${c.color==='red'?'text-red-500':c.color==='yellow'?'text-yellow-500':'text-green-500'}`} style={{ fontFamily: 'Arial, sans-serif', fontWeight: 400 }}>€</span>
                                                  <div className="text-[11px] leading-snug whitespace-nowrap">{c.messages[0]}</div>
                                                </div>
                                                {c.messages.slice(1).map((m, idx) => (
                                                  <div key={idx} className="text-[11px] leading-snug whitespace-nowrap">
                                                    {m}
                                                  </div>
                                                ))}
                                                <div className="absolute left-3 top-full w-0 h-0 border-l-3 border-r-3 border-t-3 border-transparent border-t-gray-900"></div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                      
                                      {/* icona persona singola (stato personale) */}
                                      {(() => {
                                        const localMap = dutyMapByWorkday[workday.id] || dutyIdToName;
                                        const p = getPersonnelAlertState({ ...(workday as any), dutyIdToName: localMap });
                                        const color = p.color === 'red' ? 'text-red-600' : p.color === 'yellow' ? 'text-yellow-600' : 'text-green-600';
                                        return (
                                          <div className={`relative inline-flex ${p.color !== 'green' ? 'group' : ''}`}>
                                            <svg className={`w-5 h-5 -mt-1 ${color} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 7a3 3 0 110 6 3 3 0 010-6z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 20a6 6 0 1112 0v1H6v-1z" />
                                            </svg>
                                            {p.messages && p.messages.length > 0 && (
                                              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block p-2.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                                                <div className="font-semibold text-[11px] mb-1">Programmazione personale</div>
                                                {p.messages.map((m, idx) => (
                                                  <div key={idx} className="flex items-center gap-2 text-[11px] leading-snug whitespace-nowrap">
                                                    {idx === 0 && (
                                                      <svg className={`w-4 h-4 ${p.color==='red'?'text-red-500':p.color==='yellow'?'text-yellow-500':'text-green-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 7a3 3 0 110 6 3 3 0 010-6z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 20a6 6 0 1112 0v1H6v-1z" />
                                                      </svg>
                                                    )}
                                                    <div>{m}</div>
                                                  </div>
                                                ))}
                                                <div className="absolute left-3 top-full w-0 h-0 border-l-3 border-r-3 border-t-3 border-transparent border-t-gray-900"></div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </>
                                  </div>
                                );
                              })()}
                              {/* Tasto Gestisci tra icone e durata (solo ruoli abilitati) */}
                              <button
                                onClick={() => router.push(`/dashboard/events/${eventId}/workdays/${workday.id}`)}
                                className="ml-3 h-8 inline-flex items-center justify-center px-3 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-all duration-200 cursor-pointer"
                              >
                                <span className="text-xs font-semibold">Gestisci</span>
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {canEditEvents ? (
                              <button
                                onClick={() => setToggleTarget({ id: workday.id, isOpen: !workday.isOpen })}
                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer hover:opacity-80 transition-opacity ${
                                  workday.isOpen
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {workday.isOpen ? "Aperta" : "Chiusa"}
                              </button>
                            ) : (
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  workday.isOpen
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {workday.isOpen ? "Aperta" : "Chiusa"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            {/* Visualizza */}
                            {(canManageWorkdays || workday.isOpen) ? (
                              <button
                                onClick={() => router.push(`/dashboard/events/${eventId}/workdays/${workday.id}?readonly=1`)}
                                aria-label="Visualizza"
                                title="Visualizza"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                            ) : (
                              <span className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-300 text-white opacity-50 cursor-not-allowed" title="Giornata chiusa">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </span>
                            )}
                            {/* Modifica */}
                            {canEditEvents && (
                              <button
                                onClick={() => {
                                  // Verifica se la giornata è terminata
                                  const workdayDate = new Date(workday.date);
                                  const now = new Date();
                                  now.setHours(0, 0, 0, 0);
                                  workdayDate.setHours(0, 0, 0, 0);
                                  const isPast = workdayDate < now;
                                  
                                  if (isPast && !isAdminOrSuperAdmin) {
                                    alert("Le giornate terminate possono essere modificate solo da Admin o Super Admin");
                                    return;
                                  }
                                  
                                  if (isPast && isAdminOrSuperAdmin) {
                                    setPendingWorkdayEditId(workday.id);
                                    setShowPastWorkdayEditDialog(true);
                                    return;
                                  }
                                  
                                  router.push(`/dashboard/events/${eventId}/workdays/${workday.id}/edit`);
                                }}
                                aria-label="Modifica"
                                title="Modifica"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                                </svg>
                              </button>
                            )}
                            {/* Elimina */}
                            {canEditEvents && (
                              <button
                                onClick={() => setDeleteWorkdayTarget(workday.id)}
                                aria-label="Elimina"
                                title="Elimina"
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
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">Nessuna giornata di lavoro pianificata</p>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={toggleTarget !== null}
        title="Conferma Operazione"
        message={
          toggleTarget?.isOpen
            ? "Sei sicuro di voler aprire questa giornata?"
            : "Sei sicuro di voler chiudere questa giornata?"
        }
        onConfirm={handleToggleWorkday}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Conferma Eliminazione"
        message={
          event && (event.workdays?.length ?? 0) > 0
            ? "Questo evento ha giornate di lavoro attive. Vuoi procedere? L'azione non è reversibile."
            : "Sei sicuro di voler eliminare questo evento? Questa azione non può essere annullata."
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        isOpen={deleteWorkdayTarget !== null}
        title="Conferma Eliminazione"
        message="Sei sicuro di voler eliminare questa giornata di lavoro? Questa azione non può essere annullata."
        onConfirm={handleDeleteWorkday}
        onCancel={() => setDeleteWorkdayTarget(null)}
      />

      <ConfirmDialog
        isOpen={toggleEventTarget !== null}
        title="Conferma Operazione"
        message={
          toggleEventTarget?.isClosed
            ? "Sei sicuro di voler chiudere questo evento? Tutte le giornate di lavoro ancora aperte verranno chiuse automaticamente e gli utenti non potranno più interagire con l'evento."
            : "Sei sicuro di voler riaprire questo evento?"
        }
        onConfirm={handleToggleEvent}
        onCancel={() => setToggleEventTarget(null)}
      />

      <ConfirmDialog
        isOpen={showCloseEventPrompt}
        title="Chiudere l'evento?"
        message="Le giornate relative a questo evento sono state chiuse, vuoi procedere alla chiusura dell'intero evento? Gli utenti non potranno più interagire con l'evento."
        onConfirm={handleCloseEventFromPrompt}
        onCancel={() => setShowCloseEventPrompt(false)}
      />

      <ConfirmDialog
        isOpen={showReopenEventPrompt}
        title="Riaprire l'evento?"
        message="Aprendo questa giornata di lavoro, anche l'evento verrà riaperto automaticamente. Vuoi continuare?"
        onConfirm={handleConfirmReopenEvent}
        onCancel={() => {
          setShowReopenEventPrompt(false);
          setToggleTarget(null);
        }}
      />

      <ConfirmDialog
        isOpen={showPastEventEditDialog}
        title="Attenzione: Evento Terminato"
        message="Questo evento è già terminato. Sei sicuro di voler procedere con le modifiche?"
        onConfirm={() => {
          setShowPastEventEditDialog(false);
          router.push(`/dashboard/events/${eventId}/edit?tab=${activeTab}`);
        }}
        onCancel={() => setShowPastEventEditDialog(false)}
      />

      <ConfirmDialog
        isOpen={showPastWorkdayEditDialog}
        title="Attenzione: Giornata Terminata"
        message="Questa giornata di lavoro è già terminata. Sei sicuro di voler procedere con le modifiche?"
        onConfirm={() => {
          setShowPastWorkdayEditDialog(false);
          if (pendingWorkdayEditId) {
            router.push(`/dashboard/events/${eventId}/workdays/${pendingWorkdayEditId}/edit`);
            setPendingWorkdayEditId(null);
          }
        }}
        onCancel={() => {
          setShowPastWorkdayEditDialog(false);
          setPendingWorkdayEditId(null);
        }}
      />
    </DashboardShell>
  );
}

