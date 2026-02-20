"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getIncompleteScheduleInfo, getWorkdayAlertStates, getPersonnelAlertState, getClientAlertState } from "./utils";
import { getWorkModeCookie } from "@/lib/workMode";
import { formatUserName, type UserLike } from "@/lib/formatUserName";

interface AssignmentWithUsers {
  id: string;
  startTime: string | null;
  endTime: string | null;
  area?: string | null;
  note: string | null;
  user?: { id: string; name: string; cognome: string; code: string } | null;
  assignedUsersResolved?: Array<{ userId: string; name: string; cognome: string; code: string }>;
  taskType?: { id: string; name: string; type: string; color: string | null };
}

interface Workday {
  id: string;
  date: string;
  isOpen: boolean;
  location?: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
  timeSpans?: string | null;
  assignments?: AssignmentWithUsers[];
}

interface Event {
  id: string;
  title: string;
  clientName: string | null;
  startDate: string;
  endDate: string;
  notes: string | null;
  location: { name: string; color: string | null } | null;
  isClosed: boolean;
  workdays?: Workday[];
}

const CalendarView = ({ events, onEventClick, canOpenClosedEvents, areaNamesMap, dutyIdToName, showAdminIndicators }: { events: Event[]; onEventClick: (eventId: string) => void; canOpenClosedEvents: boolean, areaNamesMap: Record<string, string>, dutyIdToName: Record<string, string>, showAdminIndicators: boolean }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Rimuovi il tooltip degli alert quando si naviga via (evita che resti visibile sulle pagine successive)
  useEffect(() => {
    return () => {
      const tooltip = document.getElementById("alert-tooltip");
      if (tooltip) tooltip.remove();
    };
  }, []);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Converti in modo che lunedì = 0, domenica = 6
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

    return { daysInMonth, startingDayOfWeek };
  };

  const getEventsForDate = (date: Date) => {
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    return events.filter(event => {
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      const checkDate = new Date(date);
      
      // Imposta ora a mezzanotte per confrontare solo le date
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      checkDate.setHours(0, 0, 0, 0);
      
      return checkDate >= start && checkDate <= end;
    }).map(event => {
      // Controlla se c'è una giornata di lavoro aperta per questo giorno specifico
      const hasOpenWorkdayOnThisDate = event.workdays?.some(workday => {
        const workdayDate = new Date(workday.date);
        const workdayDateStr = `${workdayDate.getFullYear()}-${String(workdayDate.getMonth() + 1).padStart(2, '0')}-${String(workdayDate.getDate()).padStart(2, '0')}`;
        return workdayDateStr === formattedDate && workday.isOpen;
      });
      
      // Nuova logica: aggrega tutti gli errori delle workday del giorno (calendario + orologio)
      const workdayIdsForDate: string[] = [];
      const alertMessages: string[] = [];
      const hasAlertOnThisDate = event.workdays?.some(workday => {
        const workdayDate = new Date(workday.date);
        const workdayDateStr = `${workdayDate.getFullYear()}-${String(workdayDate.getMonth() + 1).padStart(2, '0')}-${String(workdayDate.getDate()).padStart(2, '0')}`;
        
        if (workdayDateStr === formattedDate) {
          workdayIdsForDate.push(workday.id);
          const states = getWorkdayAlertStates({ ...(workday as any), areaNamesMap } as any);
          const pState = getPersonnelAlertState({ ...(workday as any), dutyIdToName } as any);
          const msgs: string[] = [];
          if (states.activityMissing) msgs.push(states.activityMessage);
          if (states.shiftMissing) {
            if (states.shiftMessages?.length) msgs.push(...states.shiftMessages);
            else if (states.shiftMessage) msgs.push(states.shiftMessage);
          }
          if (states.activityCoverageGap) msgs.push(states.activityCoverageMessage);
          if (states.shiftCoverageGap) msgs.push(states.shiftCoverageMessage);
          if (pState && pState.color !== 'green' && Array.isArray(pState.messages) && pState.messages.length > 0) {
            msgs.push(...pState.messages);
          }
          if (msgs.length > 0) {
            alertMessages.push(...msgs);
            return true;
          }
          return false;
        }

        return false;
      });
      
      return {
        ...event,
        hasOpenWorkdayOnThisDate: hasOpenWorkdayOnThisDate || false,
        hasAlertOnThisDate: (hasAlertOnThisDate || false) && alertMessages.length > 0,
        workdayIdsForDate
      };
    });
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
  const monthNames = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];
  const weekDays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const days = [];
  // Aggiungi celle vuote per allineare il primo giorno
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  // Aggiungi tutti i giorni del mese
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={goToPreviousMonth}
            className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            ← Precedente
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
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

      <div className="grid grid-cols-7 gap-1">
        {/* Giorni della settimana */}
        {weekDays.map(day => (
          <div key={day} className="p-2 font-semibold text-center text-gray-700">
            {day}
          </div>
        ))}

        {/* Giorni del mese */}
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="p-2"></div>;
          }

          const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
          const dayEvents = getEventsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <div
              key={day}
              className={`p-2 min-h-24 border border-gray-200 rounded ${
                isToday ? "bg-blue-50 border-blue-300" : "bg-white"
              }`}
            >
              <div className="font-semibold mb-1">{day}</div>
              <div className="space-y-1">
                {dayEvents.slice(0, 2).map((event: any) => {
                  const locationColor = event.location?.color || "#9ca3af"; // Grigio di default
                  const isLightColor = locationColor === "#ffffff" || locationColor?.startsWith("#fff");
                  const textColor = isLightColor ? "text-gray-900" : "text-white";
                  
                  return (
                    <div
                      key={event.id}
                      className={`text-xs p-1 rounded ${textColor} ${event.isClosed && !canOpenClosedEvents ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${event.isClosed && canOpenClosedEvents ? 'opacity-70 hover:opacity-90' : !event.isClosed ? 'hover:opacity-80' : ''} flex items-center gap-1`}
                      style={{
                        backgroundColor: locationColor,
                      }}
                      onClick={() => {
                        if (!event.isClosed || canOpenClosedEvents) {
                          document.getElementById("alert-tooltip")?.remove();
                          onEventClick(event.id);
                        }
                      }}
                    >
                      {/* Icona lucchetto - solo se evento chiuso */}
                      {event.isClosed && (
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.9 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                      <span className="truncate">{event.title}</span>
                      {showAdminIndicators && event.hasOpenWorkdayOnThisDate && (
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.9 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                      {showAdminIndicators && event.hasAlertOnThisDate && (event.workdayIdsForDate && (event.workdayIdsForDate as any).length > 0) && (
                        <div className="relative inline-block">
                          {/* Punto esclamativo con colore dinamico */}
                          <svg
                            className={`w-3 h-3 flex-shrink-0 cursor-help text-white`}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            style={{ opacity: 0.9 }}
                            onMouseEnter={(e) => {
                              const existing = document.getElementById('alert-tooltip');
                              if (existing) existing.remove();
                              const tooltip = document.createElement('div');
                              tooltip.textContent = 'Caricamento...';
                              tooltip.id = 'alert-tooltip';
                              tooltip.className = 'fixed z-[2147483647] bg-gray-900 text-white text-xs rounded py-2 px-3 shadow-lg whitespace-pre-line pointer-events-none';
                              const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                              tooltip.style.left = `${rect.left + rect.width / 2}px`;
                              tooltip.style.top = `${rect.top}px`;
                              tooltip.style.transform = 'translate(-50%, calc(-100% - 8px))';
                              document.body.appendChild(tooltip);

                              // Fetch dettagli workday e costruisci messaggi come nella pagina workdays
                              const fetchAndSet = async () => {
                                try {
                                  const activityMsgsRed: string[] = [];
                                  const activityMsgsYellow: string[] = [];
                                  const shiftMsgsRed: string[] = [];
                                  const shiftMsgsYellow: string[] = [];
                                  const personnelMsgsRed: string[] = [];
                                  const personnelMsgsYellow: string[] = [];
                                  const clientMsgsRed: string[] = [];
                                  const clientMsgsYellow: string[] = [];
                                  for (const wid of (event as any).workdayIdsForDate || []) {
                                    const res = await fetch(`/api/workdays/${wid}`);
                                    if (!res.ok) continue;
                                    const wd = await res.json();
                                    const states = getWorkdayAlertStates({ ...wd, areaNamesMap } as any);
                                    const p = getPersonnelAlertState({ ...wd, dutyIdToName } as any);
                                    const c = getClientAlertState(wd as any);
                                    // Rossi
                                    if (states.activityMissing) activityMsgsRed.push(states.activityMessage);
                                    if (states.shiftMissing) {
                                      if (states.shiftMessages?.length) shiftMsgsRed.push(...states.shiftMessages);
                                      else if (states.shiftMessage) shiftMsgsRed.push(states.shiftMessage);
                                    }
                                    // Gialli
                                    if (states.activityCoverageGap) activityMsgsYellow.push(states.activityCoverageMessage);
                                    if (states.shiftCoverageGap) shiftMsgsYellow.push(states.shiftCoverageMessage);
                                    // Personale
                                    if (p?.color === 'red') {
                                      // evita la prima riga titolo, aggiungi solo dettagli se presenti
                                      if (Array.isArray(p.messages) && p.messages.length > 0) {
                                        personnelMsgsRed.push(...p.messages);
                                      }
                                    } else if (p?.color === 'yellow') {
                                      if (Array.isArray(p.messages) && p.messages.length > 0) {
                                        personnelMsgsYellow.push(...p.messages);
                                      }
                                    }
                                    // Clienti
                                    if (c?.color === 'red') {
                                      if (Array.isArray(c.messages) && c.messages.length > 0) {
                                        clientMsgsRed.push(...c.messages);
                                      }
                                    } else if (c?.color === 'yellow') {
                                      if (Array.isArray(c.messages) && c.messages.length > 0) {
                                        clientMsgsYellow.push(...c.messages);
                                      }
                                    }
                                  }
                                  const tooltipEl = document.getElementById('alert-tooltip');
                                  if (tooltipEl) {
                                    const iconCalRed = '<svg class="w-3 h-3 text-red-500 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg>';
                                    const iconCalYellow = '<svg class="w-3 h-3 text-yellow-500 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg>';
                                    const iconClockRed = '<svg class="w-3 h-3 text-red-500 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
                                    const iconClockYellow = '<svg class="w-3 h-3 text-yellow-500 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

                                    const sections: string[] = [];
                                    if (activityMsgsRed.length || activityMsgsYellow.length) {
                                      const rows: string[] = [];
                                      activityMsgsRed.forEach(m => rows.push(`<div class=\"flex items-center gap-1\">${iconCalRed}<span>${m}</span></div>`));
                                      activityMsgsYellow.forEach(m => rows.push(`<div class=\"flex items-center gap-1\">${iconCalYellow}<span>${m}</span></div>`));
                                      sections.push(`<div class=\"mb-1 space-y-1\"><div class=\"font-semibold text-[11px]\">Programmazione attività</div>${rows.join('')}</div>`);
                                    }
                                    if (shiftMsgsRed.length || shiftMsgsYellow.length) {
                                      const rows: string[] = [];
                                      shiftMsgsRed.forEach(m => rows.push(`<div class=\"flex items-center gap-1\">${iconClockRed}<span>${m}</span></div>`));
                                      shiftMsgsYellow.forEach(m => rows.push(`<div class=\"flex items-center gap-1\">${iconClockYellow}<span>${m}</span></div>`));
                                      sections.push(`<div class=\"mb-1 space-y-1\"><div class=\"font-semibold text-[11px]\">Programmazione turni</div>${rows.join('')}</div>`);
                                    }
                                    // Clienti turni (calendario, orologio, euro, omino)
                                    if (clientMsgsRed.length || clientMsgsYellow.length) {
                                      const iconEuroRed = '<span class="text-red-500 inline-block mr-1" style="font-family: Arial, sans-serif; font-weight: 400; font-size: 12px;">€</span>';
                                      const iconEuroYellow = '<span class="text-yellow-500 inline-block mr-1" style="font-family: Arial, sans-serif; font-weight: 400; font-size: 12px;">€</span>';
                                      const rows: string[] = [];
                                      rows.push(`<div class=\"flex items-center gap-1\">${clientMsgsRed.length?iconEuroRed:iconEuroYellow}<span>${(clientMsgsRed.length?clientMsgsRed:clientMsgsYellow)[0] || 'Clienti turni'}</span></div>`);
                                      const details = (clientMsgsRed.length?clientMsgsRed:clientMsgsYellow).slice(1);
                                      details.forEach(m => rows.push(`<div class=\"ml-4\"><span>${m}</span></div>`));
                                      sections.push(`<div class=\"${sections.length > 0 ? 'mb-1 ' : ''}space-y-1\"><div class=\"font-semibold text-[11px]\">Clienti turni</div>${rows.join('')}</div>`);
                                    }
                                    // Programmazione personale per ultima (calendario, orologio, euro, omino)
                                    if (personnelMsgsRed.length || personnelMsgsYellow.length) {
                                      const iconPersonRed = '<svg class="w-3 h-3 text-red-500 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 7a3 3 0 110 6 3 3 0 010-6z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 20a6 6 0 1112 0v1H6v-1z" /></svg>';
                                      const iconPersonYellow = '<svg class="w-3 h-3 text-yellow-500 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 7a3 3 0 110 6 3 3 0 010-6z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 20a6 6 0 1112 0v1H6v-1z" /></svg>';
                                      const rows: string[] = [];
                                      rows.push(`<div class=\"flex items-center gap-1\">${personnelMsgsRed.length?iconPersonRed:iconPersonYellow}<span>${(personnelMsgsRed.length?personnelMsgsRed:personnelMsgsYellow)[0] || 'Programmazione personale'}</span></div>`);
                                      const details = (personnelMsgsRed.length?personnelMsgsRed:personnelMsgsYellow).slice(1);
                                      details.forEach(m => rows.push(`<div class=\"ml-4\"><span>${m}</span></div>`));
                                      sections.push(`<div class=\"space-y-1\"><div class=\"font-semibold text-[11px]\">Programmazione personale</div>${rows.join('')}</div>`);
                                    }
                                    if (sections.length === 0) {
                                      // Nessun errore: rimuovi tooltip e nascondi l'icona
                                      tooltipEl.remove();
                                      (e.currentTarget as SVGElement).style.display = 'none';
                                    } else {
                                      tooltipEl.innerHTML = sections.join('<div class=\"h-1\"></div>');
                                    }
                                  }
                                } catch {}
                              };
                              fetchAndSet();
                            }}
                            onMouseLeave={() => {
                              const tooltip = document.getElementById('alert-tooltip');
                              if (tooltip) tooltip.remove();
                            }}
                          >
                            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14h-2v-2h2v2zm0-4h-2V6h2v6z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
                {dayEvents.length > 2 && (
                  <div className="text-xs text-gray-500">
                    +{dayEvents.length - 2} altro
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface UnavailabilityItem {
  id: string;
  userId: string;
  dateStart: string;
  dateEnd: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  user: { id: string; name: string | null; cognome: string | null; code: string };
}

// Vista Programma: tabelle separate per area (Data, Location, Evento, Persone, Orari, Persone Mancanti)
const ProgrammaView = ({
  events,
  programmaMonth,
  setProgrammaMonth,
  monthNames,
  onRowClick,
  areasToShow,
  selectedAreaFilter,
  setSelectedAreaFilter,
  unavailabilities,
  showPersoneMancanti,
}: {
  events: Event[];
  programmaMonth: Date;
  setProgrammaMonth: (d: Date) => void;
  monthNames: string[];
  onRowClick: (eventId: string, workdayId: string) => void;
  areasToShow: Array<{ id: string; name: string }>;
  selectedAreaFilter: string;
  setSelectedAreaFilter: (v: string) => void;
  unavailabilities: UnavailabilityItem[];
  showPersoneMancanti: boolean;
}) => {
  const monthStart = new Date(programmaMonth.getFullYear(), programmaMonth.getMonth(), 1);
  const monthEnd = new Date(programmaMonth.getFullYear(), programmaMonth.getMonth() + 1, 0, 23, 59, 59);

  const buildRowsForArea = (areaName: string) => {
    const rows: Array<{
      eventId: string;
      workdayId: string;
      date: string;
      dateFormatted: string;
      location: string;
      eventTitle: string;
      persone: string;
      orari: string;
      personeMancanti: string;
    }> = [];

    events.forEach((event) => {
      event.workdays?.forEach((wd) => {
        const wdDate = new Date(wd.date);
        if (wdDate < monthStart || wdDate > monthEnd) return;

        const areaAssignments = (wd.assignments || []).filter(
          (a: AssignmentWithUsers) => (a as any).area === areaName
        );
        if (areaAssignments.length === 0) return;

        const personeMap = new Map<string, UserLike>();
        areaAssignments.forEach((a: AssignmentWithUsers) => {
          if (a.user) personeMap.set(a.user.id, a.user);
          (a.assignedUsersResolved || []).forEach((u: { userId: string; name?: string; cognome?: string; code?: string }) => {
            personeMap.set(u.userId, u);
          });
        });
        const personeList = Array.from(personeMap.values());
        const persone = personeList.length ? personeList.map((u) => formatUserName(u, personeList)).join(", ") : "-";

        const parts = new Set<string>();
        areaAssignments.forEach((a: AssignmentWithUsers) => {
          if (a.startTime && a.endTime) parts.add(`${a.startTime}-${a.endTime}`);
        });
        const orari = parts.size ? Array.from(parts).join(" / ") : "-";

        const location = wd.location?.name || event.location?.name || "-";
        const dateFormatted = wdDate.toLocaleDateString("it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        let personeMancanti = "-";
        if (showPersoneMancanti && unavailabilities.length > 0) {
          const wdDateStr = wdDate.toISOString().split("T")[0];
          const unavForDay = unavailabilities.filter((u) => {
            const uStart = new Date(u.dateStart).toISOString().split("T")[0];
            const uEnd = new Date(u.dateEnd).toISOString().split("T")[0];
            return wdDateStr >= uStart && wdDateStr <= uEnd;
          });
          const unavUsers = unavForDay.map((u) => u.user).filter(Boolean) as UserLike[];
          const parts = unavForDay.map((u) => {
            const userLike = u.user ? { name: u.user.name, cognome: u.user.cognome, code: u.user.code } : null;
            const name = userLike ? formatUserName(userLike, unavUsers) : "-";
            if (!u.startTime && !u.endTime) return name;
            if (u.startTime === "06:00" && u.endTime) return `${name} (fino alle ${u.endTime})`;
            if (u.startTime && u.endTime === "24:00") return `${name} (dalle ${u.startTime})`;
            if (u.startTime && u.endTime) return `${name} (${u.startTime}-${u.endTime})`;
            if (u.startTime) return `${name} (dalle ${u.startTime})`;
            if (u.endTime) return `${name} (fino alle ${u.endTime})`;
            return name;
          });
          personeMancanti = parts.length ? parts.join(", ") : "-";
        }

        rows.push({
          eventId: event.id,
          workdayId: wd.id,
          date: wd.date,
          dateFormatted,
          location,
          eventTitle: event.title,
          persone,
          orari,
          personeMancanti,
        });
      });
    });

    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return rows;
  };

  const areasToRender =
    selectedAreaFilter === "__all__"
      ? areasToShow
      : areasToShow.filter((a) => a.name === selectedAreaFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h2 className="text-2xl font-bold">
          {monthNames[programmaMonth.getMonth()]} {programmaMonth.getFullYear()}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {areasToShow.length > 1 && (
            <select
              value={selectedAreaFilter}
              onChange={(e) => setSelectedAreaFilter(e.target.value)}
              className="px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            >
              <option value="__all__">Tutte le aree</option>
              {areasToShow.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setProgrammaMonth(new Date(programmaMonth.getFullYear(), programmaMonth.getMonth() - 1, 1))}
            className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            ← Precedente
          </button>
          <button
            onClick={() => setProgrammaMonth(new Date())}
            className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            Oggi
          </button>
          <button
            onClick={() => setProgrammaMonth(new Date(programmaMonth.getFullYear(), programmaMonth.getMonth() + 1, 1))}
            className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            Successivo →
          </button>
        </div>
      </div>
      {areasToShow.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Nessuna area disponibile per la visualizzazione</p>
        </div>
      ) : (
        <div className="space-y-8">
          {areasToRender.map((area) => {
            const rows = buildRowsForArea(area.name);
            return (
              <div key={area.id}>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">{area.name}</h3>
                {rows.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4">Nessuna giornata nel mese selezionato</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Evento</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Persone</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orari</th>
                          {showPersoneMancanti && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Persone Mancanti</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {rows.map((row) => (
                          <tr
                            key={`${row.eventId}-${row.workdayId}-${area.id}`}
                            onClick={() => onRowClick(row.eventId, row.workdayId)}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <td className="px-6 py-4 text-sm text-gray-900 capitalize">{row.dateFormatted}</td>
                            <td className="px-6 py-4 text-sm text-gray-700">{row.location}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.eventTitle}</td>
                            <td className="px-6 py-4 text-sm text-gray-700">{row.persone}</td>
                            <td className="px-6 py-4 text-sm text-gray-700 whitespace-pre-wrap">{row.orari}</td>
                            {showPersoneMancanti && (
                              <td className="px-6 py-4 text-sm text-gray-600">{row.personeMancanti}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function EventsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [areaNamesMap, setAreaNamesMap] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Event[]>([]);
  const [dutyIdToName, setDutyIdToName] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  
  const monthNames = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];
  
  const userRole = session?.user?.role || "";
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
  const isNonStandardWorkerEvents = !isStandardUser && (session?.user as any)?.isWorker === true;
  const workModeEvents = getWorkModeCookie();
  const inWorkerModeEvents = isNonStandardWorkerEvents && workModeEvents === "worker";
  const canEditEvents = !inWorkerModeEvents && ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "");
  const canDeleteEvents = !inWorkerModeEvents && (["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role || "") || (session?.user as any)?.isAdmin === true || (session?.user as any)?.isSuperAdmin === true);
  
  // Utenti e Coordinatori vedono solo eventi aperti, senza filtro
  const canSeeAllEvents = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
  
  // Solo super admin, admin e responsabile possono aprire eventi chiusi
  const canOpenClosedEvents = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
  const [filterStatus, setFilterStatus] = useState<"open" | "closed" | "all">("all");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "programma">("calendar");
  const [listMonth, setListMonth] = useState(new Date()); // Mese selezionato per la vista lista
  const [programmaMonth, setProgrammaMonth] = useState(new Date()); // Mese per la vista programma
  const [programmaAreasToShow, setProgrammaAreasToShow] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>("__all__");
  const [programmaUnavailabilities, setProgrammaUnavailabilities] = useState<UnavailabilityItem[]>([]);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Event;
    direction: "asc" | "desc";
  } | null>(null);

  useEffect(() => {
    fetchEvents();
    // carica mappa aree per associare id -> nome come nella pagina workdays
    (async () => {
      try {
        const res = await fetch('/api/areas');
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          (Array.isArray(data) ? data : data?.areas || []).forEach((a: any) => {
            if (a?.id && a?.name) map[a.id] = a.name;
          });
          setAreaNamesMap(map);
        }
      } catch {}
    })();
    // carica mappa mansioni per tooltip personale
    (async () => {
      try {
        const res = await fetch('/api/duties');
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          (Array.isArray(data) ? data : data?.duties || []).forEach((d: any) => {
            const id = d?.id;
            const name = d?.name;
            const code = d?.code;
            if (id && name) {
              map[id] = name;
            }
            if (name) {
              map[name] = name;
              if (typeof name === 'string') map[name.toLowerCase()] = name;
            }
            if (code && name) {
              map[code] = name;
              if (typeof code === 'string') map[code.toLowerCase()] = name;
            }
          });
          setDutyIdToName(map);
        }
      } catch {}
    })();
  }, []);

  // Carica indisponibilità per vista Programma (solo admin)
  const showPersoneMancanti = canSeeAllEvents && !inWorkerModeEvents;
  useEffect(() => {
    if (!showPersoneMancanti || viewMode !== "programma") return;
    const monthStart = new Date(programmaMonth.getFullYear(), programmaMonth.getMonth(), 1);
    const monthEnd = new Date(programmaMonth.getFullYear(), programmaMonth.getMonth() + 2, 0);
    const params = new URLSearchParams({
      all: "true",
      dateFrom: monthStart.toISOString().split("T")[0],
      dateTo: monthEnd.toISOString().split("T")[0],
    });
    fetch(`/api/unavailabilities?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProgrammaUnavailabilities(Array.isArray(d) ? d : []))
      .catch(() => setProgrammaUnavailabilities([]));
  }, [showPersoneMancanti, viewMode, programmaMonth]);

  // Carica aree per vista Programma: admin = tutte abilitate, standard = solo quelle dell'utente
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/areas");
        if (!res.ok) return;
        const allAreas: Array<{ id: string; name: string; enabledInWorkdayPlanning?: boolean }> = await res.json();
        const enabledAreas = (Array.isArray(allAreas) ? allAreas : []).filter(
          (a) => a?.id && a?.name && (a.enabledInWorkdayPlanning === true || a.enabledInWorkdayPlanning === undefined)
        );
        if (canSeeAllEvents) {
          setProgrammaAreasToShow(enabledAreas.map((a) => ({ id: a.id, name: a.name })));
        } else {
          const meRes = await fetch("/api/users/me");
          if (!meRes.ok) {
            setProgrammaAreasToShow([]);
            return;
          }
          const me = await meRes.json();
          let userAreaNames: string[] = [];
          if (me?.areas) {
            try {
              const parsed = JSON.parse(me.areas);
              userAreaNames = Array.isArray(parsed) ? parsed : [];
            } catch {}
          }
          const filtered = enabledAreas.filter((a) => userAreaNames.includes(a.name));
          setProgrammaAreasToShow(filtered.map((a) => ({ id: a.id, name: a.name })));
        }
      } catch {
        setProgrammaAreasToShow([]);
      }
    })();
  }, [canSeeAllEvents]);

  // Chiudi il dropdown quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".client-filter-container")) {
        setShowClientDropdown(false);
        setClientSearchTerm("");
      }
    };

    if (showClientDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showClientDropdown]);

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/events/${deleteTarget}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setEvents(events.filter((e) => e.id !== deleteTarget));
        setDeleteTarget(null);
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const handleSort = (key: keyof Event) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedEvents = [...events].sort((a, b) => {
    if (!sortConfig) return 0;

    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return sortConfig.direction === "asc" ? 1 : -1;
    if (bVal == null) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Ottieni i clienti unici, dividendo anche quelli multipli separati da virgole
  const allClients: string[] = [];
  events.forEach(event => {
    if (event.clientName) {
      // Dividi per virgole e aggiungi ciascun cliente
      const clients = event.clientName.split(", ").map(c => c.trim());
      allClients.push(...clients);
    }
  });
  const uniqueClients = Array.from(new Set(allClients));

  const clearAllFilters = () => {
    setFilterStatus("all");
    setSelectedClients([]);
    setClientSearchTerm("");
  };

  const isEventOpen = (event: Event): boolean => {
    // Un evento è aperto se non è chiuso manualmente
    return !event.isClosed;
  };

  // Funzione per verificare se un evento ha workdays con alert
  const eventHasAlert = (event: Event): boolean => {
    if (!event.workdays || event.isClosed) return false;
    
    // Verifica se c'è almeno una workday con alert usando la stessa logica del calendario
    for (const workday of event.workdays) {
      const states = getWorkdayAlertStates({ ...(workday as any), areaNamesMap } as any);
      const pState = getPersonnelAlertState({ ...(workday as any), dutyIdToName } as any);
      const cState = getClientAlertState(workday as any);
      
      // Controlla se ci sono errori di qualsiasi tipo
      if (states.activityMissing || states.shiftMissing || states.activityCoverageGap || states.shiftCoverageGap) {
        return true;
      }
      if (pState && pState.color !== 'green' && pState.messages.length > 0) {
        return true;
      }
      if (cState && cState.color !== 'green' && cState.messages.length > 0) {
        return true;
      }
    }
    
    return false;
  };

  // Funzione per ottenere i messaggi di alert per un evento (per tooltip lista)
  const getEventAlerts = (event: Event): Array<{ date: string; message: string }> => {
    const alerts: Array<{ date: string; message: string; sortDate: number }> = [];
    
    if (!event.workdays) return alerts;
    
    for (const workday of event.workdays) {
      const workdayDate = new Date(workday.date);
      const dateStr = `${String(workdayDate.getDate()).padStart(2, '0')}/${String(workdayDate.getMonth() + 1).padStart(2, '0')}/${workdayDate.getFullYear()}`;
      
      // Usa la stessa logica completa del calendario
      const states = getWorkdayAlertStates({ ...(workday as any), areaNamesMap } as any);
      const pState = getPersonnelAlertState({ ...(workday as any), dutyIdToName } as any);
      const cState = getClientAlertState(workday as any);
      
      // Raccogli tutti i messaggi di errore
      const messages: string[] = [];
      
      // Attività
      if (states.activityMissing) messages.push(states.activityMessage);
      if (states.activityCoverageGap) messages.push(states.activityCoverageMessage);
      
      // Turni
      if (states.shiftMissing) {
        if (states.shiftMessages?.length) {
          messages.push(...states.shiftMessages);
        } else if (states.shiftMessage) {
          messages.push(states.shiftMessage);
        }
      }
      if (states.shiftCoverageGap) messages.push(states.shiftCoverageMessage);
      
      // Personale
      if (pState && pState.color !== 'green' && Array.isArray(pState.messages) && pState.messages.length > 0) {
        messages.push(...pState.messages);
      }
      
      // Clienti
      if (cState && cState.color !== 'green' && Array.isArray(cState.messages) && cState.messages.length > 0) {
        messages.push(...cState.messages);
      }
      
      // Aggiungi un alert per ogni messaggio
      messages.forEach(message => {
        alerts.push({
          date: dateStr,
          message: message,
          sortDate: workdayDate.getTime() // Timestamp per ordinare
        });
      });
    }
    
    // Ordina per data in ordine crescente (dal più vecchio al più recente)
    alerts.sort((a, b) => a.sortDate - b.sortDate);
    
    // Rimuovi sortDate prima di restituire
    return alerts.map(({ sortDate, ...rest }) => rest);
  };

  // Funzione per ottenere il messaggio di alert per una specifica workday in un dato giorno (per tooltip calendario)
  const getWorkdayAlertMessage = (event: Event, date: Date): string => {
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    if (!event.workdays) return "";
    
    for (const workday of event.workdays) {
      const workdayDate = new Date(workday.date);
      const workdayDateStr = `${workdayDate.getFullYear()}-${String(workdayDate.getMonth() + 1).padStart(2, '0')}-${String(workdayDate.getDate()).padStart(2, '0')}`;
      
      if (workdayDateStr === formattedDate) {
        // Usa la funzione condivisa getIncompleteScheduleInfo
        const info = getIncompleteScheduleInfo(workday as any);
        if (info.hasWarning) {
          return info.message;
        }
      }
    }
    
    return "";
  };

  const filteredEvents = sortedEvents.filter((event) => {
    // Filtro per stato
    if (filterStatus === "open") {
      if (!isEventOpen(event)) return false;
    } else if (filterStatus === "closed") {
      if (isEventOpen(event)) return false;
    }
    
    // Filtro per mese (vista lista)
    if (viewMode === "list") {
      const eventStartDate = new Date(event.startDate);
      const eventEndDate = new Date(event.endDate);
      const listMonthStart = new Date(listMonth.getFullYear(), listMonth.getMonth(), 1);
      const listMonthEnd = new Date(listMonth.getFullYear(), listMonth.getMonth() + 1, 0, 23, 59, 59);
      
      // L'evento è visibile se si sovrappone al mese selezionato
      if (eventEndDate < listMonthStart || eventStartDate > listMonthEnd) {
        return false;
      }
    }
    
    // Filtro per mese (vista programma): evento deve avere almeno una workday nel mese
    if (viewMode === "programma") {
      const monthStart = new Date(programmaMonth.getFullYear(), programmaMonth.getMonth(), 1);
      const monthEnd = new Date(programmaMonth.getFullYear(), programmaMonth.getMonth() + 1, 0, 23, 59, 59);
      const hasWorkdayInMonth = event.workdays?.some((wd) => {
        const wdDate = new Date(wd.date);
        return wdDate >= monthStart && wdDate <= monthEnd;
      });
      if (!hasWorkdayInMonth) return false;
    }
    
    // Filtro per cliente (selezione multipla)
    if (selectedClients.length > 0) {
      // Verifica se almeno uno dei clienti dell'evento è nella selezione
      // Estrai tutti i clienti dalla stringa (potrebbero esserci più clienti separati da virgole)
      const eventClients = event.clientName?.split(", ").map(c => c.trim()) || [];
      const hasMatchingClient = eventClients.some(client => selectedClients.includes(client));
      if (!hasMatchingClient) {
        return false;
      }
    }
    
    return true;
  });

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento eventi...</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Eventi</h1>
          <div className="flex gap-4 items-center">
            {canSeeAllEvents && (
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as "open" | "closed" | "all")}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer"
              >
                <option value="open">Solo Aperti</option>
                <option value="closed">Solo Chiusi</option>
                <option value="all">Tutti</option>
              </select>
            )}
            {canEditEvents && (
              <div className="relative client-filter-container">
              <button
                type="button"
                onClick={() => setShowClientDropdown(!showClientDropdown)}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-[1.02] active:scale-100 transition-all duration-200 cursor-pointer w-64 text-left flex justify-between items-center"
              >
                <span>
                  {selectedClients.length === 0
                    ? "Tutti i clienti"
                    : `${selectedClients.length} client${selectedClients.length === 1 ? 'e' : 'i'} selezionati`
                  }
                </span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showClientDropdown && (
                <div className="absolute z-10 w-64 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2 border-b border-gray-200">
                    <input
                      type="text"
                      placeholder="Cerca..."
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                  <div className="p-2 border-b border-gray-200">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedClients([])}
                        className="text-xs text-gray-600 hover:text-gray-900"
                      >
                        Deseleziona tutti
                      </button>
                    </div>
                  </div>
                  <div className="p-2">
                    {uniqueClients
                      .filter(client => 
                        client.toLowerCase().includes(clientSearchTerm.toLowerCase())
                      )
                      .map(client => {
                        const isSelected = selectedClients.includes(client);
                        return (
                          <label
                            key={client}
                            className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedClients([...selectedClients, client]);
                                } else {
                                  setSelectedClients(selectedClients.filter(c => c !== client));
                                }
                              }}
                              className="mr-3 h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-900">{client}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
              </div>
            )}
            <div className="relative flex bg-gray-300 rounded-lg px-1.5 py-1 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.8)]" style={{ height: '44px' }}>
              <button
                onClick={() => setViewMode("list")}
                className={`relative px-4 h-full text-sm font-medium rounded-md transition-all duration-300 cursor-pointer z-10 flex items-center justify-center ${
                  viewMode === "list" 
                    ? "bg-gray-900 text-white shadow-[2px_2px_4px_rgba(0,0,0,0.3),-1px_-1px_2px_rgba(255,255,255,0.1)]" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`relative px-4 h-full text-sm font-medium rounded-md transition-all duration-300 cursor-pointer z-10 flex items-center justify-center ${
                  viewMode === "calendar" 
                    ? "bg-gray-900 text-white shadow-[2px_2px_4px_rgba(0,0,0,0.3),-1px_-1px_2px_rgba(255,255,255,0.1)]" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Calendario
              </button>
              <button
                onClick={() => setViewMode("programma")}
                className={`relative px-4 h-full text-sm font-medium rounded-md transition-all duration-300 cursor-pointer z-10 flex items-center justify-center ${
                  viewMode === "programma" 
                    ? "bg-gray-900 text-white shadow-[2px_2px_4px_rgba(0,0,0,0.3),-1px_-1px_2px_rgba(255,255,255,0.1)]" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Programma
              </button>
            </div>
            {canEditEvents && (
              <button
                onClick={() => router.push("/dashboard/events/new")}
                className="px-4 py-2 h-10 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Nuovo Evento
              </button>
            )}
          </div>
        </div>

        {viewMode === "calendar" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <CalendarView 
              events={filteredEvents} 
              onEventClick={(eventId) => router.push(`/dashboard/events/${eventId}?tab=workdays`)}
              canOpenClosedEvents={canOpenClosedEvents}
              areaNamesMap={areaNamesMap}
              dutyIdToName={dutyIdToName}
              showAdminIndicators={!isStandardUser && !inWorkerModeEvents}
            />
          </div>
        )}
        {viewMode === "programma" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <ProgrammaView
              events={filteredEvents}
              programmaMonth={programmaMonth}
              setProgrammaMonth={setProgrammaMonth}
              monthNames={monthNames}
              onRowClick={(eventId, workdayId) => router.push(`/dashboard/events/${eventId}/workdays/${workdayId}`)}
              areasToShow={programmaAreasToShow}
              selectedAreaFilter={selectedAreaFilter}
              setSelectedAreaFilter={setSelectedAreaFilter}
              unavailabilities={programmaUnavailabilities}
              showPersoneMancanti={showPersoneMancanti}
            />
          </div>
        )}
        {viewMode === "list" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            {/* Navigazione mese per vista lista */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                {monthNames[listMonth.getMonth()]} {listMonth.getFullYear()}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setListMonth(new Date(listMonth.getFullYear(), listMonth.getMonth() - 1, 1))}
                  className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  ← Precedente
                </button>
                <button
                  onClick={() => setListMonth(new Date())}
                  className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Oggi
                </button>
                <button
                  onClick={() => setListMonth(new Date(listMonth.getFullYear(), listMonth.getMonth() + 1, 1))}
                  className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Successivo →
                </button>
              </div>
            </div>
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Nessun evento trovato per questo mese</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("title")}
                  >
                    <div className="flex items-center gap-2">
                      Titolo
                      {sortConfig?.key === "title" && (
                        <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  {!isStandardUser && !inWorkerModeEvents && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                  )}
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("startDate")}
                  >
                    <div className="flex items-center gap-2">
                      Data Inizio
                      {sortConfig?.key === "startDate" && (
                        <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("endDate")}
                  >
                    <div className="flex items-center gap-2">
                      Data Fine
                      {sortConfig?.key === "endDate" && (
                        <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEvents.map((event) => (
                  <tr key={event.id} className={`hover:bg-gray-50 ${event.isClosed ? 'opacity-70' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2 max-w-md overflow-hidden">
                        {/* Icona lucchetto - solo se evento chiuso */}
                        {event.isClosed && (
                          <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        <span className="truncate">{event.title}</span>
                        {!isStandardUser && !inWorkerModeEvents && event.workdays && event.workdays.length > 0 && (
                          <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                        {!isStandardUser && !inWorkerModeEvents && eventHasAlert(event) && (() => {
                          const alerts = getEventAlerts(event);
                          // Raggruppa gli alert per data
                          const alertsByDate = alerts.reduce((acc, alert) => {
                            if (!acc[alert.date]) {
                              acc[alert.date] = [];
                            }
                            acc[alert.date].push(alert.message);
                            return acc;
                          }, {} as Record<string, string[]>);
                          
                          // Genera il testo raggruppato per data
                          const alertText = Object.entries(alertsByDate)
                            .map(([date, messages]) => {
                              return `${date}:\n${messages.join('\n')}`;
                            })
                            .join('\n\n');
                          return (
                            <div className="relative inline-block">
                              <svg 
                                className="w-4 h-4 text-yellow-600 flex-shrink-0 cursor-help" 
                                fill="currentColor" 
                                viewBox="0 0 24 24"
                                onMouseEnter={(e) => {
                                  const tooltip = document.createElement('div');
                                  tooltip.textContent = alertText;
                                  tooltip.className = 'fixed z-[2147483647] bg-gray-900 text-white text-xs rounded py-2 px-3 shadow-lg pointer-events-none whitespace-pre-line';
                                  tooltip.style.left = '50%';
                                  tooltip.style.transform = 'translateX(-50%)';
                                  tooltip.style.top = '-100%';
                                  tooltip.id = 'list-alert-tooltip';
                                  const existing = document.getElementById('list-alert-tooltip');
                                  if (existing) existing.remove();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  tooltip.style.position = 'fixed';
                                  tooltip.style.left = `${rect.left + rect.width / 2}px`;
                                  tooltip.style.top = `${rect.top}px`;
                                  tooltip.style.transform = 'translate(-50%, calc(-100% - 8px))';
                                  document.body.appendChild(tooltip);
                                }}
                                onMouseLeave={() => {
                                  const tooltip = document.getElementById('list-alert-tooltip');
                                  if (tooltip) tooltip.remove();
                                }}
                              >
                                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {event.location?.name || "-"}
                    </td>
                    {!isStandardUser && !inWorkerModeEvents && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {event.clientName || "-"}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(event.startDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(event.endDate)}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {/* Visualizza */}
                        {!(event.isClosed && !canOpenClosedEvents) && (
                          <button
                            onClick={() => router.push(`/dashboard/events/${event.id}`)}
                            aria-label="Visualizza"
                            title="Visualizza"
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                        {/* Modifica */}
                        {canEditEvents && !(event.isClosed && !canOpenClosedEvents) && (
                          <button
                            onClick={() => router.push(`/dashboard/events/${event.id}/edit`)}
                            aria-label="Modifica"
                            title="Modifica"
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                            </svg>
                          </button>
                        )}
                        {/* Elimina - solo ADMIN e SUPERADMIN */}
                        {canDeleteEvents && (
                          <button
                            onClick={() => setDeleteTarget(event.id)}
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
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Conferma Eliminazione"
        message={
          (() => {
            const ev = events.find((e) => e.id === deleteTarget);
            const hasWorkdays = (ev?.workdays?.length ?? 0) > 0;
            return hasWorkdays
              ? "Questo evento ha giornate di lavoro attive. Vuoi procedere? L'azione non è reversibile."
              : "Sei sicuro di voler eliminare questo evento? Questa azione non può essere annullata.";
          })()
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardShell>
  );
}

