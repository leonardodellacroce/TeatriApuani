"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import SearchableSelect from "@/components/SearchableSelect";
import { useRouter } from "next/navigation";
import { getWorkModeCookie } from "@/lib/workMode";
import { exportReportToExcel } from "@/lib/exportReportToExcel";

type ReportType = "cliente" | "evento" | "mansione" | "azienda" | "dipendente";

export default function ReportsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [reportType, setReportType] = useState<ReportType | "">("");
  const [loading, setLoading] = useState(false);
  const isResponsabile = (session?.user?.role as string) === "RESPONSABILE";
  const [responsabileCompanyId, setResponsabileCompanyId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [error, setError] = useState<string>("");

  // Filtri comuni
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [hoursType, setHoursType] = useState<"scheduled" | "actual">("actual");
  const [includeBreaksHourly, setIncludeBreaksHourly] = useState<boolean>(true);
  const [showBreakTimes, setShowBreakTimes] = useState<boolean>(false);
  const [showDailyDetailsAzienda, setShowDailyDetailsAzienda] = useState<boolean>(false);
  const [showDailyDetailsDipendente, setShowDailyDetailsDipendente] = useState<boolean>(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

  // Filtri per tipo report
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedEventClientId, setSelectedEventClientId] = useState<string>("");
  const [eventClients, setEventClients] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDutyId, setSelectedDutyId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  // Dati per i dropdown
  const [clients, setClients] = useState<any[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]); // Tutti gli eventi (non filtrati)
  const [events, setEvents] = useState<any[]>([]); // Eventi filtrati
  const [duties, setDuties] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    if (!session) return;

    const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes((session.user?.role as string) || "");
    const isWorker = (session.user as any)?.isWorker === true;
    const isNonStandardWorker = !isStandardUser && isWorker;
    const workMode = getWorkModeCookie();
    if (isNonStandardWorker && workMode === "worker") {
      router.replace("/dashboard");
      return;
    }
    
    // Imposta date di default (mese corrente: dal 1° all'ultimo giorno)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    // Primo giorno del mese corrente
    const start = new Date(year, month, 1);
    
    // Ultimo giorno del mese corrente
    const end = new Date(year, month + 1, 0);
    
    // Formatta le date in formato YYYY-MM-DD senza problemi di fuso orario
    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));

    fetchClients();
    fetchEvents();
    fetchDuties();
    fetchLocations();
    fetchUsers();
    fetchCompanies();
    if ((session?.user?.role as string) === "RESPONSABILE") {
      fetch("/api/users/me")
        .then((r) => r.ok ? r.json() : null)
        .then((u) => u?.companyId && setResponsabileCompanyId(u.companyId))
        .catch(() => {});
    }
  }, [session]);

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const goToPreviousMonth = () => {
    const start = new Date(startDate + 'T00:00:00'); // Evita problemi di fuso orario
    start.setMonth(start.getMonth() - 1);
    start.setDate(1); // Primo del mese
    
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // Ultimo giorno del mese
    
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  const goToNextMonth = () => {
    const start = new Date(startDate + 'T00:00:00'); // Evita problemi di fuso orario
    start.setMonth(start.getMonth() + 1);
    start.setDate(1); // Primo del mese
    
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // Ultimo giorno del mese
    
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        // Filtra i clienti vuoti (senza nome/ragioneSociale)
        const filtered = data.filter((client: any) => {
          if (client.type === "PRIVATO") {
            return (client.nome || "").trim() || (client.cognome || "").trim();
          } else {
            return (client.ragioneSociale || "").trim();
          }
        });
        setClients(filtered);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setAllEvents(data);
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };

  // Filtra gli eventi in base all'intervallo di date quando reportType è "evento"
  useEffect(() => {
    if (reportType === "evento" && startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const filtered = allEvents.filter((event: any) => {
        const eventStart = new Date(event.startDate);
        const eventEnd = new Date(event.endDate);
        
        // L'evento è incluso se si sovrappone all'intervallo selezionato
        // Evento incluso se: eventStart <= end && eventEnd >= start
        return eventStart <= end && eventEnd >= start;
      });
      
      setEvents(filtered);
      
      // Se l'evento selezionato non è più nell'elenco filtrato, resettalo
      if (selectedEventId && !filtered.find((e: any) => e.id === selectedEventId)) {
        setSelectedEventId("");
      }
    } else {
      // Se non è report per evento, mostra tutti gli eventi
      setEvents(allEvents);
    }
  }, [reportType, startDate, endDate, allEvents, selectedEventId]);

  const fetchDuties = async () => {
    try {
      const res = await fetch("/api/duties");
      if (res.ok) {
        const data = await res.json();
        setDuties(data);
      }
    } catch (error) {
      console.error("Error fetching duties:", error);
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

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users?standard=true");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const generateReport = async () => {
    if (!reportType) {
      setError("Seleziona una tipologia di report");
      return;
    }
    setLoading(true);
    setError("");
    setReportData(null);

    try {
      let url = `/api/reports/${reportType}?`;
      
      // Parametri comuni
      if (startDate) url += `startDate=${startDate}&`;
      if (endDate) url += `endDate=${endDate}&`;
      url += `hoursType=${hoursType}&`;
      url += `includeBreaksHourly=${isResponsabile ? true : includeBreaksHourly}&`;
      url += `showBreakTimes=${isResponsabile ? true : showBreakTimes}&`;

      // Parametri specifici per tipo
      if (reportType === "cliente") {
        if (!selectedClientId) {
          setError("Seleziona un cliente");
          setLoading(false);
          return;
        }
        url += `clientId=${selectedClientId}`;
      } else if (reportType === "evento") {
        if (!selectedEventId) {
          setError("Seleziona un evento");
          setLoading(false);
          return;
        }
        url += `eventId=${selectedEventId}`;
        if (selectedEventClientId) {
          url += `&clientId=${selectedEventClientId}`;
        }
      } else if (reportType === "mansione") {
        if (!selectedDutyId) {
          setError("Seleziona una mansione");
          setLoading(false);
          return;
        }
        url += `dutyId=${selectedDutyId}`;
        if (selectedLocationId) url += `&locationId=${selectedLocationId}`;
        if (selectedClientId) {
          url += `&clientId=${selectedClientId}`;
        }
      } else if (reportType === "azienda") {
        const companyIdToUse = isResponsabile ? responsabileCompanyId : selectedCompanyId;
        if (companyIdToUse) {
          url += `companyId=${companyIdToUse}`;
        }
        url += (companyIdToUse ? "&" : "") + `includeDailyDetails=${showDailyDetailsAzienda}`;
        // RESPONSABILE: solo la propria azienda (companyId impostato dall'API)
      } else if (reportType === "dipendente") {
        if (selectedUserId) {
          url += `userId=${selectedUserId}`;
        }
        url += (selectedUserId ? "&" : "") + `includeDailyDetails=${showDailyDetailsDipendente}`;
        // Se non selezionato, mostra tutti i dipendenti
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Se è un report per evento e contiene la lista dei clienti, aggiorna lo stato
        if (reportType === "evento" && data.clients) {
          setEventClients(data.clients);
        }
        setReportData(data);
      } else {
        const errorData = await res.json();
        setError(errorData.error || "Errore durante la generazione del report");
      }
    } catch (error) {
      console.error("Error generating report:", error);
      setError("Errore durante la generazione del report");
    } finally {
      setLoading(false);
    }
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const renderClienteReport = (data: any) => {
    return (
      <div className="space-y-6">
        {/* Header con informazioni generali */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Report per Cliente</h2>
          <div className="mb-4 space-y-2">
            <p className="text-gray-600"><strong>Cliente:</strong> {data.clientName || data.clientId}</p>
            <p className="text-gray-600"><strong>Periodo:</strong> {new Date(data.startDate).toLocaleDateString('it-IT')} - {new Date(data.endDate).toLocaleDateString('it-IT')}</p>
          </div>
        </div>

        {/* Riepilogo per tipologia turno */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4">Riepilogo per Tipologia Turno</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Codice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipologia Turno</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Turni Totali</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Straordinari</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.summaryByDuty && data.summaryByDuty.length > 0 ? (
                  data.summaryByDuty.map((duty: any, index: number) => {
                    const totalShifts = duty.shifts ?? 0;
                    const hasShiftData = totalShifts > 0 || (duty.overtimeHours ?? 0) > 0;
                    return (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{duty.dutyCode || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{duty.dutyName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {hasShiftData ? formatHours(0) : formatHours(duty.hours ?? 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{totalShifts} {totalShifts === 1 ? 'turno' : 'turni'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatHours(duty.overtimeHours ?? 0)}</td>
                    </tr>
                  );})
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">Nessun dato disponibile</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dettaglio giornaliero */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4">Dettaglio Giornaliero</h3>
          {data.dailyDetails && data.dailyDetails.length > 0 ? (
            <div className="space-y-6">
              {data.dailyDetails.map((day: any, dayIndex: number) => (
                <div key={dayIndex} className="border border-gray-200 rounded-lg p-4">
                  <div className="mb-3">
                    <h4 className="text-lg font-semibold text-gray-900">
                      {new Date(day.date).toLocaleDateString('it-IT', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </h4>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      {day.locationName && (
                        <p><strong>Location:</strong> {day.locationName}</p>
                      )}
                      {day.eventTitle && (
                        <p><strong>Evento:</strong> {day.eventTitle}</p>
                      )}
                    </div>
                  </div>
                  
                  {(day.taskTypes || day.duties || []).map((taskType: any, taskTypeIndex: number) => (
                    <div key={taskTypeIndex} className="mb-4 last:mb-0">
                      <div className="mb-2">
                        <span className="font-semibold text-gray-700">{taskType.taskTypeName || taskType.dutyName}</span>
                        {taskType.dutyCode && (
                          <span className="ml-2 text-sm text-gray-500">({taskType.dutyCode})</span>
                        )}
                        <span className="ml-4 text-sm font-medium text-gray-900">
                          {(() => {
                            const totalShifts = (taskType.shifts || []).reduce((sum: number, shift: any) => sum + (shift.shifts || 0), 0);
                            const totalOvertime = (taskType.shifts || []).reduce((sum: number, shift: any) => sum + (shift.overtimeHours || 0), 0);
                            const isShiftService = taskType.isHourlyService === false;
                            if (isShiftService) {
                              return `Totale: ${totalShifts} ${totalShifts === 1 ? 'turno' : 'turni'}${totalOvertime > 0 ? ` + ${formatHours(totalOvertime)} di straordinari` : ''}`;
                            }
                            return `Totale: ${formatHours(taskType.totalHours || 0)}`;
                          })()}
                        </span>
                      </div>
                      
                      <div className="ml-4 space-y-3">
                        {(taskType.shifts || []).map((shift: any, shiftIndex: number) => (
                          <div key={shiftIndex} className="border-l-2 border-gray-300 pl-3 py-2">
                            <div className="text-sm text-gray-600 mb-1">
                              <span className="font-medium">
                                <strong>Orario:</strong> {shift.startTime || "-"} - {shift.endTime || "-"}
                              </span>
                              {shift.hasScheduledBreak && shift.scheduledBreakStartTime && shift.scheduledBreakEndTime &&
                                reportData?.showBreakTimes !== false && (
                                <span className="ml-4">
                                  <strong>Pausa:</strong> {shift.scheduledBreakStartTime} - {shift.scheduledBreakEndTime}
                                </span>
                              )}
                              <span className="ml-4">
                                <strong>Persone:</strong> {shift.numberOfPeople}
                              </span>
                              <span className="ml-4">
                                {(() => {
                                  const numShifts = Number(shift.shifts) || 0;
                                  const isShiftService = taskType.isHourlyService === false;
                                  if (isShiftService) {
                                    return (
                                      <>
                                        <strong>Turni:</strong> {numShifts} {numShifts === 1 ? 'turno' : 'turni'}
                                        {(shift.overtimeHours ?? 0) > 0 && (
                                          <span className="ml-2">
                                            + <strong>Straordinari:</strong> {formatHours(shift.overtimeHours)}
                                          </span>
                                        )}
                                      </>
                                    );
                                  }
                                  return (
                                    <>
                                      <strong>Ore totali:</strong> {formatHours(shift.totalHours || 0)}
                                    </>
                                  );
                                })()}
                              </span>
                            </div>
                            {shift.duties && shift.duties.length > 0 && (
                              <div className="ml-4 mt-1 space-y-1">
                                {shift.duties.map((duty: any, dutyIndex: number) => (
                                  <div key={dutyIndex} className="text-xs text-gray-500">
                                    • {duty.dutyName} ({duty.dutyCode}): {duty.numberOfPeople} {duty.numberOfPeople === 1 ? 'persona' : 'persone'}
                                    {taskType.isHourlyService === false
                                      ? `, ${Number(shift.shifts) || 0} ${(Number(shift.shifts) || 0) === 1 ? 'turno' : 'turni'}${(shift.overtimeHours ?? 0) > 0 ? ` + ${formatHours(shift.overtimeHours)} straordinari` : ''}`
                                      : `, ${formatHours(duty.totalHours || 0)}`}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Nessun dettaglio giornaliero disponibile</p>
          )}
        </div>
      </div>
    );
  };

  const renderEventoReport = (data: any) => {
    return (
      <div className="space-y-6">
        {/* Header con informazioni generali */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Report per Evento</h2>
          <div className="mb-4 space-y-2">
            <p className="text-gray-600"><strong>Evento:</strong> {data.eventTitle}</p>
            {data.locationName && (
              <p className="text-gray-600"><strong>Location:</strong> {data.locationName}</p>
            )}
          </div>
        </div>

        {/* Riepilogo per tipologia turno */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4">Riepilogo per Tipologia Turno</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Codice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipologia Turno</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Turni Totali</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Straordinari</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.summaryByDuty && data.summaryByDuty.length > 0 ? (
                  data.summaryByDuty.map((duty: any, index: number) => {
                    const totalShifts = duty.shifts ?? 0;
                    const hasShiftData = totalShifts > 0 || (duty.overtimeHours ?? 0) > 0;
                    return (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{duty.dutyCode || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{duty.dutyName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {hasShiftData ? formatHours(0) : formatHours(duty.hours ?? 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{totalShifts} {totalShifts === 1 ? 'turno' : 'turni'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatHours(duty.overtimeHours ?? 0)}</td>
                    </tr>
                  );})
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">Nessun dato disponibile</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dettaglio giornaliero */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4">Dettaglio Giornaliero</h3>
          {data.dailyDetails && data.dailyDetails.length > 0 ? (
            <div className="space-y-6">
              {data.dailyDetails.map((day: any, dayIndex: number) => (
                <div key={dayIndex} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-lg font-semibold mb-3 text-gray-900">
                    {new Date(day.date).toLocaleDateString('it-IT', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </h4>
                  
                  {(day.taskTypes || []).map((taskType: any, taskTypeIndex: number) => (
                    <div key={taskTypeIndex} className="mb-4 last:mb-0">
                      <div className="mb-2">
                        <span className="font-semibold text-gray-700">{taskType.taskTypeName}</span>
                        <span className="ml-4 text-sm font-medium text-gray-900">
                          {(() => {
                            const totalShifts = (taskType.shifts || []).reduce((sum: number, shift: any) => sum + (shift.shifts || 0), 0);
                            const totalOvertime = (taskType.shifts || []).reduce((sum: number, shift: any) => sum + (shift.overtimeHours || 0), 0);
                            const isShiftService = taskType.isHourlyService === false;
                            if (isShiftService) {
                              return `Totale: ${totalShifts} ${totalShifts === 1 ? 'turno' : 'turni'}${totalOvertime > 0 ? ` + ${formatHours(totalOvertime)} di straordinari` : ''}`;
                            }
                            return `Totale: ${formatHours(taskType.totalHours || 0)}`;
                          })()}
                        </span>
                      </div>
                      
                      <div className="ml-4 space-y-3">
                        {(taskType.shifts || []).map((shift: any, shiftIndex: number) => (
                          <div key={shiftIndex} className="border-l-2 border-gray-300 pl-3 py-2">
                            <div className="text-sm text-gray-600 mb-1">
                              <span className="font-medium">
                                <strong>Orario:</strong> {shift.startTime || "-"} - {shift.endTime || "-"}
                              </span>
                              {shift.hasScheduledBreak && shift.scheduledBreakStartTime && shift.scheduledBreakEndTime &&
                                reportData?.showBreakTimes !== false && (
                                <span className="ml-4">
                                  <strong>Pausa:</strong> {shift.scheduledBreakStartTime} - {shift.scheduledBreakEndTime}
                                </span>
                              )}
                              <span className="ml-4">
                                <strong>Persone:</strong> {shift.numberOfPeople}
                              </span>
                              <span className="ml-4">
                                {(() => {
                                  const numShifts = Number(shift.shifts) || 0;
                                  const isShiftService = taskType.isHourlyService === false;
                                  if (isShiftService) {
                                    return (
                                      <>
                                        <strong>Turni:</strong> {numShifts} {numShifts === 1 ? 'turno' : 'turni'}
                                        {(shift.overtimeHours ?? 0) > 0 && (
                                          <span className="ml-2">
                                            + <strong>Straordinari:</strong> {formatHours(shift.overtimeHours)}
                                          </span>
                                        )}
                                      </>
                                    );
                                  }
                                  return (
                                    <>
                                      <strong>Ore totali:</strong> {formatHours(shift.totalHours || 0)}
                                    </>
                                  );
                                })()}
                              </span>
                            </div>
                            {shift.duties && shift.duties.length > 0 && (
                              <div className="ml-4 mt-1 space-y-1">
                                {shift.duties.map((duty: any, dutyIndex: number) => (
                                  <div key={dutyIndex} className="text-xs text-gray-500">
                                    • {duty.dutyName} ({duty.dutyCode}): {duty.numberOfPeople} {duty.numberOfPeople === 1 ? 'persona' : 'persone'}
                                    {taskType.isHourlyService === false
                                      ? `, ${Number(shift.shifts) || 0} ${(Number(shift.shifts) || 0) === 1 ? 'turno' : 'turni'}${(shift.overtimeHours ?? 0) > 0 ? ` + ${formatHours(shift.overtimeHours)} straordinari` : ''}`
                                      : `, ${formatHours(duty.totalHours || 0)}`}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Nessun dettaglio giornaliero disponibile</p>
          )}
        </div>
      </div>
    );
  };

  const renderMansioneReport = (data: any) => {
    return (
      <div className="space-y-6">
        {/* Header con informazioni generali */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Report per Mansione</h2>
          <div className="mb-4 space-y-2">
            <p className="text-gray-600"><strong>Mansione:</strong> {data.dutyCode} - {data.dutyName}</p>
            {data.clientName && (
              <p className="text-gray-600"><strong>Cliente:</strong> {data.clientName}</p>
            )}
            {(data.locationName || data.locationId) && (
              <p className="text-gray-600"><strong>Location:</strong> {data.locationName || data.locationId}</p>
            )}
            <p className="text-gray-600"><strong>Periodo:</strong> {new Date(data.startDate).toLocaleDateString('it-IT')} - {new Date(data.endDate).toLocaleDateString('it-IT')}</p>
          </div>
        </div>

        {/* Dettaglio giornaliero */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4">Dettaglio Giornaliero</h3>
          {data.dailyDetails && data.dailyDetails.length > 0 ? (
            <div className="space-y-6">
              {data.dailyDetails.map((day: any, dayIndex: number) => (
                <div key={dayIndex} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-lg font-semibold mb-3 text-gray-900">
                    {new Date(day.date).toLocaleDateString('it-IT', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </h4>
                  
                  {(day.taskTypes || []).map((taskType: any, taskTypeIndex: number) => {
                    const isShiftService = taskType.isHourlyService === false;
                    const totalShifts = taskType.shifts ?? 0;
                    const totalOvertime = taskType.overtimeHours ?? 0;
                    return (
                    <div key={taskTypeIndex} className="mb-3 last:mb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-700">{taskType.taskTypeName}</span>
                        <span className="text-sm font-medium text-gray-900">
                          {isShiftService
                            ? `${totalShifts} ${totalShifts === 1 ? 'turno' : 'turni'}${totalOvertime > 0 ? ` + ${formatHours(totalOvertime)} straordinari` : ''}`
                            : formatHours(taskType.totalHours || 0)}
                        </span>
                      </div>
                    </div>
                  );})}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Nessun dettaglio giornaliero disponibile</p>
          )}
        </div>
      </div>
    );
  };

  const renderAziendaReport = (data: any) => {
    return (
      <div className="space-y-6">
        {/* Header con informazioni generali */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Report per Azienda</h2>
          <div className="mb-4">
            <p className="text-gray-600"><strong>Periodo:</strong> {new Date(data.startDate).toLocaleDateString('it-IT')} - {new Date(data.endDate).toLocaleDateString('it-IT')}</p>
          </div>
        </div>

        {/* Dettagli per azienda */}
        <div className="space-y-6">
          {data.companies.map((company: any, index: number) => (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold mb-4">{company.companyName}</h3>
              <div className="flex flex-wrap gap-4 mb-4">
                <p className="text-lg font-semibold text-gray-900"><strong>Ore Totali:</strong> {formatHours(company.totalHours || 0)}</p>
                <p className="text-lg font-semibold text-gray-900"><strong>Turni Totali:</strong> {company.totalShifts ?? 0} {(company.totalShifts ?? 0) === 1 ? 'turno' : 'turni'}</p>
                <p className="text-lg font-semibold text-gray-900"><strong>Straordinari:</strong> {formatHours(company.totalOvertimeHours ?? 0)}</p>
              </div>
              
              {/* Riepilogo per categoria */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3">Riepilogo per Categoria</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Codice</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria (Mansione)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Turni</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Straordinari</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {company.categories && company.categories.length > 0 ? (
                        company.categories.map((category: any, idx: number) => {
                          const totalShifts = category.shifts ?? 0;
                          const hasShiftData = totalShifts > 0 || (category.overtimeHours ?? 0) > 0;
                          return (
                          <tr key={idx}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{category.dutyCode || "-"}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{category.dutyName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {hasShiftData ? formatHours(0) : formatHours(category.hours ?? 0)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {totalShifts} {totalShifts === 1 ? 'turno' : 'turni'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {formatHours(category.overtimeHours ?? 0)}
                            </td>
                          </tr>
                        );})
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">Nessun dato disponibile</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dettaglio giornaliero */}
              {company.dailyDetails && company.dailyDetails.length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold mb-3">Dettaglio Giornaliero</h4>
                  <div className="space-y-4">
                    {company.dailyDetails.map((day: any, dayIndex: number) => (
                      <div key={dayIndex} className="border border-gray-200 rounded-lg p-4">
                        <h5 className="text-md font-semibold mb-2 text-gray-900">
                          {new Date(day.date).toLocaleDateString('it-IT', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h5>
                        
                        {(day.taskTypes || []).map((taskType: any, taskTypeIndex: number) => (
                          <div key={taskTypeIndex} className="mb-3 last:mb-0">
                            <div className="mb-1">
                              <span className="font-semibold text-gray-700 text-sm">{taskType.taskTypeName}</span>
                              <span className="ml-3 text-xs font-medium text-gray-900">
                                {(() => {
                                  const totalShifts = (taskType.shifts || []).reduce((sum: number, s: any) => sum + (s.shifts || 0), 0);
                                  const totalOvertime = (taskType.shifts || []).reduce((sum: number, s: any) => sum + (s.overtimeHours || 0), 0);
                                  const isShiftService = taskType.isHourlyService === false;
                                  if (isShiftService) {
                                    return `Totale: ${totalShifts} ${totalShifts === 1 ? 'turno' : 'turni'}${totalOvertime > 0 ? ` + ${formatHours(totalOvertime)} straordinari` : ''}`;
                                  }
                                  return `Totale: ${formatHours(taskType.totalHours || 0)}`;
                                })()}
                              </span>
                            </div>
                            
                            <div className="ml-4 space-y-2">
                              {(taskType.shifts || []).map((shift: any, shiftIndex: number) => (
                                <div key={shiftIndex} className="border-l-2 border-gray-300 pl-2 py-1">
                                  <div className="text-xs text-gray-600">
                                    <span className="font-medium">
                                      <strong>Orario:</strong> {shift.startTime || "-"} - {shift.endTime || "-"}
                                    </span>
                                    {shift.hasScheduledBreak && shift.scheduledBreakStartTime && shift.scheduledBreakEndTime &&
                                      reportData?.showBreakTimes !== false && (
                                      <span className="ml-3">
                                        <strong>Pausa:</strong> {shift.scheduledBreakStartTime} - {shift.scheduledBreakEndTime}
                                      </span>
                                    )}
                                    <span className="ml-3">
                                      <strong>Persone:</strong> {shift.numberOfPeople}
                                    </span>
                                    <span className="ml-3">
                                      {(() => {
                                        const numShifts = Number(shift.shifts) || 0;
                                        const isShiftService = taskType.isHourlyService === false;
                                        if (isShiftService) {
                                          return (
                                            <>
                                              <strong>Turni:</strong> {numShifts} {numShifts === 1 ? 'turno' : 'turni'}
                                              {(shift.overtimeHours ?? 0) > 0 && (
                                                <span className="ml-2">+ <strong>Straordinari:</strong> {formatHours(shift.overtimeHours)}</span>
                                              )}
                                            </>
                                          );
                                        }
                                        return <><strong>Ore totali:</strong> {formatHours(shift.totalHours || 0)}</>;
                                      })()}
                                    </span>
                                  </div>
                                  {shift.duties && shift.duties.length > 0 && (
                                    <div className="ml-3 mt-1 space-y-0.5">
                                      {shift.duties.map((duty: any, dutyIndex: number) => (
                                        <div key={dutyIndex} className="text-xs text-gray-500">
                                          • {duty.dutyName} ({duty.dutyCode}): {duty.numberOfPeople} {duty.numberOfPeople === 1 ? 'persona' : 'persone'}
                                          {taskType.isHourlyService === false
                                            ? `, ${Number(shift.shifts) || 0} ${(Number(shift.shifts) || 0) === 1 ? 'turno' : 'turni'}${(shift.overtimeHours ?? 0) > 0 ? ` + ${formatHours(shift.overtimeHours)} straordinari` : ''}`
                                            : `, ${formatHours(duty.totalHours || 0)}`}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDipendenteReport = (data: any) => {
    return (
      <div className="space-y-6">
        {/* Header con informazioni generali */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Report per Dipendente</h2>
          <div className="mb-4">
            <p className="text-gray-600"><strong>Periodo:</strong> {new Date(data.startDate).toLocaleDateString('it-IT')} - {new Date(data.endDate).toLocaleDateString('it-IT')}</p>
          </div>
        </div>

        {/* Dettagli per dipendente */}
        <div className="space-y-6">
          {data.employees.map((employee: any, index: number) => {
            const hasOnlyShiftServices = employee.hasOnlyShiftServices === true;
            const displayHours = hasOnlyShiftServices ? 0 : (employee.totalHours || 0);
            return (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold mb-2">{employee.userName}</h3>
              <div className="flex flex-wrap gap-4 mb-4">
                <p className="text-lg font-semibold text-gray-900"><strong>Ore Totali:</strong> {formatHours(displayHours)}</p>
                <p className="text-lg font-semibold text-gray-900"><strong>Turni Totali:</strong> {employee.totalShifts ?? 0} {(employee.totalShifts ?? 0) === 1 ? 'turno' : 'turni'}</p>
                <p className="text-lg font-semibold text-gray-900"><strong>Straordinari:</strong> {formatHours(employee.totalOvertimeHours ?? 0)}</p>
              </div>
              
              {/* Dettaglio giornaliero */}
              {employee.dailyDetails && employee.dailyDetails.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold mb-3">Dettaglio Giornaliero</h4>
                  <div className="space-y-4">
                    {employee.dailyDetails.map((day: any, dayIndex: number) => (
                      <div key={dayIndex} className="border border-gray-200 rounded-lg p-4">
                        <h5 className="text-md font-semibold mb-2 text-gray-900">
                          {new Date(day.date).toLocaleDateString('it-IT', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h5>
                        
                        {(day.taskTypes || []).map((taskType: any, taskTypeIndex: number) => (
                          <div key={taskTypeIndex} className="mb-3 last:mb-0">
                            <div className="mb-1">
                              <span className="font-semibold text-gray-700 text-sm">{taskType.taskTypeName}</span>
                              <span className="ml-3 text-xs font-medium text-gray-900">
                                {(() => {
                                  const totalShifts = (taskType.shifts || []).reduce((sum: number, s: any) => sum + (s.shifts || 0), 0);
                                  const totalOvertime = (taskType.shifts || []).reduce((sum: number, s: any) => sum + (s.overtimeHours || 0), 0);
                                  const isShiftService = taskType.isHourlyService === false;
                                  if (isShiftService) {
                                    return `Totale: ${totalShifts} ${totalShifts === 1 ? 'turno' : 'turni'}${totalOvertime > 0 ? ` + ${formatHours(totalOvertime)} straordinari` : ''}`;
                                  }
                                  return `Totale: ${formatHours(taskType.totalHours || 0)}`;
                                })()}
                              </span>
                            </div>
                            
                            <div className="ml-4 space-y-2">
                              {(taskType.shifts || []).map((shift: any, shiftIndex: number) => (
                                <div key={shiftIndex} className="border-l-2 border-gray-300 pl-2 py-1">
                                  <div className="text-xs text-gray-600">
                                    <span className="font-medium">
                                      <strong>Orario:</strong> {shift.startTime || "-"} - {shift.endTime || "-"}
                                    </span>
                                    {shift.hasScheduledBreak && shift.scheduledBreakStartTime && shift.scheduledBreakEndTime &&
                                      reportData?.showBreakTimes !== false && (
                                      <span className="ml-3">
                                        <strong>Pausa:</strong> {shift.scheduledBreakStartTime} - {shift.scheduledBreakEndTime}
                                      </span>
                                    )}
                                    <span className="ml-3">
                                      <strong>Evento:</strong> {shift.eventTitle}
                                    </span>
                                    <span className="ml-3">
                                      {(() => {
                                        const numShifts = Number(shift.shifts) || 0;
                                        const isShiftService = taskType.isHourlyService === false;
                                        if (isShiftService) {
                                          return (
                                            <>
                                              <strong>Turni:</strong> {numShifts} {numShifts === 1 ? 'turno' : 'turni'}
                                              {(shift.overtimeHours ?? 0) > 0 && (
                                                <span className="ml-2">+ <strong>Straordinari:</strong> {formatHours(shift.overtimeHours)}</span>
                                              )}
                                            </>
                                          );
                                        }
                                        return <><strong>Ore totali:</strong> {formatHours(shift.totalHours || 0)}</>;
                                      })()}
                                    </span>
                                    {shift.notes && (
                                      <span className="ml-3">
                                        <strong>Note:</strong> {shift.notes}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Tabella riepilogativa */}
              {employee.entries && employee.entries.length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold mb-3">Riepilogo Turni</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Evento</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orari</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Turni</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Straordinari</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {employee.entries.map((entry: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {new Date(entry.date).toLocaleDateString('it-IT')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">{entry.eventTitle}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : "-"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {entry.shifts != null ? formatHours(0) : formatHours(entry.hours)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{entry.shifts != null ? `${entry.shifts} ${Math.abs(entry.shifts - 1) < 0.01 ? 'turno' : 'turni'}` : "-"}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{entry.overtimeHours != null ? formatHours(entry.overtimeHours) : "-"}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
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
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-900">Totale</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{formatHours(displayHours)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{employee.totalShifts ?? 0} {(employee.totalShifts ?? 0) === 1 ? 'turno' : 'turni'}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{formatHours(employee.totalOvertimeHours ?? 0)}</td>
                          <td className="px-6 py-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );})}
        </div>
      </div>
    );
  };

  return (
    <DashboardShell>
      <div>
        <h1 className="text-4xl font-bold mb-6">Reportistica</h1>

        {/* Filtri */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="space-y-4">
            {/* Tipo Report */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo di Report
              </label>
              <select
                value={reportType}
                onChange={(e) => {
                  setReportType(e.target.value as ReportType | "");
                  setReportData(null);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              >
                <option value="">Seleziona tipologia di report</option>
                {!isResponsabile && (
                  <>
                    <option value="cliente">Per Cliente</option>
                    <option value="evento">Per Evento</option>
                    <option value="mansione">Per Mansione</option>
                  </>
                )}
                <option value="azienda">Per Azienda</option>
                <option value="dipendente">Per Dipendente</option>
              </select>
            </div>

            {/* Intervallo Date (sempre presente) */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[240px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Inizio *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                />
              </div>
              <div className="min-w-[240px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Fine *
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  ← Precedente
                </button>
                <button
                  type="button"
                  onClick={goToCurrentMonth}
                  className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Oggi
                </button>
                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Successivo →
                </button>
              </div>
            </div>

            {/* Opzioni calcolo ore */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipologia di report
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hoursType"
                      value="actual"
                      checked={hoursType === "actual"}
                      onChange={(e) => setHoursType(e.target.value as "scheduled" | "actual")}
                      className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                    />
                    <span className="text-sm text-gray-700">Effettivo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hoursType"
                      value="scheduled"
                      checked={hoursType === "scheduled"}
                      onChange={(e) => setHoursType(e.target.value as "scheduled" | "actual")}
                      className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                    />
                    <span className="text-sm text-gray-700">Programmato</span>
                  </label>
                </div>
              </div>
              {!isResponsabile && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="includeBreaksHourly"
                      checked={includeBreaksHourly}
                      onChange={(e) => setIncludeBreaksHourly(e.target.checked)}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Includi le pause nel conteggio delle ore {hoursType === "actual" ? "lavorate" : "lavorative"} (solo per servizi orari)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="showBreakTimes"
                      checked={showBreakTimes}
                      onChange={(e) => setShowBreakTimes(e.target.checked)}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Mostra gli orari delle pause
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Filtri specifici per tipo */}
            {reportType === "cliente" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cliente *
                </label>
                <SearchableSelect
                  value={selectedClientId}
                  onChange={setSelectedClientId}
                  placeholder="Cerca cliente..."
                  emptyOption={{ value: "", label: "Seleziona cliente" }}
                  options={[...clients]
                    .sort((a, b) => {
                      const nameA = a.type === "PRIVATO" ? `${a.nome || ""} ${a.cognome || ""}`.trim() : (a.ragioneSociale || "");
                      const nameB = b.type === "PRIVATO" ? `${b.nome || ""} ${b.cognome || ""}`.trim() : (b.ragioneSociale || "");
                      return nameA.localeCompare(nameB);
                    })
                    .map((client) => {
                      const displayName = client.type === "PRIVATO"
                        ? `${client.nome || ""} ${client.cognome || ""}`.trim()
                        : client.ragioneSociale || "";
                      return { value: client.id, label: displayName || client.id };
                    })}
                />
              </div>
            )}

            {reportType === "evento" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Evento *
                  </label>
                  <SearchableSelect
                    value={selectedEventId}
                    onChange={async (val) => {
                      setSelectedEventId(val);
                      setSelectedEventClientId("");
                      setEventClients([]);
                      if (val) {
                        try {
                          const res = await fetch(`/api/reports/evento?eventId=${val}`);
                          if (res.ok) {
                            const data = await res.json();
                            if (data.clients) setEventClients(data.clients);
                          }
                        } catch (error) {
                          console.error("Error fetching event clients:", error);
                        }
                      }
                    }}
                    placeholder="Cerca evento..."
                    emptyOption={{ value: "", label: "Seleziona evento" }}
                    options={[...events]
                      .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                      .map((event) => ({
                        value: event.id,
                        label: `${event.title} (${new Date(event.startDate).toLocaleDateString("it-IT")} - ${new Date(event.endDate).toLocaleDateString("it-IT")})`,
                      }))}
                  />
                </div>
                {eventClients.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cliente (opzionale)
                    </label>
                    <SearchableSelect
                      value={selectedEventClientId}
                      onChange={setSelectedEventClientId}
                      placeholder="Cerca cliente..."
                      emptyOption={{ value: "", label: "Tutti i clienti" }}
                      options={[...eventClients]
                        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                        .map((client) => ({ value: client.id, label: client.name }))}
                    />
                  </div>
                )}
              </>
            )}

            {reportType === "mansione" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mansione *
                  </label>
                  <SearchableSelect
                    value={selectedDutyId}
                    onChange={setSelectedDutyId}
                    placeholder="Cerca mansione..."
                    emptyOption={{ value: "", label: "Seleziona mansione" }}
                    options={[...duties]
                      .sort((a, b) => {
                        const areaCmp = (a.area || "").localeCompare(b.area || "");
                        if (areaCmp !== 0) return areaCmp;
                        return (a.code || "").localeCompare(b.code || "");
                      })
                      .map((duty) => ({
                        value: duty.id,
                        label: `${duty.code} - ${duty.name} (${duty.area})`,
                      }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cliente (opzionale)
                  </label>
                  <SearchableSelect
                    value={selectedClientId}
                    onChange={setSelectedClientId}
                    placeholder="Cerca cliente..."
                    emptyOption={{ value: "", label: "Tutti i clienti" }}
                    options={[...clients]
                      .sort((a, b) => {
                        const nameA = a.type === "PRIVATO" ? `${a.nome || ""} ${a.cognome || ""}`.trim() : (a.ragioneSociale || "");
                        const nameB = b.type === "PRIVATO" ? `${b.nome || ""} ${b.cognome || ""}`.trim() : (b.ragioneSociale || "");
                        return nameA.localeCompare(nameB);
                      })
                      .map((client) => {
                        const displayName = client.type === "PRIVATO"
                          ? `${client.nome || ""} ${client.cognome || ""}`.trim()
                          : client.ragioneSociale || "";
                        return { value: client.id, label: displayName || client.id };
                      })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location (opzionale)
                  </label>
                  <SearchableSelect
                    value={selectedLocationId}
                    onChange={setSelectedLocationId}
                    placeholder="Cerca location..."
                    emptyOption={{ value: "", label: "Tutte le location" }}
                    options={[...locations]
                      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                      .map((location) => ({
                        value: location.id,
                        label: `${location.name}${location.city ? ` (${location.city})` : ""}`.trim(),
                      }))}
                  />
                </div>
              </>
            )}

            {reportType === "azienda" && (
              <div className="space-y-3">
                {!isResponsabile && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Azienda (opzionale)
                    </label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    >
                      <option value="">Tutte le aziende</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.ragioneSociale}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="showDailyDetailsAzienda"
                    checked={showDailyDetailsAzienda}
                    onChange={(e) => setShowDailyDetailsAzienda(e.target.checked)}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Dettaglio giornate
                  </span>
                </label>
              </div>
            )}

            {reportType === "dipendente" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dipendente (opzionale - lascia vuoto per tutti)
                  </label>
                  <SearchableSelect
                    value={selectedUserId}
                    onChange={setSelectedUserId}
                    placeholder="Cerca dipendente..."
                    emptyOption={{ value: "", label: "Tutti i dipendenti" }}
                    options={[...users]
                      .sort((a, b) =>
                        (a.name || "").localeCompare(b.name || "") ||
                        (a.cognome || "").localeCompare(b.cognome || "")
                      )
                      .map((user) => ({
                        value: user.id,
                        label: `${user.name || ""} ${user.cognome || ""}`.trim() || user.id,
                      }))}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="showDailyDetailsDipendente"
                    checked={showDailyDetailsDipendente}
                    onChange={(e) => setShowDailyDetailsDipendente(e.target.checked)}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Dettaglio giornate
                  </span>
                </label>
              </div>
            )}

            {/* Pulsante Genera Report */}
            <div>
              <button
                onClick={generateReport}
                disabled={loading || !reportType}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Generazione..." : "Genera Report"}
              </button>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Report Results */}
        {reportData && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                onClick={() => exportReportToExcel(reportData, reportType, formatHours)}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Scarica .xlsx
              </button>
            </div>
            {reportType === "cliente" && renderClienteReport(reportData)}
            {reportType === "evento" && renderEventoReport(reportData)}
            {reportType === "mansione" && renderMansioneReport(reportData)}
            {reportType === "azienda" && renderAziendaReport(reportData)}
            {reportType === "dipendente" && renderDipendenteReport(reportData)}
          </div>
        )}

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
