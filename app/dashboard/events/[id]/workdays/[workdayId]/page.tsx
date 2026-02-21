"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getIncompleteScheduleInfo } from "@/app/dashboard/events/utils";
import { getWorkModeCookie } from "@/lib/workMode";
import { formatUserName, type UserLike } from "@/lib/formatUserName";

interface Event {
  id: string;
  title: string;
  clientName: string | null;
}

interface Location {
  id: string;
  name: string;
}

interface Assignment {
  id: string;
  userId: string;
  taskTypeId: string;
  startTime: string;
  endTime: string;
  area: string;
  personnelRequests?: string | null; // JSON: [{"dutyId": "...", "quantity": 5}, ...]
  assignedUsers?: string | null; // JSON: [{"userId":"...","dutyId":"optional"}, ...]
  workdayId?: string; // Optional - presente quando viene da GET /api/assignments
  locationName?: string; // Optional - presente quando viene da GET /api/assignments
  note: string | null;
  hasScheduledBreak?: boolean;
  scheduledBreakStartTime?: string | null;
  scheduledBreakEndTime?: string | null;
  user: {
    id: string;
    name: string;
    code: string;
  };
  taskType: {
    id: string;
    name: string;
    type: string;
    color: string | null;
  };
}

interface Workday {
  id: string;
  date: string;
  eventId: string;
  event: Event;
  locationId: string | null;
  location: Location | null;
  startTime: string | null;
  endTime: string | null;
  timeSpans?: string | null; // JSON string from API
  areaEnabledStates?: string | null; // JSON string from API: {"areaId": true, ...}
  areaShiftPreferences?: string | null; // JSON string from API: {"areaId": {"ignoreOverlaps": true}, ...}
  isOpen: boolean;
  notes?: string | null;
  assignments?: Assignment[];
}

export default function WorkdayViewPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const workdayId = params?.workdayId as string;
  const eventId = params?.id as string;
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const isWorker = (session?.user as any)?.isWorker === true;
  const isNonStandardWorker = !isStandardUser && isWorker;
  const workMode = getWorkModeCookie();
  const inWorkerMode = isNonStandardWorker && workMode === "worker";

  const canEditEvents = !inWorkerMode && ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "");
  const isReadOnlyParam = (searchParams?.get('readonly') === '1' || searchParams?.get('readonly') === 'true');
  // Utente standard: sempre sola lettura anche se prova ad accedere senza query param
  const isReadOnly = isReadOnlyParam || !canEditEvents;

  const [workday, setWorkday] = useState<Workday | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActivitiesModal, setShowActivitiesModal] = useState(false);
  const [taskTypes, setTaskTypes] = useState<any[]>([]);
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<string[]>([]);
  const [activityTimes, setActivityTimes] = useState<Record<string, Array<{ start: string; end: string }>>>({});
  const [activityTimeErrors, setActivityTimeErrors] = useState<Record<string, Record<number, { start?: boolean; end?: boolean; message: string }>>>({});
  const [enabledAreas, setEnabledAreas] = useState<Array<{ id: string; name: string; enabledInWorkdayPlanning?: boolean }>>([]);
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [areaEnabledSwitches, setAreaEnabledSwitches] = useState<Record<string, boolean>>({});
  
  // Shift modal states
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftModalAreaId, setShiftModalAreaId] = useState<string | null>(null);
  const [shiftTypes, setShiftTypes] = useState<any[]>([]);
  const [selectedShiftTypes, setSelectedShiftTypes] = useState<string[]>([]);
  const [shiftTimes, setShiftTimes] = useState<Record<string, { start: string; end: string }[]>>({});
  const [shiftClients, setShiftClients] = useState<Record<string, string[]>>({});  // taskTypeId -> array di clientId per ogni intervallo
  const [shiftBreaks, setShiftBreaks] = useState<Record<string, Array<{ hasScheduledBreak: boolean; scheduledBreakStartTime: string; scheduledBreakEndTime: string }>>>({}); // taskTypeId -> array di pause per ogni intervallo
  const [shiftTimeErrors, setShiftTimeErrors] = useState<Record<string, Record<number, { start?: string; end?: string; message?: string }>>>({});
  const [ignoreOverlaps, setIgnoreOverlaps] = useState(false);
  const [eventClients, setEventClients] = useState<Array<{ id: string; name: string }>>([]);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [areaDisableConfirm, setAreaDisableConfirm] = useState<{ areaId: string; shiftIds: string[] } | null>(null);
  // Blocchi di modifica quando sono presenti personale/assegnazioni
  const [disabledShiftTypes, setDisabledShiftTypes] = useState<Record<string, boolean>>({});
  const [disabledIntervalKeys, setDisabledIntervalKeys] = useState<Record<string, boolean>>({});
  
  // Personnel modal states
  const [showPersonnelModal, setShowPersonnelModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [duties, setDuties] = useState<Array<{ id: string; name: string; code: string; area: string }>>([]);
  const [personnelQuantities, setPersonnelQuantities] = useState<Record<string, number>>({});
  const [dutiesMap, setDutiesMap] = useState<Record<string, string>>({}); // dutyId -> name
  // Copy personnel to same-type shifts modal
  const [copyTargets, setCopyTargets] = useState<Assignment[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyPayload, setCopyPayload] = useState<string | null>(null);
  // Clear personnel flows
  const [isClearing, setIsClearing] = useState(false);
  const [clearTargets, setClearTargets] = useState<Assignment[]>([]);
  const [showClearModal, setShowClearModal] = useState(false);

  // Assign users to shift states
  const [showAssignUsersModal, setShowAssignUsersModal] = useState(false);
  const [assignUsersTarget, setAssignUsersTarget] = useState<Assignment | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string; code: string; cognome?: string | null; areas?: string | null; roles?: string | null; companyId?: string | null; company?: { id: string; ragioneSociale: string } | null }>>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [companiesForFilter, setCompaniesForFilter] = useState<Array<{ id: string; ragioneSociale: string }>>([]);
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("");
  const [dutyTabs, setDutyTabs] = useState<Array<{ id: string; name: string; quantity: number }>>([]);
  const [activeDutyId, setActiveDutyId] = useState<string>("");
  const [dutyToSelectedUserIds, setDutyToSelectedUserIds] = useState<Record<string, Set<string>>>({});
  // Dialoghi stile app per conferme/avvisi in selezione utenti
  const [overlapInfoMessage, setOverlapInfoMessage] = useState<string | null>(null);
  const [crossLocationConfirm, setCrossLocationConfirm] = useState<{ userId: string; locationName: string; start: string; end: string } | null>(null);
  // Motivi di disabilitazione per singolo utente (tooltip + blocco click)
  const [userDisableReasons, setUserDisableReasons] = useState<Record<string, string>>({});
  // Indisponibilità comunicate: userId -> messaggio per tooltip (es. "tutto il giorno", "dalle 17")
  const [userUnavailabilityMessages, setUserUnavailabilityMessages] = useState<Record<string, string>>({});
  // userId -> lista id indisponibilità da eliminare al salvataggio (se confermato)
  const [userUnavailabilityIds, setUserUnavailabilityIds] = useState<Record<string, string[]>>({});
  // Dialog conferma assegnazione con indisponibilità: { userId, userName, message }
  const [unavailabilityConfirm, setUnavailabilityConfirm] = useState<{ userId: string; userName: string; message: string } | null>(null);

  // In modalità lavoratore: canEditEvents=false → isReadOnly=true, quindi visualizzazione sola lettura (come utenti standard)

  // Helper function to convert minutes to time string (HH:MM)
  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const sumPersonnelRequested = (assignment?: any): number => {
    if (!assignment?.personnelRequests) return 0;
    try {
      const arr = JSON.parse(assignment.personnelRequests);
      if (!Array.isArray(arr)) return 0;
      return arr.reduce((acc: number, it: any) => acc + (Number(it?.quantity) || 0), 0);
    } catch {
      return 0;
    }
  };

  const checkAllUsersForConflicts = async (users: any[], assignment: any) => {
    const wdDate = (workday as any)?.date ? new Date((workday as any).date) : null;
    if (!wdDate || !assignment?.startTime || !assignment?.endTime || users.length === 0) return;
    
    const yyyy = wdDate.getUTCFullYear();
    const mm = String(wdDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(wdDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    const s = assignment.startTime;
    const e = assignment.endTime;
    const t2m = (t: string) => { const [h,m]=t.split(':').map(Number); return h*60+m; };
    const sM = t2m(s); 
    let eM = t2m(e); 
    if (eM <= sM) eM += 1440;
    
    const currentLocName = (workday as any)?.location?.name || '';
    const reasons: Record<string, string> = {};
    
    try {
      const userIds = users.map((u) => u.id).join(",");
      const res = await fetch(`/api/assignments?userIds=${encodeURIComponent(userIds)}&date=${dateStr}`);
      if (!res.ok) return;
      const all: Array<{ userId?: string; workdayId: string; locationName: string; eventTitle: string; startTime: string; endTime: string }> = await res.json();
      const byUser = new Map<string, typeof all>();
      for (const o of all) {
        const uid = o.userId;
        if (uid) {
          if (!byUser.has(uid)) byUser.set(uid, []);
          byUser.get(uid)!.push(o);
        }
      }
      for (const user of users) {
        const others = byUser.get(user.id) || [];
        const candidates = others.filter(o => 
          o.workdayId !== assignment?.workdayId && 
          o.locationName && 
          o.locationName !== currentLocName
        );
        for (const o of candidates) {
          const os = t2m(o.startTime); 
          let oe = t2m(o.endTime); 
          if (oe <= os) oe += 1440;
          if (Math.max(sM, os) < Math.min(eM, oe)) {
            reasons[user.id] = `In turno presso ${o.locationName} per l'evento "${o.eventTitle}" nello stesso orario`;
            break;
          }
        }
      }
    } catch (e) {
      console.error('Error checking user conflicts:', e);
    }
    setUserDisableReasons(reasons);
  };

  const handleOpenAssignUsersModal = async (assignment: any) => {
    setAssignUsersTarget(assignment);
    setSelectedUserIds(new Set());
    setSelectedCompanyFilter("");
    setUserDisableReasons({});
    setUserUnavailabilityMessages({});
    setUserUnavailabilityIds({});
    setUnavailabilityConfirm(null);
    setShowAssignUsersModal(true);
    try {
      const res = await fetch('/api/users?standard=true');
      if (res.ok) {
        const users = await res.json();
        // Ordina per codice crescente (numerico se possibile)
        users.sort((a: any, b: any) => {
          const an = parseInt((a.code || '').replace(/\D/g, ''), 10);
          const bn = parseInt((b.code || '').replace(/\D/g, ''), 10);
          if (!isNaN(an) && !isNaN(bn)) return an - bn;
          return String(a.code || '').localeCompare(String(b.code || ''));
        });
        setAllUsers(users);
        
        // Controlla tutti gli utenti per conflitti in altre location
        await checkAllUsersForConflicts(users, assignment);

        // Carica indisponibilità per la data della giornata: messaggi (overlap) + ids (tutti) per conferma/eliminazione
        const wdDate = workday?.date ? new Date(workday.date) : null;
        if (wdDate && assignment?.startTime && assignment?.endTime) {
          const dateStr = wdDate.toISOString().split("T")[0];
          try {
            const ures = await fetch(`/api/unavailabilities?all=true&dateFrom=${dateStr}&dateTo=${dateStr}`);
            if (ures.ok) {
              const unavList: Array<{ id: string; userId: string; startTime: string | null; endTime: string | null }> = await ures.json();
              const msgs: Record<string, string> = {};
              const ids: Record<string, string[]> = {};
              const buildMsg = (u: { startTime: string | null; endTime: string | null }) => {
                if (!u.startTime && !u.endTime) return "tutto il giorno";
                if (u.startTime === "06:00" && u.endTime) return `fino alle ${u.endTime}`;
                if (u.startTime && u.endTime === "24:00") return `dalle ${u.startTime}`;
                if (u.startTime && u.endTime) return `fascia ${u.startTime}-${u.endTime}`;
                if (u.startTime) return `dalle ${u.startTime}`;
                if (u.endTime) return `fino alle ${u.endTime}`;
                return "tutto il giorno";
              };
              unavList.forEach((u) => {
                const msg = buildMsg(u);
                if (!ids[u.userId]) ids[u.userId] = [];
                ids[u.userId].push(u.id);
                if (!msgs[u.userId]) msgs[u.userId] = msg;
                else msgs[u.userId] = msgs[u.userId] + "; " + msg;
              });
              setUserUnavailabilityMessages(msgs);
              setUserUnavailabilityIds(ids);
            }
          } catch {}
        }
        
        // Preload selected if already assigned
        if (assignment.assignedUsers) {
          try {
            const ids: string[] = JSON.parse(assignment.assignedUsers);
            setSelectedUserIds(new Set(ids));
          } catch {}
        }
      }
      // load companies for filter
      try {
        const cres = await fetch('/api/companies');
        if (cres.ok) {
          const comps = await cres.json();
          setCompaniesForFilter(comps.map((c: any) => ({ id: c.id, ragioneSociale: c.ragioneSociale })));
        }
      } catch {}

      // Build duty tabs from personnelRequests and preload selections
      try {
        const reqs = assignment.personnelRequests ? JSON.parse(assignment.personnelRequests) : [];
        if (Array.isArray(reqs)) {
          const tabs = reqs.map((r: any) => ({ id: r.dutyId, name: dutiesMap[r.dutyId] || 'Mansione', quantity: Number(r.quantity)||0 }));
          setDutyTabs(tabs);
          if (tabs.length > 0) setActiveDutyId(tabs[0].id);
          const map: Record<string, Set<string>> = {};
          const seenUsers = new Set<string>();
          // parse existing assigned users
          if (assignment.assignedUsers) {
            try {
              const arr = JSON.parse(assignment.assignedUsers);
              if (Array.isArray(arr)) {
                for (const it of arr) {
                  if (it && typeof it === 'object' && it.userId && it.dutyId) {
                    if (seenUsers.has(it.userId)) continue; // enforce esclusività
                    map[it.dutyId] = map[it.dutyId] || new Set();
                    map[it.dutyId].add(it.userId);
                    seenUsers.add(it.userId);
                  }
                }
              }
            } catch {}
          }
          setDutyToSelectedUserIds(map);
        }
      } catch {}
    } catch (e) {
      console.error('Error loading users', e);
    }
  };

  const getMaxForActiveDuty = (): number => {
    const tab = dutyTabs.find(t => t.id === activeDutyId);
    return tab ? tab.quantity : sumPersonnelRequested(assignUsersTarget);
  };

  const toggleUserSelection = async (userId: string) => {
    const currentSet = dutyToSelectedUserIds[activeDutyId] || new Set();
    const isCurrentlySelected = currentSet.has(userId);
    
    if (isCurrentlySelected) {
      // Rimuovi utente
      setDutyToSelectedUserIds(prev => {
        const next: Record<string, Set<string>> = {} as any;
        Object.entries(prev).forEach(([k, v]) => { next[k] = new Set(v as Set<string>); });
        const current = new Set(next[activeDutyId] || []);
        current.delete(userId);
        next[activeDutyId] = current;
        return next;
      });
      return;
    }

    // PRIMA controlla conflitti, POI aggiungi se ok
    const max = getMaxForActiveDuty();
    if (max > 0 && (currentSet.size >= max)) return; // limite raggiunto
    
    const selectedInOtherDuty = Object.entries(dutyToSelectedUserIds).some(([dutyId, set]) => dutyId !== activeDutyId && (set as Set<string>)?.has(userId));
    if (selectedInOtherDuty) return; // già selezionato in altra mansione

    // Verifica sovrapposizione con altri turni della stessa giornata
    let overlapsOtherShift = false;
    try {
      const tgtStart = assignUsersTarget?.startTime;
      const tgtEnd = assignUsersTarget?.endTime;
      if (tgtStart && tgtEnd) {
        const t2m = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
        const sM = t2m(tgtStart);
        let eM = t2m(tgtEnd); if (eM <= sM) eM += 1440;
        (workday?.assignments||[]).forEach(a => {
          if (overlapsOtherShift || a.id === assignUsersTarget?.id) return;
          let assigned: string[] = [];
          try {
            if (a.assignedUsers) {
              const arr = typeof a.assignedUsers === 'string' ? JSON.parse(a.assignedUsers) : a.assignedUsers;
              if (Array.isArray(arr)) {
                for (const it of arr) {
                  if (typeof it === 'string') assigned.push(it); else if (it && typeof it==='object' && it.userId) assigned.push(it.userId);
                }
              }
            }
          } catch {}
          if (!assigned.includes(userId)) return;
          const as = t2m(a.startTime); let ae = t2m(a.endTime); if (ae <= as) ae += 1440;
          if (Math.max(sM, as) < Math.min(eM, ae)) overlapsOtherShift = true;
        });
      }
    } catch {}
    if (overlapsOtherShift) return; // sovrapposto, già gestito da tooltip
    
    // Se l'utente è già disabilitato per conflitto in altra location, non permettere selezione
    if (userDisableReasons[userId]) return;

    // Controlla altre location nello stesso giorno per turni SENZA sovrapposizione
    try {
      const wdDate = (workday as any)?.date ? new Date((workday as any).date) : null;
      if (wdDate && assignUsersTarget?.startTime && assignUsersTarget?.endTime) {
        const yyyy = wdDate.getUTCFullYear();
        const mm = String(wdDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(wdDate.getUTCDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const res = await fetch(`/api/assignments?userId=${encodeURIComponent(userId)}&date=${dateStr}`);
        if (res.ok) {
          const others: Array<{ workdayId: string; locationName: string; eventTitle: string; startTime: string; endTime: string }> = await res.json();
          const s = assignUsersTarget.startTime;
          const e = assignUsersTarget.endTime;
          const t2m = (t: string) => { const [h,m]=t.split(':').map(Number); return h*60+m; };
          if (s && e && Array.isArray(others) && others.length > 0) {
            const sM = t2m(s); let eM = t2m(e); if (eM <= sM) eM += 1440;
            const currentLocName = (workday as any)?.location?.name || '';
            // Cerca turni in altre location SENZA sovrapposizione (per il dialog di conferma)
            const candidatesNoOverlap = others.filter(o => {
              if (o.workdayId === assignUsersTarget?.workdayId) return false;
              if (!o.locationName || o.locationName === currentLocName) return false;
              const os = t2m(o.startTime); 
              let oe = t2m(o.endTime); 
              if (oe <= os) oe += 1440;
              // Nessuna sovrapposizione
              return Math.max(sM, os) >= Math.min(eM, oe);
            });
            
            if (candidatesNoOverlap.length > 0) {
              const first = candidatesNoOverlap[0];
              // Aggiungi utente subito per feedback visivo
              setDutyToSelectedUserIds(prev => {
                const next: Record<string, Set<string>> = {} as any;
                Object.entries(prev).forEach(([k, v]) => { next[k] = new Set(v as Set<string>); });
                const current = new Set(next[activeDutyId] || []);
                // esclusività: rimuovi l'utente da tutte le altre mansioni
                Object.entries(next).forEach(([dutyId, set]) => {
                  if (dutyId !== activeDutyId) {
                    (set as Set<string>).delete(userId);
                  }
                });
                current.add(userId);
                next[activeDutyId] = current;
                return next;
              });
              // Mostra dialogo di conferma personalizzato
              const confirmData = { userId, locationName: first.locationName || 'altra location', start: first.startTime, end: first.endTime };
              setCrossLocationConfirm(confirmData);
              return;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error checking cross-location assignments', e);
    }

    // Se arriviamo qui, nessun conflitto: aggiungi utente
    const addUser = () => {
      setDutyToSelectedUserIds(prev => {
        const next: Record<string, Set<string>> = {} as any;
        Object.entries(prev).forEach(([k, v]) => { next[k] = new Set(v as Set<string>); });
        const current = new Set(next[activeDutyId] || []);
        Object.entries(next).forEach(([dutyId, set]) => {
          if (dutyId !== activeDutyId) (set as Set<string>).delete(userId);
        });
        current.add(userId);
        next[activeDutyId] = current;
        return next;
      });
    };
    addUser();
    // Se ha comunicato indisponibilità, mostra conferma "Sei sicuro? Confermando si eliminerà l'indisponibilità"
    if (userUnavailabilityIds[userId]?.length) {
      const u = allUsers.find((x: any) => x.id === userId);
      const name = u ? (u.name && u.cognome ? `${u.name} ${u.cognome}` : u.name || u.code || "Utente") : "Utente";
      const msg = userUnavailabilityMessages[userId] || "indisponibilità comunicata";
      setUnavailabilityConfirm({ userId, userName: name, message: msg });
    }
  };

  const handleSaveAssignedUsers = async () => {
    if (!assignUsersTarget) return;
    try {
      // Flatten per-duty selections
      const payload: Array<{ userId: string; dutyId: string }> = [];
      const seen = new Set<string>();
      Object.entries(dutyToSelectedUserIds).forEach(([dutyId, set]) => {
        Array.from(set).forEach(uid => {
          if (seen.has(uid)) return;
          seen.add(uid);
          payload.push({ userId: uid, dutyId });
        });
      });

      const res = await fetch(`/api/assignments/${assignUsersTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: payload }),
      });
      if (res.ok) {
        // Elimina indisponibilità per gli utenti assegnati che avevano comunicato indisponibilità
        const idsToDelete: string[] = [];
        payload.forEach(({ userId }) => {
          const ids = userUnavailabilityIds[userId];
          if (ids?.length) idsToDelete.push(...ids);
        });
        for (const id of idsToDelete) {
          try {
            await fetch(`/api/unavailabilities/${id}`, { method: 'DELETE' });
          } catch (e) {
            console.error('Errore eliminazione indisponibilità', id, e);
          }
        }
        await fetchWorkday();
        setShowAssignUsersModal(false);
        setCrossLocationConfirm(null);
        setUnavailabilityConfirm(null);
        setOverlapInfoMessage(null);
        setUserDisableReasons({});
        setUserUnavailabilityIds({});
        setSelectedCompanyFilter("");
        setAssignUsersTarget(null);
      } else {
        const err = await res.json().catch(() => ({} as any));
        console.error('Salvar utenti fallito', res.status, err);
        alert(err.error || 'Errore nel salvataggio assegnazioni utenti');
      }
    } catch (e) {
      console.error('Error saving assigned users', e);
    }
  };

  // Helper function to parse time to minutes (for validation)
  const parseTimeToMinutesHelper = (time: string | null): number | null => {
    if (!time) return null;
    const [hh, mm] = time.split(":").map((v) => parseInt(v, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  };

  // 00:00 (mezzanotte) = fine della giornata corrente, equivalente a 24:00 per la validazione
  const normalizeEndForDay = (minutes: number): number =>
    minutes === 0 ? 1440 : minutes;

  // Verifica se un orario (HH:MM) è dentro almeno uno degli intervalli della giornata
  const isTimeWithinWorkdaySpans = (time: string): boolean => {
    const t = parseTimeToMinutesHelper(time);
    if (t === null) return true; // non validiamo valori incompleti
    const spans = parseSpans(workday?.timeSpans || null);
    if (spans.length === 0) return true; // se non ci sono intervalli non blocchiamo
    for (const span of spans) {
      const s = parseTimeToMinutesHelper(span.start);
      const e = parseTimeToMinutesHelper(span.end);
      if (s === null || e === null) continue;
      const tNorm = t === 0 ? 1440 : t; // 00:00 = fine giornata
      if (e < s) {
        // overnight: valido se t >= s (giorno corrente) oppure t <= e (giorno successivo)
        if (t >= s || t <= e) return true;
      } else {
        if (tNorm >= s && tNorm <= e) return true;
      }
    }
    return false;
  };

  // Valida un singolo estremo (start/end) immediatamente, senza richiedere l'altro
  const validateSingleTimeEdge = (
    taskTypeId: string,
    intervalIdx: number,
    edge: 'start' | 'end',
    value: string
  ) => {
    const workdaySpans = parseSpans(workday?.timeSpans || null);
    if (workdaySpans.length === 0) return; // niente da validare

    const valid = value ? isTimeWithinWorkdaySpans(value) : true;
    const workdayTimesStr = workdaySpans.map(s => `${s.start} - ${s.end}`).join(', ');
    setShiftTimeErrors(prev => {
      const next = { ...prev } as Record<string, Record<number, { start?: string; end?: string; message?: string }>>;
      if (!next[taskTypeId]) next[taskTypeId] = {};
      const current = { ...(next[taskTypeId][intervalIdx] || {}) } as { start?: string; end?: string; message?: string };
      if (!valid) {
        if (edge === 'start') current.start = `Ora inizio fuori dagli orari programmati (${workdayTimesStr})`;
        else current.end = `Ora fine fuori dagli orari programmati (${workdayTimesStr})`;
        next[taskTypeId][intervalIdx] = current;
      } else {
        if (edge === 'start') delete current.start; else delete current.end;
        if (current.start || current.end || current.message) next[taskTypeId][intervalIdx] = current; else delete next[taskTypeId][intervalIdx];
        if (Object.keys(next[taskTypeId]).length === 0) delete next[taskTypeId];
      }
      return next;
    });
  };

  // Helper function to validate activity times against workday times
  const validateActivityTimes = () => {
    return validateActivityTimesWithData(activityTimes);
  };

  // Helper function to validate activity times against workday times with specific data
  const validateActivityTimesWithData = (timesToValidate: Record<string, Array<{ start: string; end: string }>>) => {
    const errors: Record<string, Record<number, { start?: boolean; end?: boolean; message: string }>> = {};
    const workdaySpans = parseSpans(workday?.timeSpans || null);
    
    if (workdaySpans.length === 0) {
      // No workday times to compare against
      return errors;
    }

    // Formatta gli intervalli orari della giornata per il messaggio di errore
    const workdayTimesStr = workdaySpans.map(span => `${span.start} - ${span.end}`).join(', ');

    const validateSingleInterval = (times: { start: string; end: string }): { start?: boolean; end?: boolean; message: string } | null => {
      if (!times.start && !times.end) return null;
      
      if (times.start && !times.end) {
        const activityStart = parseTimeToMinutesHelper(times.start);
        if (activityStart === null) return null;
        
        const fitsInAnySpan = workdaySpans.some(span => {
          const spanStart = parseTimeToMinutesHelper(span.start);
          const spanEnd = parseTimeToMinutesHelper(span.end);
          if (spanStart === null || spanEnd === null) return false;
          
          const isOvernight = spanEnd < spanStart;
          if (isOvernight) {
            return (activityStart >= spanStart && activityStart < 1440) || 
                   (activityStart >= 0 && activityStart < spanEnd);
          } else {
            return activityStart >= spanStart && activityStart <= spanEnd;
          }
        });
        
        if (!fitsInAnySpan) {
          return { start: true, message: `Gli orari dell'attività vanno oltre gli orari programmati per la giornata (${workdayTimesStr})` };
        }
      } else if (!times.start && times.end) {
        const activityEnd = parseTimeToMinutesHelper(times.end);
        if (activityEnd === null) return null;
        const activityEndNorm = normalizeEndForDay(activityEnd);
        
        const fitsInAnySpan = workdaySpans.some(span => {
          const spanStart = parseTimeToMinutesHelper(span.start);
          const spanEnd = parseTimeToMinutesHelper(span.end);
          if (spanStart === null || spanEnd === null) return false;
          
          const isOvernight = spanEnd < spanStart;
          if (isOvernight) {
            return activityEnd <= spanEnd || activityEnd > spanStart;
          } else {
            return activityEndNorm >= spanStart && activityEndNorm <= spanEnd;
          }
        });
        
        if (!fitsInAnySpan) {
          return { end: true, message: `Gli orari dell'attività vanno oltre gli orari programmati per la giornata (${workdayTimesStr})` };
        }
      } else if (times.start && times.end) {
        const activityStart = parseTimeToMinutesHelper(times.start);
        const activityEnd = parseTimeToMinutesHelper(times.end);
        
        if (activityStart === null || activityEnd === null) return null;
        const activityEndNorm = normalizeEndForDay(activityEnd);
        const activityIsOvernight = activityEnd < activityStart;
        
        let startValid = false;
        let endValid = false;
        
        workdaySpans.forEach(span => {
          const spanStart = parseTimeToMinutesHelper(span.start);
          const spanEnd = parseTimeToMinutesHelper(span.end);
          
          if (spanStart === null || spanEnd === null) return;
          
          const isOvernight = spanEnd < spanStart;
          
          if (isOvernight) {
            if (activityIsOvernight) {
              if (activityStart >= spanStart && activityEnd <= spanEnd) {
                startValid = true;
                endValid = true;
              }
            } else {
              if ((activityStart >= spanStart && activityEndNorm <= 1440) || 
                  (activityStart >= 0 && activityEnd <= spanEnd)) {
                startValid = true;
                endValid = true;
              }
            }
          } else {
            if (!activityIsOvernight) {
              if (activityStart >= spanStart && activityEndNorm <= spanEnd) {
                startValid = true;
                endValid = true;
              } else {
                if (activityStart >= spanStart && activityStart <= spanEnd) startValid = true;
                if (activityEndNorm >= spanStart && activityEndNorm <= spanEnd) endValid = true;
              }
            } else {
              // Attività oltre mezzanotte (es. 22:00-00:00), span non overnight (es. 22:00-24:00)
              // 00:00 = fine giornata, valido se rientra nello span
              if (activityStart >= spanStart && activityEndNorm <= spanEnd) {
                startValid = true;
                endValid = true;
              }
            }
          }
        });
        
        if (!startValid || !endValid) {
          const errorFlags: { start?: boolean; end?: boolean } = {};
          if (!startValid) errorFlags.start = true;
          if (!endValid) errorFlags.end = true;
          return {
            ...errorFlags,
            message: `Gli orari dell'attività vanno oltre gli orari programmati per la giornata (${workdayTimesStr})`
          };
        }
      }
      return null;
    };

    Object.entries(timesToValidate).forEach(([taskTypeId, intervals]) => {
      if (!Array.isArray(intervals)) return;
      intervals.forEach((times, idx) => {
        const err = validateSingleInterval(times);
        if (err) {
          if (!errors[taskTypeId]) errors[taskTypeId] = {};
          errors[taskTypeId][idx] = err;
        }
      });
    });
    
    return errors;
  };
  

  const fetchTaskTypes = async () => {
    try {
      const res = await fetch("/api/task-types");
      if (res.ok) {
        const data = await res.json();
        setTaskTypes(data);
      }
    } catch (error) {
      console.error("Error fetching task types:", error);
    }
  };

  const fetchShiftTypes = async (areaId: string) => {
    try {
      const res = await fetch("/api/task-types");
      if (res.ok) {
        const data = await res.json();
        // Filter for SHIFT type and check if areaId is in the areas array
        const shiftsForArea = data.filter((taskType: any) => {
          if (taskType.type !== "SHIFT") return false;
          if (!taskType.areas) return false;
          try {
            const areaIds = JSON.parse(taskType.areas);
            return Array.isArray(areaIds) && areaIds.includes(areaId);
          } catch {
            return false;
          }
        });
        setShiftTypes(shiftsForArea);
      }
    } catch (error) {
      console.error("Error fetching shift types:", error);
    }
  };

  const fetchEnabledAreas = async () => {
    try {
      const res = await fetch("/api/areas");
      if (res.ok) {
        const data = await res.json();
        // Filtra solo le aree abilitate in programmazione giornate
        const mapped = data
          .filter((area: any) => area.enabledInWorkdayPlanning === true)
          .map((area: any) => ({
            id: area.id,
            name: area.name,
            enabledInWorkdayPlanning: true,
          }));
        setEnabledAreas(mapped);
        // Initialize switches to off by default only for newly loaded areas that don't have a state yet
        // This preserves states loaded from workday.areaEnabledStates
        setAreaEnabledSwitches((prev) => {
          const next: Record<string, boolean> = { ...prev };
          for (const a of mapped) {
            if (next[a.id] === undefined) next[a.id] = false;
          }
          // Remove switches for areas no longer present
          Object.keys(next).forEach((key) => {
            if (!mapped.find((a: any) => a.id === key)) delete next[key];
          });
          return next;
        });
      }
    } catch (error) {
      console.error("Error fetching enabled areas:", error);
    }
  };

  const toggleArea = (areaId: string) => {
    // Allow expand/collapse only if switch is enabled
    if (!areaEnabledSwitches[areaId]) return;
    setExpandedAreas(prev => ({
      ...prev,
      [areaId]: !prev[areaId]
    }));
  };

  const handleOpenShiftModal = async (areaId: string) => {
    setShiftModalAreaId(areaId);
    
    // Ricarica i dati della giornata per assicurarsi di avere i dati più recenti
    await fetchWorkday();
    
    // Pre-popolare i turni esistenti per quest'area
    const existingAssignments = workday?.assignments?.filter(a => {
      if (a.taskType?.type !== "SHIFT") return false;
      // Find area name from enabledAreas
      const area = enabledAreas.find(ar => ar.id === areaId);
      return area && a.area === area.name;
    }) || [];
    
    const preSelectedTypes: string[] = [];
    const preSelectedTimes: Record<string, { start: string; end: string }[]> = {};
    const preSelectedClients: Record<string, string[]> = {};
    const preSelectedBreaks: Record<string, Array<{ hasScheduledBreak: boolean; scheduledBreakStartTime: string; scheduledBreakEndTime: string }>> = {};
    const disabledTypes: Record<string, boolean> = {};
    const disabledIntervals: Record<string, boolean> = {};
    
    // Raggruppa le Assignment per taskTypeId per creare array di intervalli
    const assignmentsByType: Record<string, Array<{ start: string; end: string }>> = {};
    const clientsByType: Record<string, string[]> = {};
    const breaksByType: Record<string, Array<{ hasScheduledBreak: boolean; scheduledBreakStartTime: string; scheduledBreakEndTime: string }>> = {};
    
    existingAssignments.forEach(assignment => {
      if (assignment.taskType && assignment.taskType.type === "SHIFT") {
        const taskTypeId = assignment.taskType.id;
        if (!assignmentsByType[taskTypeId]) {
          assignmentsByType[taskTypeId] = [];
          clientsByType[taskTypeId] = [];
          breaksByType[taskTypeId] = [];
          preSelectedTypes.push(taskTypeId);
        }
        assignmentsByType[taskTypeId].push({
          start: assignment.startTime,
          end: assignment.endTime,
        });
        // Aggiungi il clientId (può essere null)
        clientsByType[taskTypeId].push((assignment as any).clientId || "");
        // Aggiungi dati pausa
        breaksByType[taskTypeId].push({
          hasScheduledBreak: (assignment as any).hasScheduledBreak || false,
          scheduledBreakStartTime: (assignment as any).scheduledBreakStartTime || "",
          scheduledBreakEndTime: (assignment as any).scheduledBreakEndTime || "",
        });
        // Se ci sono tipologie personale o utenti assegnati, disabilita il checkbox e l'intervallo
        let hasPersonnel = false;
        try {
          if ((assignment as any).personnelRequests) {
            const arr = JSON.parse((assignment as any).personnelRequests);
            hasPersonnel = Array.isArray(arr) && arr.some((r: any) => Number(r?.quantity) > 0);
          }
        } catch {}
        let hasAssigned = false;
        try {
          if ((assignment as any).assignedUsers) {
            const arr2 = typeof (assignment as any).assignedUsers === 'string' ? JSON.parse((assignment as any).assignedUsers) : (assignment as any).assignedUsers;
            hasAssigned = Array.isArray(arr2) && arr2.length > 0;
          }
        } catch {}
        if (hasAssigned) {
          disabledTypes[taskTypeId] = true;
          const key = `${taskTypeId}|${assignment.startTime}-${assignment.endTime}`;
          disabledIntervals[key] = true;
        }
      }
    });
    
    // Converti gli array raggruppati in shiftTimes, shiftClients e shiftBreaks
    Object.keys(assignmentsByType).forEach(taskTypeId => {
      preSelectedTimes[taskTypeId] = assignmentsByType[taskTypeId];
      preSelectedClients[taskTypeId] = clientsByType[taskTypeId] || [];
      preSelectedBreaks[taskTypeId] = breaksByType[taskTypeId] || [];
    });
    
    // Carica la preferenza ignoreOverlaps salvata per quest'area
    // Usa workday aggiornato (potrebbe essere null inizialmente, quindi usa il state dopo fetch)
    const currentWorkday = workday; // Questo potrebbe essere obsoleto se fetchWorkday è asincrono
    let savedIgnoreOverlaps = false;
    let savedOrder: Record<string, string[]> = {};
    
    // Usa un nuovo fetch per essere sicuri di avere i dati aggiornati
    try {
      const res = await fetch(`/api/workdays/${workdayId}`);
      if (res.ok) {
        const freshData = await res.json();
        if (freshData.areaShiftPreferences) {
          try {
            const preferences = JSON.parse(freshData.areaShiftPreferences);
            console.log("Loaded areaShiftPreferences:", preferences);
            console.log("Looking for areaId:", areaId);
            if (preferences[areaId] && preferences[areaId].ignoreOverlaps === true) {
              savedIgnoreOverlaps = true;
              console.log("Found saved ignoreOverlaps = true for area:", areaId);
            } else {
              console.log("No saved ignoreOverlaps or false for area:", areaId, "preferences[areaId]:", preferences[areaId]);
            }
            if (preferences[areaId] && preferences[areaId].order) {
              savedOrder = preferences[areaId].order as Record<string, string[]>;
            }
          } catch (e) {
            console.error("Error parsing areaShiftPreferences:", e);
          }
        } else {
          console.log("No areaShiftPreferences in workday");
        }
      }
    } catch (error) {
      console.error("Error fetching workday for preferences:", error);
      // Fallback: usa workday dallo state
      if (workday?.areaShiftPreferences) {
        try {
          const preferences = JSON.parse(workday.areaShiftPreferences);
          if (preferences[areaId] && preferences[areaId].ignoreOverlaps === true) {
            savedIgnoreOverlaps = true;
          }
        } catch (e) {
          console.error("Error parsing areaShiftPreferences:", e);
        }
      }
    }
    
    // Applica ordine salvato ai preSelectedTimes, preSelectedClients e preSelectedBreaks
    try {
      if (savedOrder && Object.keys(savedOrder).length > 0) {
        const reordered: typeof preSelectedTimes = {};
        const reorderedClients: typeof preSelectedClients = {};
        const reorderedBreaks: typeof preSelectedBreaks = {};
        Object.entries(preSelectedTimes).forEach(([taskTypeId, arr]) => {
          const orderArr = savedOrder[taskTypeId] || [];
          if (orderArr.length === 0) {
            reordered[taskTypeId] = arr;
            reorderedClients[taskTypeId] = preSelectedClients[taskTypeId] || [];
            reorderedBreaks[taskTypeId] = preSelectedBreaks[taskTypeId] || [];
          } else {
            // Crea array di indici ordinati
            const sortedIndices = arr.map((item, idx) => ({
              item,
              idx,
              sortKey: `${item.start}-${item.end}`
            })).sort((a, b) => {
              const ai = orderArr.indexOf(a.sortKey);
              const bi = orderArr.indexOf(b.sortKey);
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
            
            reordered[taskTypeId] = sortedIndices.map(x => x.item);
            reorderedClients[taskTypeId] = sortedIndices.map(x => (preSelectedClients[taskTypeId] || [])[x.idx] || "");
            reorderedBreaks[taskTypeId] = sortedIndices.map(x => (preSelectedBreaks[taskTypeId] || [])[x.idx] || { hasScheduledBreak: false, scheduledBreakStartTime: "", scheduledBreakEndTime: "" });
          }
        });
        Object.assign(preSelectedTimes, reordered);
        Object.assign(preSelectedClients, reorderedClients);
        Object.assign(preSelectedBreaks, reorderedBreaks);
      }
    } catch {}
    console.log("Setting ignoreOverlaps to:", savedIgnoreOverlaps);
    setSelectedShiftTypes(preSelectedTypes);
    setShiftTimes(preSelectedTimes);
    setShiftClients(preSelectedClients);
    setShiftBreaks(preSelectedBreaks);
    setDisabledShiftTypes(disabledTypes);
    setDisabledIntervalKeys(disabledIntervals);
    setShiftTimeErrors({}); // reset errori pregressi ad ogni apertura
    setIgnoreOverlaps(savedIgnoreOverlaps); // Carica lo stato salvato
    setShowShiftModal(true);
    fetchShiftTypes(areaId);
  };

  // Verifica sovrapposizione di intervalli per i turni
  const checkShiftTimeOverlap = (
    intervals: { start: string; end: string }[],
    currentIdx: number,
    newStart: string,
    newEnd: string
  ): string | null => {
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
    
    for (let i = 0; i < intervals.length; i++) {
      if (i === currentIdx) continue;
      const ts = intervals[i];
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

  // Verifica conflitto con altri turni di utenti già assegnati a questo turno (per indice)
  const checkConflictWithAssignedUsers = (
    taskTypeId: string,
    areaId: string,
    intervalIdx: number,
    newStart: string,
    newEnd: string
  ): string | null => {
    try {
      const area = enabledAreas.find(a => a.id === areaId);
      const areaName = area?.name || '';
      const list = (workday?.assignments || [])
        .filter(a => a.taskType?.type === 'SHIFT' && a.taskType?.id === taskTypeId && a.area === areaName)
        .sort((a,b)=> a.startTime.localeCompare(b.startTime));
      const target = list[intervalIdx];
      if (!target) return null;
      const assigned: string[] = [];
      if (target.assignedUsers) {
        try {
          const arr = typeof target.assignedUsers === 'string' ? JSON.parse(target.assignedUsers) : target.assignedUsers;
          if (Array.isArray(arr)) {
            for (const it of arr) {
              if (typeof it === 'string') assigned.push(it); else if (it && typeof it==='object' && it.userId) assigned.push(it.userId);
            }
          }
        } catch {}
      }
      if (assigned.length === 0) return null;
      const t2m = (t: string) => { const [h,m]=t.split(':').map(Number); return h*60+m; };
      const sM = t2m(newStart); let eM = t2m(newEnd); if (eM <= sM) eM += 1440;
      for (const a of (workday?.assignments || [])) {
        if (a.id === target.id) continue;
        let users: string[] = [];
        try {
          if (a.assignedUsers) {
            const arr = typeof a.assignedUsers === 'string' ? JSON.parse(a.assignedUsers) : a.assignedUsers;
            if (Array.isArray(arr)) {
              for (const it of arr) {
                if (typeof it === 'string') users.push(it); else if (it && typeof it==='object' && it.userId) users.push(it.userId);
              }
            }
          }
        } catch {}
        if (!users.some(id => assigned.includes(id))) continue;
        const as = t2m(a.startTime); let ae = t2m(a.endTime); if (ae <= as) ae += 1440;
        if (Math.max(sM, as) < Math.min(eM, ae)) return 'Conflitto con un altro turno assegnato allo stesso utente';
      }
    } catch {}
    return null;
  };

  // Valida tutti gli intervalli dei turni
  const validateShiftTimes = (ignoreOverlapErrors: boolean = false) => {
    const errors: Record<string, Record<number, { start?: string; end?: string; message?: string }>> = {};
    
    // Ottieni gli intervalli delle ATTIVITÀ definite (non della giornata)
    const activityAssignments = workday?.assignments?.filter(a => a.taskType?.type === "ACTIVITY") || [];
    
    // Se non ci sono attività definite, non possiamo validare i turni
    if (activityAssignments.length === 0) {
      // Blocca tutti i turni se non ci sono attività
      Object.entries(shiftTimes).forEach(([taskTypeId, intervals]) => {
        intervals.forEach((interval, idx) => {
          if (!errors[taskTypeId]) errors[taskTypeId] = {};
          if (interval.start || interval.end) {
            errors[taskTypeId][idx] = { 
              message: "Non è possibile impostare turni senza attività definite" 
            };
          }
        });
      });
      return errors;
    }

    // Costruisci gli intervalli coperti dalle attività
    const activitySpans: Array<{ start: string; end: string }> = [];
    activityAssignments.forEach(a => {
      if (a.startTime && a.endTime) {
        activitySpans.push({ start: a.startTime, end: a.endTime });
      }
    });

    if (activitySpans.length === 0) {
      return errors;
    }

    Object.entries(shiftTimes).forEach(([taskTypeId, intervals]) => {
      intervals.forEach((interval, idx) => {
        if (!errors[taskTypeId]) errors[taskTypeId] = {};
        
        if (!interval.start || !interval.end) {
          // Se manca start o end, non validare ancora
          return;
        }
        
        // Verifica sovrapposizione con altri intervalli dello stesso turno (solo se non ignorato)
        if (!ignoreOverlapErrors) {
          const overlapError = checkShiftTimeOverlap(intervals, idx, interval.start, interval.end);
          if (overlapError) {
            errors[taskTypeId][idx] = { message: overlapError };
            return;
          }
        }

        // Blocca se causerebbe conflitto con utenti già assegnati a questo turno
        const userConflict = checkConflictWithAssignedUsers(taskTypeId, shiftModalAreaId!, idx, interval.start, interval.end);
        if (userConflict) {
          errors[taskTypeId][idx] = { message: userConflict };
          return;
        }
        
        // Verifica che inizio e fine siano dentro gli orari delle ATTIVITÀ (non della giornata)
        const shiftStart = parseTimeToMinutesHelper(interval.start);
        const shiftEnd = parseTimeToMinutesHelper(interval.end);
        
        if (shiftStart === null || shiftEnd === null) return;
        
        // Verifica se l'inizio è valido (considera solo start)
        let startValid = false;
        activitySpans.forEach(span => {
          const spanStart = parseTimeToMinutesHelper(span.start);
          const spanEnd = parseTimeToMinutesHelper(span.end);
          if (spanStart === null || spanEnd === null) return;
          
          const isOvernight = spanEnd < spanStart;
          
          if (isOvernight) {
            // Span notturno: da spanStart a 1440 (giorno corrente) e da 0 a spanEnd (giorno successivo)
            if (shiftStart >= spanStart && shiftStart <= 1440) startValid = true;
            if (shiftStart >= 0 && shiftStart <= spanEnd) startValid = true;
          } else {
            // Span normale: tutto nel giorno corrente da spanStart a spanEnd
            if (shiftStart >= spanStart && shiftStart <= spanEnd) startValid = true;
          }
        });
        
        // Verifica se la fine è valida (considera solo end, ma anche turni notturni)
        let endValid = false;
        const shiftIsOvernight = shiftEnd < shiftStart;
        const shiftEndNorm = normalizeEndForDay(shiftEnd);
        
        activitySpans.forEach(span => {
          const spanStart = parseTimeToMinutesHelper(span.start);
          const spanEnd = parseTimeToMinutesHelper(span.end);
          if (spanStart === null || spanEnd === null) return;
          
          const isOvernight = spanEnd < spanStart;
          
          if (isOvernight) {
            // Span notturno
            if (shiftIsOvernight) {
              // Turno notturno: fine è nel giorno successivo (da 0 a spanEnd)
              if (shiftEnd >= 0 && shiftEnd <= spanEnd) endValid = true;
            } else {
              // Turno normale: fine può essere nel giorno corrente (>= spanStart) o nel successivo (<= spanEnd)
              if (shiftEndNorm >= spanStart && shiftEndNorm <= 1440) endValid = true;
              if (shiftEnd >= 0 && shiftEnd <= spanEnd) endValid = true;
            }
          } else {
            // Span normale: tutto nel giorno corrente. 00:00 = fine giornata (24:00)
            if (!shiftIsOvernight) {
              if (shiftEndNorm >= spanStart && shiftEndNorm <= spanEnd) endValid = true;
            } else {
              // Turno oltre mezzanotte (es. 22:00-00:00): 00:00 valido se span arriva a 24:00
              if (shiftEndNorm >= spanStart && shiftEndNorm <= spanEnd) endValid = true;
            }
          }
        });
        
        const activityTimesStr = activitySpans.map(s => `${s.start} - ${s.end}`).join(', ');
        const errorParts: { start?: string; end?: string } = {};
        
        if (!startValid) {
          errorParts.start = `Ora inizio fuori dagli orari delle attività (${activityTimesStr})`;
        }
        if (!endValid) {
          errorParts.end = `Ora fine fuori dagli orari delle attività (${activityTimesStr})`;
        }
        
        if (Object.keys(errorParts).length > 0) {
          errors[taskTypeId][idx] = errorParts;
        }
      });
    });
    
    return errors;
  };

  const handleSaveShifts = async () => {
    if (!workday || !shiftModalAreaId) return;
    
    // Verifica se ci sono errori di validazione (ignora sovrapposizioni se richiesto)
    const errors = validateShiftTimes(ignoreOverlaps);
    setShiftTimeErrors(errors);
    
    // Se ci sono errori (esclusi quelli di sovrapposizione se ignorati), non salvare
    const hasErrors = Object.values(errors).some(intervalErrors => 
      Object.values(intervalErrors).some(err => 
        (err as any)?.start || (err as any)?.end || ((err as any)?.message && (!ignoreOverlaps || !(err as any).message.includes("sovrapposto")))
      )
    );
    if (hasErrors) {
      console.error("Ci sono errori di validazione, salvataggio impedito");
      return;
    }
    
    try {
      const area = enabledAreas.find(a => a.id === shiftModalAreaId);
      if (!area) {
        console.error("Area not found");
        return;
      }
      
      // Find existing shift assignments for this area
      const existingAssignments = workday.assignments?.filter(a => {
        if (a.taskType?.type !== "SHIFT") return false;
        return a.area === area.name;
      }) || [];
      
      // Costruisci set desiderato dal modal
      const desiredKeys: Record<string, { taskTypeId: string; start: string; end: string }> = {};
      for (const taskTypeId of selectedShiftTypes) {
        const intervals = shiftTimes[taskTypeId] || [];
        for (const interval of intervals) {
          if (!interval.start || !interval.end) continue;
          const key = `${taskTypeId}|${area.name}|${interval.start}-${interval.end}`;
          desiredKeys[key] = { taskTypeId, start: interval.start, end: interval.end };
        }
      }
      
      // Mappa esistenti
      const existingByKey = new Map<string, any>();
      for (const a of existingAssignments) {
        const key = `${a.taskType?.id}|${a.area}|${a.startTime}-${a.endTime}`;
        existingByKey.set(key, a);
      }

      // Aggiorna per indice; crea i nuovi; elimina gli extra senza assegnati
      const byTypeDesired: Record<string, Array<{ start: string; end: string }>> = {};
      Object.values(desiredKeys).forEach((v) => {
        byTypeDesired[v.taskTypeId] = byTypeDesired[v.taskTypeId] || [];
        byTypeDesired[v.taskTypeId].push({ start: v.start, end: v.end });
      });
      const byTypeExisting: Record<string, any[]> = {};
      existingAssignments.forEach((a) => {
        const tid = a.taskType?.id; if (!tid) return;
        byTypeExisting[tid] = byTypeExisting[tid] || [];
        byTypeExisting[tid].push(a);
      });
      Object.values(byTypeExisting).forEach(arr => arr.sort((a,b)=> a.startTime.localeCompare(b.startTime)));
      const typeIds = new Set<string>([...Object.keys(byTypeDesired), ...Object.keys(byTypeExisting)]);
      for (const tid of typeIds) {
        const desired = byTypeDesired[tid] || [];
        const existing = byTypeExisting[tid] || [];
        const clientsForType = shiftClients[tid] || [];
        const maxLen = Math.max(desired.length, existing.length);
        for (let i=0;i<maxLen;i++) {
          const d = desired[i];
          const ex = existing[i];
          const clientId = clientsForType[i] || null;
          if (d && ex) {
            const breakData = (shiftBreaks[tid] || [])[i];
            const patchPayload: any = { startTime: d.start, endTime: d.end };
            // Includi clientId solo se è cambiato o se c'è un valore
            if (clientId !== (ex as any).clientId) {
              patchPayload.clientId = clientId || null;
            }
            // Aggiungi o aggiorna dati pausa
            if (breakData?.hasScheduledBreak) {
              patchPayload.hasScheduledBreak = true;
              patchPayload.scheduledBreakStartTime = breakData.scheduledBreakStartTime || null;
              patchPayload.scheduledBreakEndTime = breakData.scheduledBreakEndTime || null;
            } else {
              // Se non c'è pausa, imposta a false per rimuoverla
              patchPayload.hasScheduledBreak = false;
            }
            const res = await fetch(`/api/assignments/${ex.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type':'application/json' },
              body: JSON.stringify(patchPayload),
            });
            if (!res.ok) console.error('Error patching assignment', await res.text());
          } else if (d && !ex) {
            const breakData = (shiftBreaks[tid] || [])[i];
            const payload = { 
              workdayId: workday.id, 
              taskTypeId: tid, 
              clientId: clientId || null,
              startTime: d.start, 
              endTime: d.end, 
              area: area.name, 
              note: null 
            } as any;
            if (breakData?.hasScheduledBreak && breakData.scheduledBreakStartTime && breakData.scheduledBreakEndTime) {
              payload.hasScheduledBreak = true;
              payload.scheduledBreakStartTime = breakData.scheduledBreakStartTime;
              payload.scheduledBreakEndTime = breakData.scheduledBreakEndTime;
            }
            const response = await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) console.error('Error creating shift assignment', await response.text());
          } else if (!d && ex) {
            let hasAssigned = false;
            try {
              if (ex.assignedUsers) {
                const arr = typeof ex.assignedUsers === 'string' ? JSON.parse(ex.assignedUsers) : ex.assignedUsers;
                hasAssigned = Array.isArray(arr) && arr.length > 0;
              }
            } catch {}
            if (!hasAssigned) {
              await fetch(`/api/assignments/${ex.id}`, { method: 'DELETE' });
            }
          }
        }
      }
      
      // Salva la preferenza ignoreOverlaps e l'ordine per quest'area
      if (shiftModalAreaId) {
        try {
          const currentPreferences = workday?.areaShiftPreferences 
            ? JSON.parse(workday.areaShiftPreferences) 
            : {};
          
          currentPreferences[shiftModalAreaId] = {
            ignoreOverlaps: ignoreOverlaps,
            order: Object.fromEntries(
              Object.entries(shiftTimes).map(([taskTypeId, list]) => [
                taskTypeId,
                (list || []).map((iv) => `${iv.start}-${iv.end}`)
              ])
            )
          };
          
          console.log("Saving areaShiftPreferences:", currentPreferences);
          
          const prefRes = await fetch(`/api/workdays/${workdayId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ areaShiftPreferences: currentPreferences }),
          });
          
          if (prefRes.ok) {
            console.log("Area shift preferences saved successfully");
          } else {
            console.error("Error saving preferences:", await prefRes.json());
          }
        } catch (error) {
          console.error("Error saving area shift preferences:", error);
        }
      }
      
      // Ricarica i dati della giornata
      await fetchWorkday();
      setShowShiftModal(false);
      setShiftModalAreaId(null);
    } catch (error) {
      console.error("Error saving shifts:", error);
    }
  };

  const handleOpenPersonnelModal = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    
    // Carica le duties filtrate per l'area dell'assignment
    try {
      const areaName = assignment.area;
      if (!areaName) {
        console.error("Assignment has no area");
        return;
      }
      
      const res = await fetch(`/api/duties?area=${encodeURIComponent(areaName)}`);
      if (res.ok) {
        const dutiesData = await res.json();
        // Ordina per codice (numero) crescente
        const parseCodeNumber = (code: string) => {
          const match = code?.match(/(\d{1,})$/);
          return match ? parseInt(match[1], 10) : 0;
        };
        const sorted = [...dutiesData].sort((a: any, b: any) => {
          const aNum = parseCodeNumber(a.code);
          const bNum = parseCodeNumber(b.code);
          if (aNum !== bNum) return aNum - bNum;
          // fallback alfabetico sul codice intero
          return String(a.code || "").localeCompare(String(b.code || ""));
        });
        setDuties(sorted);
        // Quantità di default a 0
        const baseQuantities: Record<string, number> = {};
        sorted.forEach((d: any) => { baseQuantities[d.id] = 0; });

        // Pre-popolare le quantità esistenti se presenti
        if (assignment.personnelRequests) {
          try {
            const existingRequests = JSON.parse(assignment.personnelRequests);
            existingRequests.forEach((req: { dutyId: string; quantity: number }) => {
              baseQuantities[req.dutyId] = req.quantity;
            });
          } catch (e) {
            console.error("Error parsing personnelRequests:", e);
          }
        }
        setPersonnelQuantities(baseQuantities);
      }
    } catch (error) {
      console.error("Error fetching duties:", error);
    }
    
    setShowPersonnelModal(true);
  };

  const handleSavePersonnel = async () => {
    if (!selectedAssignment) return;
    
    try {
      // Costruisci l'array di richieste (solo quelle con quantity > 0)
      const requests = Object.entries(personnelQuantities)
        .filter(([_, quantity]) => quantity > 0)
        .map(([dutyId, quantity]) => ({ dutyId, quantity }));
      
      const personnelRequestsJson = requests.length > 0 ? JSON.stringify(requests) : null;
      
      // Aggiorna l'assignment
      const res = await fetch(`/api/assignments/${selectedAssignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelRequests: personnelRequestsJson }),
      });
      
      if (res.ok) {
        // Calcola possibili turni della stessa tipologia nell'area corrente
        const currentAssignmentId = selectedAssignment.id;
        const currentTaskTypeId = selectedAssignment.taskType.id;
        const currentArea = selectedAssignment.area;
        const assignmentsSameType = (workday?.assignments || []).filter(a => 
          a.id !== currentAssignmentId &&
          a.taskType?.id === currentTaskTypeId &&
          a.area === currentArea
        );

        // Chiudi il modal corrente e prepara eventuale modal di copia
        setShowPersonnelModal(false);
        setSelectedAssignment(null);
        setPersonnelQuantities({});

        if (isClearing) {
          // Se sto svuotando, trova i turni identici (stessa tipologia e stesso personale)
          const previous = selectedAssignment.personnelRequests || null;
          const identical = assignmentsSameType.filter(a => (a.personnelRequests || null) === previous && previous !== null);
          if (identical.length > 0) {
            setClearTargets(identical);
            setShowClearModal(true);
          } else {
            await fetchWorkday();
          }
          setIsClearing(false);
        } else {
          if (assignmentsSameType.length > 0) {
            setCopyTargets(assignmentsSameType);
            setCopyPayload(personnelRequestsJson);
            setShowCopyModal(true);
          } else {
            await fetchWorkday();
          }
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("Error saving personnel requests:", res.status, errorData);
        alert(`Errore nel salvataggio: ${errorData.error || "Errore sconosciuto"}`);
      }
    } catch (error) {
      console.error("Error saving personnel:", error);
      alert("Errore di connessione. Riprova.");
    }
  };

  const finalizeAreaToggle = async (areaId: string, newState: boolean) => {
    const updatedSwitches = { ...areaEnabledSwitches, [areaId]: newState };
    setAreaEnabledSwitches(updatedSwitches);
    if (!newState) {
      setExpandedAreas((exp) => ({ ...exp, [areaId]: false }));
    } else {
      setExpandedAreas((exp) => ({ ...exp, [areaId]: true }));
    }
    try {
      const res = await fetch(`/api/workdays/${workdayId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaEnabledStates: updatedSwitches }),
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Error saving area enabled states:", res.status, responseData);
        setAreaEnabledSwitches((prev) => ({ ...prev, [areaId]: !newState }));
        alert("Errore nel salvataggio. Riprova.");
      } else {
        // Refresh workday to reflect any changes
        await fetchWorkday();
      }
    } catch (error) {
      console.error("Error saving area enabled states:", error);
      setAreaEnabledSwitches((prev) => ({ ...prev, [areaId]: !newState }));
      alert("Errore di connessione. Riprova.");
    }
  };

  const toggleAreaEnabled = async (areaId: string) => {
    const newState = !areaEnabledSwitches[areaId];
    if (!newState) {
      const area = enabledAreas.find((a) => a.id === areaId);
      const areaName = area?.name || null;
      const shiftsInArea = (workday?.assignments || []).filter(
        (a) => a.taskType?.type === "SHIFT" && (!!areaName ? a.area === areaName : true)
      );
      if (shiftsInArea.length > 0) {
        setAreaDisableConfirm({ areaId, shiftIds: shiftsInArea.map((s) => s.id) });
        return;
      }
    }
    await finalizeAreaToggle(areaId, newState);
  };

  const handleOpenActivitiesModal = () => {
    // Pre-popolare le attività esistenti (raggruppa per taskTypeId per supportare più intervalli)
    const existingAssignments = workday?.assignments?.filter(a => a.taskType?.type === "ACTIVITY") || [];
    
    const preSelectedTypes: string[] = [];
    const preSelectedTimes: Record<string, Array<{ start: string; end: string }>> = {};
    
    const assignmentsByType: Record<string, Array<{ start: string; end: string }>> = {};
    existingAssignments.forEach(assignment => {
      if (assignment.taskType && assignment.taskType.type === "ACTIVITY") {
        const taskTypeId = assignment.taskType.id;
        if (!assignmentsByType[taskTypeId]) {
          assignmentsByType[taskTypeId] = [];
          preSelectedTypes.push(taskTypeId);
        }
        assignmentsByType[taskTypeId].push({
          start: assignment.startTime,
          end: assignment.endTime,
        });
      }
    });
    
    Object.keys(assignmentsByType).forEach(taskTypeId => {
      preSelectedTimes[taskTypeId] = assignmentsByType[taskTypeId];
    });
    
    setSelectedTaskTypes(preSelectedTypes);
    setActivityTimes(preSelectedTimes);
    setActivityTimeErrors({});
    setShowActivitiesModal(true);
    fetchTaskTypes();
  };

  const handleSaveActivities = async () => {
    if (!workday) return;
    
    // Verifica se ci sono errori di validazione
    const errors = validateActivityTimesWithData(activityTimes);
    setActivityTimeErrors(errors);
    
    // Se ci sono errori, non salvare
    if (Object.keys(errors).length > 0) {
      console.error("Ci sono errori di validazione, salvataggio impedito");
      return;
    }
    
    try {
      const existingAssignments = workday.assignments?.filter(a => a.taskType?.type === "ACTIVITY") || [];
      
      // Prima eliminiamo tutte le assegnazioni di attività esistenti
      for (const assignment of existingAssignments) {
        await fetch(`/api/assignments/${assignment.id}`, {
          method: "DELETE",
        });
      }
      
      // Poi creiamo le nuove assegnazioni per ogni attività e ogni intervallo
      for (const taskTypeId of selectedTaskTypes) {
        const intervals = activityTimes[taskTypeId] || [];
        for (const times of intervals) {
          if (!times.start || !times.end) continue;
          
          const payload = {
            workdayId: workday.id,
            taskTypeId: taskTypeId,
            startTime: times.start,
            endTime: times.end,
            area: "AREA_TECNICA", // Default
            note: null,
          };
          
          console.log("Creating assignment with payload:", payload);
          
          const response = await fetch("/api/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
          if (!response.ok) {
            const error = await response.json();
            console.error("Error creating assignment:", error);
          } else {
            console.log("Assignment created successfully");
          }
        }
      }
      
      // Ricarica i dati della giornata
      await fetchWorkday();
      setShowActivitiesModal(false);
    } catch (error) {
      console.error("Error saving activities:", error);
    }
  };

  useEffect(() => {
    // Load workday first to get saved areaEnabledStates
    fetchWorkday().then(() => {
      // Then load enabled areas (will preserve states from workday)
      fetchEnabledAreas();
    });
  }, [workdayId]);

  const fetchWorkday = async () => {
    try {
      const res = await fetch(`/api/workdays/${workdayId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkday(data);
        
        // Carica i clienti dell'evento (solo per admin/responsabili)
        console.log('[fetchWorkday] data.event?.clientIds:', data.event?.clientIds);
        if (!isStandardUser && data.event?.clientIds) {
          try {
            const clientIds = JSON.parse(data.event.clientIds) || [];
            console.log('[fetchWorkday] Parsed clientIds:', clientIds);
            if (Array.isArray(clientIds) && clientIds.length > 0) {
              // Carica i dettagli dei clienti
              const clientsRes = await fetch("/api/clients");
              if (clientsRes.ok) {
                const allClients = await clientsRes.json();
                console.log('[fetchWorkday] All clients:', allClients.length);
                const eventClientsList = allClients.filter((c: any) => clientIds.includes(c.id));
                console.log('[fetchWorkday] Filtered event clients:', eventClientsList);
                const mappedClients = eventClientsList.map((c: any) => ({
                  id: c.id,
                  name: c.ragioneSociale || `${c.nome} ${c.cognome}` || c.code
                }));
                console.log('[fetchWorkday] Setting eventClients:', mappedClients);
                setEventClients(mappedClients);
              }
            } else {
              console.log('[fetchWorkday] No valid clientIds, setting empty array');
              setEventClients([]);
            }
          } catch (error) {
            console.error("Error loading event clients:", error);
            setEventClients([]);
          }
        } else if (isStandardUser) {
          // Per utenti standard, non carichiamo i clienti
          setEventClients([]);
        } else {
          console.log('[fetchWorkday] No clientIds in event, setting empty array');
          setEventClients([]);
        }
        
        // Carica tutte le duties per costruire il mapping id -> name
        try {
          const dutiesRes = await fetch("/api/duties");
          if (dutiesRes.ok) {
            const allDuties = await dutiesRes.json();
            const mapping: Record<string, string> = {};
            allDuties.forEach((duty: { id: string; name: string }) => {
              mapping[duty.id] = duty.name;
            });
            setDutiesMap(mapping);
          }
        } catch (error) {
          console.error("Error fetching duties for mapping:", error);
        }
        // Load areaEnabledStates from workday if present
        if (data.areaEnabledStates) {
          try {
            const parsed = JSON.parse(data.areaEnabledStates);
            setAreaEnabledSwitches((prev) => ({ ...prev, ...parsed }));
            
            // Auto-expand aree abilitate
            const enabledAreaIds = Object.keys(parsed).filter(areaId => parsed[areaId] === true);
            if (enabledAreaIds.length > 0) {
              // Espandi tutte le aree abilitate
              setExpandedAreas(prev => {
                const updated = { ...prev };
                enabledAreaIds.forEach(areaId => {
                  updated[areaId] = true;
                });
                return updated;
              });
            }
          } catch (e) {
            console.error("Error parsing areaEnabledStates:", e);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching workday:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Helpers for timeline rendering (single span)
  const parseTimeToMinutes = (t: string | null): number | null => {
    if (!t) return null;
    const [hh, mm] = t.split(":").map((v) => parseInt(v, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  };

  const buildSegments = (start: string | null, end: string | null) => {
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    const dayMins = 24 * 60;
    if (startMin === null || endMin === null) return { segments: [], isOvernight: false };

    const isOvernight = endMin <= startMin;

    if (isOvernight) {
      // For overnight shifts: first segment from start to 24:00
      const seg1Left = (startMin / dayMins) * 100;
      const seg1Width = ((dayMins - startMin) / dayMins) * 100;
      // Second segment from 00:00 to end (shown in next day)
      const seg2Left = 0;
      const seg2Width = (endMin / dayMins) * 100;
      return {
        segments: [
          { leftPct: seg1Left, widthPct: seg1Width, isExtended: false },
          { leftPct: seg2Left, widthPct: seg2Width, isExtended: true },
        ],
        isOvernight: true,
      };
    }

    const left = (startMin / dayMins) * 100;
    const width = ((endMin - startMin) / dayMins) * 100;
    return { segments: [{ leftPct: left, widthPct: width, isExtended: false }], isOvernight: false };
  };

  // Build segments for multiple spans (with overnight handling)
  const buildMultiSegments = (spans: { start: string; end: string }[]) => {
    const dayMins = 24 * 60;
    const main: Array<{ leftPct: number; widthPct: number; start: string; end: string }> = [];
    const nextDay: Array<{ leftPct: number; widthPct: number; start: string; end: string }> = [];
    for (const s of spans) {
      const startMin = parseTimeToMinutes(s.start);
      let endMin = parseTimeToMinutes(s.end);
      if (startMin === null || endMin === null) continue;
      
      // Se l'orario di fine è 00:00, lo interpretiamo come 24:00 (fine giornata)
      // Solo se è strettamente minore di startMin lo consideriamo giorno successivo
      if (endMin === 0 && startMin > 0) {
        endMin = dayMins; // 24:00 = 1440 minuti
      }
      
      if (endMin < startMin) {
        // split - turno notturno che va oltre la mezzanotte
        main.push({ 
          leftPct: (startMin / dayMins) * 100, 
          widthPct: ((dayMins - startMin) / dayMins) * 100,
          start: s.start,
          end: "24:00"
        });
        nextDay.push({ 
          leftPct: 0, 
          widthPct: (endMin / dayMins) * 100,
          start: "00:00",
          end: s.end
        });
      } else {
        main.push({ 
          leftPct: (startMin / dayMins) * 100, 
          widthPct: ((endMin - startMin) / dayMins) * 100,
          start: s.start,
          end: endMin === dayMins ? "24:00" : s.end
        });
      }
    }
    return { main, nextDay };
  };

  const parseSpans = (jsonStr?: string | null): { start: string; end: string }[] => {
    if (!jsonStr) return [];
    try {
      const arr = JSON.parse(jsonStr);
      if (Array.isArray(arr)) return arr.filter(s => s.start && s.end);
      return [];
    } catch {
      return [];
    }
  };

  // Calcola se ci sono gap di copertura TURNI (SHIFT) nelle fasce orarie della giornata
  const hasShiftCoverageGaps = (): boolean => {
    if (!workday?.timeSpans) return false;
    const spans = parseSpans(workday.timeSpans);
    if (spans.length === 0) return false; // attività esistenti gestite fuori, ma consideriamo gap totale

    // Colleziona le aree abilitate
    const enabledAreaNames = enabledAreas
      .filter(area => areaEnabledSwitches[area.id])
      .map(area => area.name);

    // Se non ci sono aree abilitate, non ci sono gap da verificare
    if (enabledAreaNames.length === 0) return false;

    // Colleziona tutti gli intervalli turni in minuti, gestendo notturni
    const toIntervals = (start: string, end: string): Array<{ start: number; end: number }> => {
      const s = parseTimeToMinutes(start);
      const e = parseTimeToMinutes(end);
      if (s === null || e === null) return [];
      const endMinutes = e === 0 ? 1440 : e;
      if (endMinutes < s || (e === 0 && s > 0)) {
        // Turno notturno: crea due intervalli - uno fino a mezzanotte e uno dal giorno successivo
        return [ 
          { start: s, end: 1440 },  // Da start a mezzanotte
          { start: 0, end: endMinutes === 1440 ? 1440 : endMinutes }  // Da mezzanotte a end
        ];
      }
      return [ { start: s, end: endMinutes } ];
    };

    const allIntervals: Array<{ start: number; end: number }> = [];
    // Filtra solo i turni (SHIFT) delle aree abilitate, non le attività
    (workday.assignments || [])
      .filter(a => a.taskType?.type === "SHIFT" && enabledAreaNames.includes(a.area))
      .forEach(a => {
        toIntervals(a.startTime, a.endTime).forEach(iv => allIntervals.push(iv));
      });

    // Se non ci sono turni per le aree abilitate, c'è un gap
    if (allIntervals.length === 0) return true;

    // Normalizza e unisci intervalli sovrapposti
    // Prima separa gli intervalli normali da quelli che attraversano mezzanotte (end < start o end >= 1440)
    allIntervals.sort((a,b) => {
      // Ordina prima per start, poi per end
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });
    
    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of allIntervals) {
      if (merged.length === 0) {
        merged.push({ ...iv });
        continue;
      }
      
      const last = merged[merged.length-1];
      
      // Gestisci intervalli che attraversano mezzanotte (end > 1440 o end < start)
      // Per semplicità, trattiamo come normali e uniamo solo se si sovrappongono
      if (iv.start <= last.end) {
        // Sovrapposizione o adiacenza: unisci
        last.end = Math.max(last.end, iv.end);
      } else {
        // Nuovo intervallo separato
        merged.push({ ...iv });
      }
    }

    // Verifica per ciascuna fascia oraria che sia completamente coperta dagli intervalli merged
    for (const span of spans) {
      const s = parseTimeToMinutes(span.start);
      let e = parseTimeToMinutes(span.end);
      if (s === null || e === null) continue;
      
      // Se e === 0, significa 24:00 (fine giornata)
      if (e === 0) e = 1440;
      
      // Gestisci span che attraversa mezzanotte
      const spanEnd = e < s ? e + 1440 : e;
      const spanStart = s;
      
      // Trova gli intervalli merged che coprono questo span
      let cursor = spanStart;
      let wrapped = false; // Indica se abbiamo già gestito il wrap a mezzanotte
      
      // Ordina gli intervalli: prima quelli normali, poi quelli che iniziano a 0 (dopo mezzanotte)
      const sortedMerged = [...merged].sort((a, b) => {
        // Se uno inizia a 0 e l'altro no, quello che inizia a 0 va dopo
        if (a.start === 0 && b.start !== 0) return 1;
        if (b.start === 0 && a.start !== 0) return -1;
        return a.start - b.start;
      });
      
      for (const m of sortedMerged) {
        // Se questo intervallo è completamente prima di cursor (e non abbiamo ancora wrappato), salta
        if (m.end <= cursor && !wrapped) continue;
        
        // Gestisci il wrap: se cursor è >= 1440 e questo intervallo inizia a 0, è una continuazione
        if (cursor >= 1440 && m.start === 0) {
          cursor = 1440 + m.end; // Continua dopo mezzanotte
          wrapped = true;
          if (cursor >= spanEnd) break;
          continue;
        }
        
        // Se c'è un gap tra cursor e l'inizio di questo intervallo
        if (m.start > cursor) {
          // Se cursor è >= 1440, abbiamo wrappato e non c'è più nulla da coprire
          if (cursor >= 1440) {
            // Verifica se spanEnd è già stato coperto
            if (cursor < spanEnd) return true;
            break;
          }
          return true; // gap trovato
        }
        
        // Aggiorna cursor con la fine di questo intervallo
        cursor = Math.max(cursor, m.end);
        
        // Se abbiamo raggiunto o superato 1440, segna che abbiamo wrappato
        if (cursor >= 1440) wrapped = true;
        
        // Se abbiamo coperto tutto lo span, passa al prossimo
        if (cursor >= spanEnd) {
          break;
        }
      }
      
      // Se cursor non ha raggiunto la fine dello span, c'è un gap
      if (cursor < spanEnd) {
        return true;
      }
    }
    return false;
  };

  // Calcola se ci sono gap di copertura ATTIVITÀ nelle fasce orarie della giornata
  const hasActivityCoverageGaps = (): boolean => {
    if (!workday?.timeSpans) return false;
    const spans = parseSpans(workday.timeSpans);
    if (spans.length === 0) return false; // mostra avviso solo se ci sono attività ma con buchi

    const toIntervals = (start: string, end: string): Array<{ start: number; end: number }> => {
      const s = parseTimeToMinutes(start);
      const e = parseTimeToMinutes(end);
      if (s === null || e === null) return [];
      // Se e === 0, significa 24:00 (fine giornata) = 1440 minuti
      const endMinutes = e === 0 ? 1440 : e;
      if (endMinutes < s) {
        // Attività che attraversa mezzanotte: crea due intervalli - uno fino a mezzanotte e uno dal giorno successivo
        return [ 
          { start: s, end: 1440 },  // Da start a mezzanotte
          { start: 0, end: endMinutes }  // Da mezzanotte a end
        ];
      }
      return [ { start: s, end: endMinutes } ];
    };

    const allIntervals: Array<{ start: number; end: number }> = [];
    // Filtra solo le attività (ACTIVITY), non i turni
    (workday.assignments || [])
      .filter(a => a.taskType?.type === "ACTIVITY")
      .forEach(a => {
        toIntervals(a.startTime, a.endTime).forEach(iv => allIntervals.push(iv));
      });

    // Se non ci sono attività, non ci sono gap (o meglio, non ci sono attività da verificare)
    if (allIntervals.length === 0) return false;

    allIntervals.sort((a,b) => a.start - b.start || a.end - b.end);
    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of allIntervals) {
      if (merged.length === 0 || iv.start > merged[merged.length-1].end) {
        merged.push({ ...iv });
      } else {
        // Unisci intervalli sovrapposti o adiacenti
        merged[merged.length-1].end = Math.max(merged[merged.length-1].end, iv.end);
      }
    }

    // Verifica per ciascuna fascia oraria che sia completamente coperta dalle attività
    for (const span of spans) {
      const s = parseTimeToMinutes(span.start);
      let e = parseTimeToMinutes(span.end);
      if (s === null || e === null) continue;
      
      // Se e === 0, significa 24:00 (fine giornata)
      if (e === 0) e = 1440;
      
      // Gestisci span che attraversa mezzanotte
      const spanEnd = e < s ? e + 1440 : e;
      const spanStart = s;
      
      // Trova gli intervalli merged che coprono questo span
      let cursor = spanStart;
      let wrapped = false; // Indica se abbiamo già gestito il wrap a mezzanotte
      
      // Ordina gli intervalli: prima quelli normali, poi quelli che iniziano a 0 (dopo mezzanotte)
      const sortedMerged = [...merged].sort((a, b) => {
        // Se uno inizia a 0 e l'altro no, quello che inizia a 0 va dopo
        if (a.start === 0 && b.start !== 0) return 1;
        if (b.start === 0 && a.start !== 0) return -1;
        return a.start - b.start;
      });
      
      for (const m of sortedMerged) {
        // Se questo intervallo è completamente prima di cursor (e non abbiamo ancora wrappato), salta
        if (m.end <= cursor && !wrapped) continue;
        
        // Gestisci il wrap: se cursor è >= 1440 e questo intervallo inizia a 0, è una continuazione
        if (cursor >= 1440 && m.start === 0) {
          cursor = 1440 + m.end; // Continua dopo mezzanotte
          wrapped = true;
          if (cursor >= spanEnd) break;
          continue;
        }
        
        // Se c'è un gap tra cursor e l'inizio di questo intervallo
        if (m.start > cursor) {
          // Se cursor è >= 1440, abbiamo wrappato e non c'è più nulla da coprire
          if (cursor >= 1440) {
            // Verifica se spanEnd è già stato coperto
            if (cursor < spanEnd) return true;
            break;
          }
          return true; // gap trovato
        }
        
        // Aggiorna cursor con la fine di questo intervallo
        cursor = Math.max(cursor, m.end);
        
        // Se abbiamo raggiunto o superato 1440, segna che abbiamo wrappato
        if (cursor >= 1440) wrapped = true;
        
        // Se abbiamo coperto tutto lo span, passa al prossimo
        if (cursor >= spanEnd) {
          break;
        }
      }
      
      // Se cursor non ha raggiunto la fine dello span, c'è un gap
      if (cursor < spanEnd) {
        return true;
      }
    }
    return false;
  };

  const formatSpans = (jsonStr?: string | null): string => {
    const spans = parseSpans(jsonStr);
    if (spans.length === 0) return "-";
    return spans.map(s => `${s.start} - ${s.end}`).join(", ");
  };

  if (loading) {
    return (
      <>
        <DashboardShell>
          <div className="flex items-center justify-center h-64">
            <p>Caricamento...</p>
          </div>
        </DashboardShell>
        {areaDisableConfirm && (
          <ConfirmDialog
            isOpen={true}
            title="Disattiva area"
            message="Sono presenti turni per quest'area di lavoro. Disattivandola verranno eliminati. Sei sicuro di procedere?"
            onCancel={() => setAreaDisableConfirm(null)}
            onConfirm={async () => {
              try {
                for (const id of areaDisableConfirm.shiftIds) {
                  await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
                }
              } catch (e) {
                console.error('Errore eliminando turni area:', e);
              } finally {
                await finalizeAreaToggle(areaDisableConfirm.areaId, false);
                setAreaDisableConfirm(null);
              }
            }}
          />
        )}
      </>
    );
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
    <>
    <DashboardShell>
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 lg:mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push(`/dashboard/events/${eventId}?tab=workdays`)}
              aria-label="Indietro"
              title="Indietro"
              className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl lg:text-3xl font-bold truncate">Giornata di Lavoro</h1>
          </div>
          <div className="flex gap-2 pointer-events-auto flex-shrink-0">
            {canEditEvents && isReadOnly && (
              <>
                <button
                  onClick={() => router.push(`/dashboard/events/${eventId}/workdays/${workdayId}/edit`)}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Modifica
                </button>
                <button
                  onClick={() => router.push(`/dashboard/events/${eventId}/workdays/${workdayId}`)}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Gestisci
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold">Dettagli Giornata</h2>
            {canEditEvents && workday.isOpen && !isReadOnly && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleOpenActivitiesModal}
                  className="w-full sm:w-auto px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 active:scale-100 transition-all duration-200 cursor-pointer text-sm"
                >
                  Definisci attività
                </button>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Evento</dt>
              <dd className="mt-1 text-sm text-gray-900">{workday.event.title}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Data</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(workday.date)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Location</dt>
              <dd className="mt-1 text-sm text-gray-900">{workday.location?.name || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Orari</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatSpans(workday.timeSpans)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Stato</dt>
              <dd className="mt-1">
                <span
                  className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    workday.isOpen
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {workday.isOpen ? "Aperta" : "Chiusa"}
                </span>
              </dd>
            </div>
          </dl>
          
          {/* Timeline 24h - support multi spans or legacy single span */}
          {parseSpans(workday.timeSpans).length > 0 && (() => {
            const spans = parseSpans(workday.timeSpans);
            const { main, nextDay } = buildMultiSegments(spans);
            
            // Calcola i gap orari non coperti da attività - separati per giorno corrente e successivo
            const calculateGaps = () => {
              const currentDayGaps: Array<{ start: number; end: number }> = [];
              const nextDayGaps: Array<{ start: number; end: number }> = [];
              
              if (!workday.assignments || workday.assignments.length === 0) {
                // Se non ci sono attività, tutti i timespan sono gap
                spans.forEach(span => {
                  const start = parseTimeToMinutesHelper(span.start);
                  let end = parseTimeToMinutesHelper(span.end);
                  if (start !== null && end !== null) {
                    // Se l'orario di fine è 00:00, lo interpretiamo come 24:00 (fine giornata)
                    if (end === 0 && start > 0) {
                      end = 1440; // 24:00 = 1440 minuti
                    }
                    
                    if (end < start) {
                      // Turno notturno: gap fino a mezzanotte nel giorno corrente
                      currentDayGaps.push({ start, end: 1440 });
                      // Gap dalla mezzanotte alla fine nel giorno successivo
                      if (end > 0) {
                        nextDayGaps.push({ start: 0, end });
                      }
                    } else {
                      // Turno normale: tutto nel giorno corrente
                      currentDayGaps.push({ start, end });
                    }
                  }
                });
                return { currentDayGaps, nextDayGaps };
              }
              
              // Per ogni span, controlla i gap
              spans.forEach(span => {
                const spanStart = parseTimeToMinutesHelper(span.start);
                let spanEnd = parseTimeToMinutesHelper(span.end);
                if (spanStart === null || spanEnd === null) return;
                
                // Se l'orario di fine è 00:00, lo interpretiamo come 24:00 (fine giornata)
                if (spanEnd === 0 && spanStart > 0) {
                  spanEnd = 1440; // 24:00 = 1440 minuti
                }
                
                // Raccogli solo le attività che ricadono in questo span
                const relevantActivities: Array<{ start: number; end: number }> = [];
                (workday.assignments || []).forEach(assignment => {
                  if (assignment.taskType?.type === "ACTIVITY" && assignment.startTime && assignment.endTime) {
                    const activityStart = parseTimeToMinutesHelper(assignment.startTime);
                    let activityEnd = parseTimeToMinutesHelper(assignment.endTime);
                    if (activityStart === null || activityEnd === null) return;
                    
                    // Se l'orario di fine attività è 00:00, lo interpretiamo come 24:00
                    if (activityEnd === 0 && activityStart > 0) {
                      activityEnd = 1440;
                    }
                    
                    // Verifica se l'attività ricade in questo span
                    if (spanEnd < spanStart) {
                      // Span notturno
                      relevantActivities.push({ start: activityStart, end: activityEnd });
                    } else {
                      // Span normale
                      if (activityStart >= spanStart && activityEnd <= spanEnd) {
                        relevantActivities.push({ start: activityStart, end: activityEnd });
                      }
                    }
                  }
                });
                
                // Se non ci sono attività in questo span, l'intero span è gap
                if (relevantActivities.length === 0) {
                  if (spanEnd < spanStart) {
                    // Turno notturno
                    currentDayGaps.push({ start: spanStart, end: 1440 });
                    if (spanEnd > 0) {
                      nextDayGaps.push({ start: 0, end: spanEnd });
                    }
                  } else {
                    // Turno normale
                    currentDayGaps.push({ start: spanStart, end: spanEnd });
                  }
                  return;
                }
                
                // Ordina le attività
                relevantActivities.sort((a, b) => a.start - b.start);
                
                if (spanEnd < spanStart) {
                  // TURNO NOTTURNO: tratta separatamente giorno corrente e successivo
                  
                  // Separa le attività in giorno corrente e successivo
                  const currentDayActivities: Array<{ start: number; end: number }> = [];
                  const nextDayActivities: Array<{ start: number; end: number }> = [];
                  
                  relevantActivities.forEach(interval => {
                    if (interval.end < interval.start) {
                      // Attività notturna
                      // Parte nel giorno corrente: da interval.start a 1440
                      currentDayActivities.push({ start: interval.start, end: 1440 });
                      // Parte nel giorno successivo: da 0 a interval.end
                      nextDayActivities.push({ start: 0, end: interval.end });
                    } else {
                      // Attività normale (completamente nel giorno corrente)
                      currentDayActivities.push(interval);
                    }
                  });
                  
                  // Ordina entrambe le liste
                  currentDayActivities.sort((a, b) => a.start - b.start);
                  nextDayActivities.sort((a, b) => a.start - b.start);
                  
                  // Calcola i gap per il giorno corrente
                  let currentPos = spanStart;
                  for (const activity of currentDayActivities) {
                    if (activity.start > currentPos && activity.start <= 1440) {
                      currentDayGaps.push({ start: currentPos, end: Math.min(activity.start, 1440) });
                    }
                    if (activity.end > currentPos) {
                      currentPos = Math.max(currentPos, activity.end);
                    }
                  }
                  if (currentPos < 1440) {
                    currentDayGaps.push({ start: currentPos, end: 1440 });
                  }
                  
                  // Calcola i gap per il giorno successivo
                  // Unifichiamo gli intervalli sovrapposti per trovare cosa è effettivamente coperto
                  if (nextDayActivities.length > 0) {
                    // Ordina per inizio
                    nextDayActivities.sort((a, b) => a.start - b.start);
                    
                    // Unifica gli intervalli sovrapposti
                    const merged: Array<{ start: number; end: number }> = [];
                    let current = nextDayActivities[0];
                    for (let i = 1; i < nextDayActivities.length; i++) {
                      const next = nextDayActivities[i];
                      if (next.start <= current.end) {
                        // Sovrapposto o adiacente: unisci
                        current.end = Math.max(current.end, next.end);
                      } else {
                        // Gap: salva l'intervallo corrente e inizia uno nuovo
                        merged.push(current);
                        current = next;
                      }
                    }
                    merged.push(current);
                    
                    // Trova i gap tra gli intervalli unificati
                    for (let i = 0; i < merged.length; i++) {
                      if (i === 0 && merged[i].start > 0) {
                        // Gap all'inizio
                        nextDayGaps.push({ start: 0, end: merged[i].start });
                      }
                      if (i < merged.length - 1) {
                        // Gap tra intervalli
                        nextDayGaps.push({ start: merged[i].end, end: merged[i+1].start });
                      } else {
                        // Gap finale dopo l'ultimo intervallo
                        if (merged[i].end < spanEnd) {
                          nextDayGaps.push({ start: merged[i].end, end: spanEnd });
                        }
                      }
                    }
                  } else {
                    // Nessuna attività: l'intero span è un gap
                    nextDayGaps.push({ start: 0, end: spanEnd });
                  }
                } else {
                  // TURNO NORMALE: tutto nel giorno corrente
                  let currentPos = spanStart;
                  
                  for (const interval of relevantActivities) {
                    if (interval.start > currentPos && interval.start <= spanEnd) {
                      currentDayGaps.push({ start: currentPos, end: interval.start });
                    }
                    if (interval.end > currentPos) {
                      currentPos = Math.max(currentPos, interval.end);
                    }
                  }
                  
                  if (currentPos < spanEnd) {
                    currentDayGaps.push({ start: currentPos, end: spanEnd });
                  }
                }
              });
              
              return { currentDayGaps, nextDayGaps };
            };
            
            const { currentDayGaps, nextDayGaps } = calculateGaps();
            
            return (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Timeline</h3>
                <div className="space-y-3">
                  {/* Main day */}
                  <div className="relative">
                    <div className="h-10 w-full bg-gray-50 rounded-md border border-gray-200 relative overflow-hidden">
                      {Array.from({ length: 13 }).map((_, idx) => {
                        const left = (idx * 120) / (24 * 60) * 100;
                        return <div key={idx} className="absolute top-0 bottom-0 border-l border-gray-200" style={{ left: `${left}%` }} />
                      })}
                      
                      {/* Intervalli definiti per la giornata */}
                      {main.map((seg, i) => (
                        <div 
                          key={i} 
                          className="absolute top-0 bottom-0 bg-gray-900/80" 
                          style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ 
                              text: `${seg.start} - ${seg.end}`, 
                              x: rect.left + rect.width / 2, 
                              y: rect.top 
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      ))}
                      
                      {/* Gap (intervalli senza attività) - Giorno corrente */}
                      {currentDayGaps.map((gap, i) => {
                        const leftPct = (gap.start / (24 * 60)) * 100;
                        const widthPct = ((gap.end - gap.start) / (24 * 60)) * 100;
                        const startTime = minutesToTime(gap.start);
                        const endTime = minutesToTime(gap.end);
                        return (
                          <div 
                            key={`gap-current-${i}`} 
                            className="absolute top-0 bottom-0 bg-red-200/50 border-2 border-dashed border-red-500 z-10" 
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltip({ 
                                text: `${startTime} - ${endTime}`, 
                                x: rect.left + rect.width / 2, 
                                y: rect.top 
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1 grid grid-cols-7 gap-0 text-xs text-gray-600 lg:hidden">
                      {[0,4,8,12,16,20,24].map((h) => <span key={h}>{String(h).padStart(2,'0')}:00</span>)}
                    </div>
                    <div className="mt-1 hidden lg:flex justify-between text-[11px] text-gray-600">
                      {Array.from({ length: 13 }).map((_, idx) => (<span key={idx}>{String(idx * 2).padStart(2,'0')}:00</span>))}
                    </div>
                  </div>

                  {nextDay.length > 0 && (
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Giorno successivo</div>
                        <div className="relative">
                          <div className="h-10 w-full bg-gray-50 rounded-md border border-dashed border-gray-300 relative overflow-hidden">
                            {Array.from({ length: 13 }).map((_, idx) => {
                              const left = (idx * 120) / (24 * 60) * 100;
                              return <div key={idx} className="absolute top-0 bottom-0 border-l border-gray-200" style={{ left: `${left}%` }} />
                            })}
                            {nextDay.map((seg, i) => (
                              <div 
                                key={i} 
                                className="absolute top-0 bottom-0 bg-gray-900/80" 
                                style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltip({ 
                                    text: `${seg.start} - ${seg.end}`, 
                                    x: rect.left + rect.width / 2, 
                                    y: rect.top 
                                  });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                              />
                            ))}
                            {nextDayGaps.map((gap, i) => {
                              const leftPct = (gap.start / 1440) * 100;
                              const widthPct = ((gap.end - gap.start) / 1440) * 100;
                              const startTime = minutesToTime(gap.start);
                              const endTime = minutesToTime(gap.end);
                              return (
                                <div 
                                  key={`gap-next-${i}`} 
                                  className="absolute top-0 bottom-0 bg-red-200/50 border-2 border-dashed border-red-500 z-10" 
                                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setTooltip({ 
                                      text: `${startTime} - ${endTime}`, 
                                      x: rect.left + rect.width / 2, 
                                      y: rect.top 
                                    });
                                  }}
                                  onMouseLeave={() => setTooltip(null)}
                                />
                              );
                            })}
                          </div>
                          <div className="mt-1 grid grid-cols-7 gap-0 text-xs text-gray-400 lg:hidden">
                            {[0,4,8,12,16,20,24].map((h) => <span key={h}>{String(h).padStart(2,'0')}:00</span>)}
                          </div>
                          <div className="mt-1 hidden lg:flex justify-between text-[11px] text-gray-400">
                            {Array.from({ length: 13 }).map((_, idx) => (<span key={idx}>{String(idx * 2).padStart(2,'0')}:00</span>))}
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })()}
          
          {/* Attività definite */}
          {workday.assignments && workday.assignments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium text-gray-500">Attività definite</h3>
                {!isStandardUser && (() => {
                  const showAlert = hasActivityCoverageGaps();
                  if (!showAlert) return null;
                  return (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-1 rounded">
                      {/* Icona calendario */}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="hidden sm:inline">Attività incomplete</span>
                    </span>
                  );
                })()}
              </div>
              <div className="space-y-2">
                {workday.assignments
                  .filter(assignment => assignment.taskType && assignment.taskType.type === "ACTIVITY")
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">
                        {assignment.taskType?.name || "Attività"}
                      </span>
                      <span className="text-gray-600">
                        {assignment.startTime} - {assignment.endTime}
                      </span>
                    </div>
                  ))}
              </div>
              
              {/* Timeline delle attività */}
              {workday.assignments
                .filter(assignment => assignment.taskType?.type === "ACTIVITY")
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((assignment) => {
                  const startMinutes = parseTimeToMinutesHelper(assignment.startTime);
                  let endMinutes = parseTimeToMinutesHelper(assignment.endTime);
                  
                  if (startMinutes === null || endMinutes === null) return null;
                  
                  // Se l'orario di fine è 00:00, lo interpretiamo come 24:00 (fine giornata)
                  // Solo se è strettamente minore di startMin lo consideriamo giorno successivo
                  if (endMinutes === 0 && startMinutes > 0) {
                    endMinutes = 24 * 60; // 24:00 = 1440 minuti
                  }
                  
                  const isOvernight = endMinutes < startMinutes;
                  const adjustedEndMinutes = isOvernight ? endMinutes + (24 * 60) : endMinutes;
                  const color = assignment.taskType?.color || "#3B82F6";
                  
                  // Giorno attuale
                  const leftPctMain = (startMinutes / (24 * 60)) * 100;
                  const widthPctMain = isOvernight 
                    ? ((24 * 60 - startMinutes) / (24 * 60)) * 100 
                    : ((endMinutes - startMinutes) / (24 * 60)) * 100;
                  
                  // Giorno successivo (solo se necessario)
                  const widthPctNext = isOvernight ? (endMinutes / (24 * 60)) * 100 : 0;
                  
                  return (
                    <div key={assignment.id} className="mt-3">
                      <div className="text-xs text-gray-600 mb-1">{assignment.taskType?.name}</div>
                      
                      {/* Timeline giorno attuale */}
                      <div className="h-8 lg:h-6 w-full bg-gray-50 rounded-md border border-gray-200 relative overflow-hidden">
                        <div
                          className="absolute top-0 bottom-0 rounded"
                          style={{
                            left: `${leftPctMain}%`,
                            width: `${widthPctMain}%`,
                            backgroundColor: color,
                            opacity: 0.7,
                          }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ 
                              text: `${assignment.startTime} - ${assignment.endTime}`, 
                              x: rect.left + rect.width / 2, 
                              y: rect.top 
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      </div>
                      <div className="mt-1 grid grid-cols-7 gap-0 text-xs text-gray-500 lg:hidden">
                        {[0,4,8,12,16,20,24].map((h) => <span key={h}>{String(h).padStart(2,'0')}:00</span>)}
                      </div>
                      <div className="mt-1 hidden lg:flex justify-between text-[10px] text-gray-500">
                        {Array.from({ length: 13 }).map((_, idx) => (
                          <span key={idx}>{String(idx * 2).padStart(2, '0')}:00</span>
                        ))}
                      </div>
                      
                      {/* Personale assegnato */}
                      {assignment.personnelRequests && (() => {
                        try {
                          const requests = JSON.parse(assignment.personnelRequests);
                          if (!Array.isArray(requests) || requests.length === 0) return null;
                          
                          return (
                            <div className="mt-2 text-xs text-gray-600">
                                          {(() => {
                                            const byDuty = (assignment as any).assignedUsersByDuty as Record<string, Array<{ id: string; name: string | null; cognome: string | null }>> | undefined;
                                            return requests.map((req: { dutyId: string; quantity: number }) => {
                                              const list = (byDuty && byDuty[req.dutyId]) ? byDuty[req.dutyId] : [];
                                              const assignedCount = list.length;
                                              const names = list.map(u => formatUserName(u, list)).join(', ');
                                              return (
                                                <div key={req.dutyId} className="mt-0.5">
                                                  {dutiesMap[req.dutyId] || "Mansione sconosciuta"} ({assignedCount}/{req.quantity})
                                                  {names ? ` - ${names}` : ''}
                                                </div>
                                              );
                                            });
                                          })()}
                            </div>
                          );
                        } catch (e) {
                          return null;
                        }
                      })()}
                      
                      {/* Timeline giorno successivo (se attività notturna) */}
                      {isOvernight && widthPctNext > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-gray-500 italic mb-1">Giorno successivo</div>
                          <div className="h-8 lg:h-6 w-full bg-gray-50 rounded-md border border-dashed border-gray-300 relative overflow-hidden">
                            <div
                              className="absolute top-0 bottom-0 rounded"
                              style={{
                                left: '0%',
                                width: `${widthPctNext}%`,
                                backgroundColor: color,
                                opacity: 0.7,
                              }}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setTooltip({ 
                                  text: `00:00 - ${assignment.endTime}`, 
                                  x: rect.left + rect.width / 2, 
                                  y: rect.top 
                                });
                              }}
                              onMouseLeave={() => setTooltip(null)}
                            />
                          </div>
                          <div className="mt-1 grid grid-cols-7 gap-0 text-xs text-gray-400 lg:hidden">
                            {[0,4,8,12,16,20,24].map((h) => <span key={h}>{String(h).padStart(2,'0')}:00</span>)}
                          </div>
                          <div className="mt-1 hidden lg:flex justify-between text-[10px] text-gray-400">
                            {Array.from({ length: 13 }).map((_, idx) => (
                              <span key={idx}>{String(idx * 2).padStart(2, '0')}:00</span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Nessun pulsante in questa vista */}
                    </div>
                  );
                })}
            </div>
          )}
          
          {/* Programmazione Giornata - Aree Abilitate */}
          <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h3 className="text-sm font-medium text-gray-500">Programmazione Giornata</h3>
                {!isStandardUser && (() => {
                  const activitiesCount = (workday.assignments || []).filter(a => a.taskType?.type === "ACTIVITY").length;
                  const activitiesNotCovering = activitiesCount === 0 || hasActivityCoverageGaps();
                  if (activitiesNotCovering) {
                    return (
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-red-600">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Attenzione: le attività non coprono tutto l&apos;intervallo orario
                      </span>
                    );
                  }
                  const showShiftAlert = activitiesCount > 0 && hasShiftCoverageGaps();
                  if (!showShiftAlert) return null;
                  return (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-1 rounded">
                      {/* Icona orologio */}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="hidden sm:inline">Programmazione turni incompleta</span>
                    </span>
                  );
                })()}
              </div>

              {enabledAreas.length === 0 ? (
                <div className="py-6 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  Nessuna area disponibile. Configura le aree nelle impostazioni per pianificare i turni.
                </div>
              ) : (
                <div className="space-y-2">
                  {enabledAreas.map((area) => (
                    <div key={area.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-left">
                        <div className="flex items-center gap-3">
                          {/* Stato area */}
                          {isReadOnly ? (
                            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                              areaEnabledSwitches[area.id] ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {areaEnabledSwitches[area.id] ? 'Attiva' : 'Disattiva'}
                            </span>
                          ) : (
                          <button
                            onClick={() => toggleAreaEnabled(area.id)}
                            aria-pressed={Boolean(areaEnabledSwitches[area.id])}
                            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-all duration-200 focus:outline-none cursor-pointer hover:shadow-md hover:scale-105 active:scale-100 ${
                              areaEnabledSwitches[area.id]
                                ? 'bg-gray-900 hover:bg-gray-800'
                                : 'bg-gray-300 hover:bg-gray-400'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                                areaEnabledSwitches[area.id] ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          )}
                          {isReadOnly ? (
                            <span className={`px-0 py-0 text-left font-medium ${areaEnabledSwitches[area.id] ? 'text-gray-900' : 'text-gray-400'}`}>
                              {area.name}
                            </span>
                          ) : (
                          <button
                            onClick={() => toggleArea(area.id)}
                            disabled={!areaEnabledSwitches[area.id]}
                            className={`px-0 py-0 text-left font-medium text-gray-900 transition-all duration-200 ${
                              areaEnabledSwitches[area.id]
                                ? 'hover:scale-[1.01]'
                                : 'opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {area.name}
                          </button>
                          )}
                        </div>
                        {!isReadOnly && (
                        <button
                          onClick={() => toggleArea(area.id)}
                          disabled={!areaEnabledSwitches[area.id]}
                          className={`flex items-center justify-center rounded-md transition-all duration-200 ${
                            areaEnabledSwitches[area.id]
                              ? 'hover:bg-gray-100 hover:shadow-sm cursor-pointer'
                              : 'opacity-60 cursor-not-allowed'
                          }`}
                          aria-label="Espandi area"
                        >
                          <svg
                            className={`w-5 h-5 text-gray-500 transition-transform ${expandedAreas[area.id] ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        )}
                      </div>
                      {(isReadOnly ? areaEnabledSwitches[area.id] : expandedAreas[area.id]) && (
                        <div className="p-4 border-t border-gray-200">
                          {!isReadOnly && (
                          <button
                            onClick={() => handleOpenShiftModal(area.id)}
                            className="w-full sm:w-auto px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg active:scale-100 transition-all duration-200 cursor-pointer text-sm mb-4"
                          >
                            Imposta turno
                          </button>
                          )}
                          
                          {/* Visualizzazione turni per quest'area */}
                          {(() => {
                            const areaShifts = (workday?.assignments || [])
                              .filter(a => a.taskType?.type === "SHIFT" && a.area === area.name)
                              .sort((a, b) => a.startTime.localeCompare(b.startTime));
                            
                            if (areaShifts.length === 0) {
                              return (
                                <p className="text-sm text-gray-500 italic">
                                  Nessun turno impostato per questa area
                                </p>
                              );
                            }
                            
                            return (
                              <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-gray-700">Turni impostati</h4>
                                <div className="space-y-2">
                                  {areaShifts.map((assignment) => {
                                    // Trova il nome del cliente se presente
                                    const clientName = (assignment as any).clientId 
                                      ? eventClients.find(c => c.id === (assignment as any).clientId)?.name 
                                      : null;
                                    
                                    return (
                                      <div key={assignment.id} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                          {assignment.taskType?.color && (
                                            <div
                                              className="w-3 h-3 rounded border border-gray-300"
                                              style={{ backgroundColor: assignment.taskType.color }}
                                            />
                                          )}
                                          <span className="font-medium text-gray-900">
                                            {assignment.taskType?.name || "Turno"}
                                          </span>
                                        </div>
                                        <span className="text-gray-600">
                                          {assignment.startTime} - {assignment.endTime}
                                          {(assignment as any).hasScheduledBreak && (assignment as any).scheduledBreakStartTime && (assignment as any).scheduledBreakEndTime && (
                                            <span className="text-gray-400 ml-1">(Pausa: {(assignment as any).scheduledBreakStartTime} - {(assignment as any).scheduledBreakEndTime})</span>
                                          )}
                                          {/* Cliente visibile solo a ruoli di gestione */}
                                          {canEditEvents && (
                                            <>
                                              <span className="text-gray-500"> | Cliente: </span>
                                              {clientName ? (
                                                <span className="text-gray-500">{clientName}</span>
                                              ) : (
                                                <span className="text-red-500">non ancora impostato</span>
                                              )}
                                            </>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                
                                {/* Timeline dei turni */}
                                <div className="space-y-3 mt-4">
                                  {areaShifts.map((assignment) => {
                                    const startMinutes = parseTimeToMinutesHelper(assignment.startTime);
                                    const endMinutes = parseTimeToMinutesHelper(assignment.endTime);
                                    
                                    if (startMinutes === null || endMinutes === null) return null;
                                    
                                    const isOvernight = endMinutes < startMinutes;
                                    const color = assignment.taskType?.color || "#3B82F6";
                                    
                                    // Giorno attuale
                                    const leftPctMain = (startMinutes / (24 * 60)) * 100;
                                    const widthPctMain = isOvernight 
                                      ? ((24 * 60 - startMinutes) / (24 * 60)) * 100 
                                      : ((endMinutes - startMinutes) / (24 * 60)) * 100;
                                    
                                    // Giorno successivo (solo se turno notturno)
                                    const widthPctNext = isOvernight ? (endMinutes / (24 * 60)) * 100 : 0;
                                    
                                    return (
                                      <div key={assignment.id}>
                                        <div className="text-xs text-gray-600 mb-1">
                                          {assignment.taskType?.name}
                                        </div>
                                        
                                        {/* Timeline giorno attuale */}
                                        <div className="h-8 lg:h-6 w-full bg-gray-50 rounded-md border border-gray-200 relative overflow-hidden">
                                          <div
                                            className="absolute top-0 bottom-0 rounded"
                                            style={{
                                              left: `${leftPctMain}%`,
                                              width: `${widthPctMain}%`,
                                              backgroundColor: color,
                                              opacity: 0.7,
                                            }}
                                            onMouseEnter={(e) => {
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setTooltip({ 
                                                text: `${assignment.startTime} - ${assignment.endTime}`, 
                                                x: rect.left + rect.width / 2, 
                                                y: rect.top 
                                              });
                                            }}
                                            onMouseLeave={() => setTooltip(null)}
                                          />
                                          {/* Visualizzazione pausa prevista */}
                                          {(assignment as any).hasScheduledBreak && (assignment as any).scheduledBreakStartTime && (assignment as any).scheduledBreakEndTime && (() => {
                                            const breakStartMinutes = parseTimeToMinutesHelper((assignment as any).scheduledBreakStartTime);
                                            const breakEndMinutes = parseTimeToMinutesHelper((assignment as any).scheduledBreakEndTime);
                                            
                                            if (breakStartMinutes === null || breakEndMinutes === null) return null;
                                            
                                            // Per turni normali (non notturni): la pausa deve essere tra startMinutes e endMinutes
                                            // Per turni notturni: la pausa può essere tra startMinutes e 24:00 (se nel giorno attuale) 
                                            // o tra 00:00 e endMinutes (se nel giorno successivo)
                                            
                                            // Verifica se la pausa è nel giorno attuale (per turni notturni)
                                            if (isOvernight && breakStartMinutes < startMinutes) {
                                              // La pausa è nel giorno successivo, viene gestita nella timeline del giorno successivo
                                              return null;
                                            }
                                            
                                            // Verifica che la pausa sia all'interno della parte visibile del turno nel giorno attuale
                                            const dayEnd = isOvernight ? 24 * 60 : endMinutes;
                                            if (breakStartMinutes < startMinutes || breakStartMinutes >= dayEnd) {
                                              return null;
                                            }
                                            
                                            // Limita la fine della pausa al termine del giorno attuale
                                            const visibleBreakEnd = Math.min(breakEndMinutes, dayEnd);
                                            
                                            // Calcola la posizione della pausa nella timeline (0-100% del giorno)
                                            const breakLeftPct = (breakStartMinutes / (24 * 60)) * 100;
                                            const breakWidthPct = ((visibleBreakEnd - breakStartMinutes) / (24 * 60)) * 100;
                                            
                                            // Verifica che la pausa sia all'interno della barra del turno visibile
                                            const breakRightPct = breakLeftPct + breakWidthPct;
                                            if (breakRightPct <= leftPctMain || breakLeftPct >= leftPctMain + widthPctMain) {
                                              return null;
                                            }
                                            
                                            // Calcola la posizione e larghezza relative all'interno della barra del turno
                                            const breakLeftRelative = Math.max(0, ((breakLeftPct - leftPctMain) / widthPctMain) * 100);
                                            const breakRightRelative = Math.min(100, ((breakRightPct - leftPctMain) / widthPctMain) * 100);
                                            const breakWidthRelative = breakRightRelative - breakLeftRelative;
                                            
                                            // Converti il colore hex in rgba per l'opacità
                                            const hexToRgba = (hex: string, alpha: number) => {
                                              const r = parseInt(hex.slice(1, 3), 16);
                                              const g = parseInt(hex.slice(3, 5), 16);
                                              const b = parseInt(hex.slice(5, 7), 16);
                                              return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                                            };
                                            
                                            return (
                                              <div
                                                className="absolute top-0 bottom-0 rounded"
                                                style={{
                                                  left: `${leftPctMain + (widthPctMain * breakLeftRelative / 100)}%`,
                                                  width: `${widthPctMain * breakWidthRelative / 100}%`,
                                                  backgroundImage: `repeating-linear-gradient(
                                                    45deg,
                                                    ${hexToRgba(color, 0.85)},
                                                    ${hexToRgba(color, 0.85)} 8px,
                                                    transparent 8px,
                                                    transparent 16px
                                                  )`,
                                                }}
                                                onMouseEnter={(e) => {
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  setTooltip({ 
                                                    text: `Pausa: ${(assignment as any).scheduledBreakStartTime} - ${(assignment as any).scheduledBreakEndTime}`, 
                                                    x: rect.left + rect.width / 2, 
                                                    y: rect.top 
                                                  });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                              />
                                            );
                                          })()}
                                        </div>
                                        <div className="mt-1 grid grid-cols-7 gap-0 text-xs text-gray-500 lg:hidden">
                                          {[0,4,8,12,16,20,24].map((h) => <span key={h}>{String(h).padStart(2,'0')}:00</span>)}
                                        </div>
                                        <div className="mt-1 hidden lg:flex justify-between text-[10px] text-gray-500">
                                          {Array.from({ length: 13 }).map((_, idx) => (
                                            <span key={idx}>{String(idx * 2).padStart(2, '0')}:00</span>
                                          ))}
                                        </div>
                                        
                                        {/* Personale assegnato */}
                                        {assignment.personnelRequests && (() => {
                                          try {
                                            const requests = JSON.parse(assignment.personnelRequests);
                                            if (!Array.isArray(requests) || requests.length === 0) return null;
                                            
                                            return (
                                              <div className="mt-2 text-xs text-gray-600">
                                                {(() => {
                                                  const byDuty = (assignment as any).assignedUsersByDuty as Record<string, Array<{ id: string; name: string | null; cognome: string | null }>> | undefined;
                                                  return requests.map((req: { dutyId: string; quantity: number }) => {
                                                    const list = (byDuty && byDuty[req.dutyId]) ? byDuty[req.dutyId] : [];
                                                    const assignedCount = list.length;
                                                    const names = list.map(u => formatUserName(u, list)).join(', ');
                                                    return (
                                                      <div key={req.dutyId} className="mt-0.5">
                                                        {dutiesMap[req.dutyId] || "Mansione sconosciuta"} ({assignedCount}/{req.quantity})
                                                        {names ? ` - ${names}` : ''}
                                                      </div>
                                                    );
                                                  });
                                                })()}
                                              </div>
                                            );
                                          } catch (e) {
                                            return null;
                                          }
                                        })()}
                                        
                                        {/* Timeline giorno successivo (se turno notturno) */}
                                        {isOvernight && widthPctNext > 0 && (
                                          <div className="mt-3">
                                            <div className="text-xs text-gray-500 italic mb-1">Giorno successivo</div>
                                            <div className="h-8 lg:h-6 w-full bg-gray-50 rounded-md border border-dashed border-gray-300 relative overflow-hidden">
                                              <div
                                                className="absolute top-0 bottom-0 rounded"
                                                style={{
                                                  left: '0%',
                                                  width: `${widthPctNext}%`,
                                                  backgroundColor: color,
                                                  opacity: 0.7,
                                                }}
                                                onMouseEnter={(e) => {
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  setTooltip({ 
                                                    text: `00:00 - ${assignment.endTime}`, 
                                                    x: rect.left + rect.width / 2, 
                                                    y: rect.top 
                                                  });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                              />
                                              {/* Visualizzazione pausa prevista nel giorno successivo */}
                                              {(assignment as any).hasScheduledBreak && (assignment as any).scheduledBreakStartTime && (assignment as any).scheduledBreakEndTime && (() => {
                                                const breakStartMinutes = parseTimeToMinutesHelper((assignment as any).scheduledBreakStartTime);
                                                const breakEndMinutes = parseTimeToMinutesHelper((assignment as any).scheduledBreakEndTime);
                                                
                                                if (breakStartMinutes === null || breakEndMinutes === null) return null;
                                                
                                                // Per turni notturni, verifica se la pausa è nel giorno successivo
                                                if (!isOvernight) return null;
                                                
                                                // La pausa è nel giorno successivo se inizia prima della mezzanotte ma è minore di startMinutes
                                                // oppure se inizia dopo la mezzanotte
                                                if (breakStartMinutes >= startMinutes) {
                                                  // La pausa è nel giorno attuale, già gestita
                                                  return null;
                                                }
                                                
                                                // Verifica che la pausa sia all'interno della parte del turno nel giorno successivo (00:00 - endMinutes)
                                                if (breakEndMinutes > endMinutes || breakEndMinutes <= 0) {
                                                  return null;
                                                }
                                                
                                                // Calcola la posizione della pausa nella timeline (0-100% del giorno)
                                                // Per il giorno successivo, breakStartMinutes è < startMinutes, quindi rappresenta un'ora dopo la mezzanotte
                                                // Es: se startMinutes = 1320 (22:00) e breakStartMinutes = 30 (00:30), la pausa inizia a 30 minuti del nuovo giorno
                                                const breakLeftPct = (breakStartMinutes / (24 * 60)) * 100;
                                                const breakWidthPct = ((breakEndMinutes - breakStartMinutes) / (24 * 60)) * 100;
                                                
                                                // La barra del turno nel giorno successivo inizia a 0% e va fino a widthPctNext%
                                                // Verifica che la pausa sia all'interno di questa barra
                                                if (breakLeftPct + breakWidthPct > widthPctNext) {
                                                  return null;
                                                }
                                                
                                                // Calcola la posizione e larghezza relative all'interno della barra del turno
                                                const breakLeftRelative = (breakLeftPct / widthPctNext) * 100;
                                                const breakWidthRelative = (breakWidthPct / widthPctNext) * 100;
                                                
                                                // Converti il colore hex in rgba per l'opacità
                                                const hexToRgba = (hex: string, alpha: number) => {
                                                  const r = parseInt(hex.slice(1, 3), 16);
                                                  const g = parseInt(hex.slice(3, 5), 16);
                                                  const b = parseInt(hex.slice(5, 7), 16);
                                                  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                                                };
                                                
                                                return (
                                                  <div
                                                    className="absolute top-0 bottom-0 rounded"
                                                    style={{
                                                      left: `${widthPctNext * breakLeftRelative / 100}%`,
                                                      width: `${widthPctNext * breakWidthRelative / 100}%`,
                                                      backgroundImage: `repeating-linear-gradient(
                                                        45deg,
                                                        ${hexToRgba(color, 0.3)},
                                                        ${hexToRgba(color, 0.3)} 10px,
                                                        transparent 10px,
                                                        transparent 20px
                                                      )`,
                                                    }}
                                                    onMouseEnter={(e) => {
                                                      const rect = e.currentTarget.getBoundingClientRect();
                                                      setTooltip({ 
                                                        text: `Pausa: ${(assignment as any).scheduledBreakStartTime} - ${(assignment as any).scheduledBreakEndTime}`, 
                                                        x: rect.left + rect.width / 2, 
                                                        y: rect.top 
                                                      });
                                                    }}
                                                    onMouseLeave={() => setTooltip(null)}
                                                  />
                                                );
                                              })()}
                                            </div>
                                            <div className="mt-1 grid grid-cols-7 gap-0 text-xs text-gray-400 lg:hidden">
                                              {[0,4,8,12,16,20,24].map((h) => <span key={h}>{String(h).padStart(2,'0')}:00</span>)}
                                            </div>
                                            <div className="mt-1 hidden lg:flex justify-between text-[10px] text-gray-400">
                                              {Array.from({ length: 13 }).map((_, idx) => (
                                                <span key={idx}>{String(idx * 2).padStart(2, '0')}:00</span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        
                                        
                                        
                                        {/* Pulsante Imposta tipologia personale / personale in turno */}
                                        {!isReadOnly && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                              onClick={() => handleOpenPersonnelModal(assignment)}
                                              className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:scale-100 transition-all duration-200 cursor-pointer"
                                            >
                                              Imposta tipologia personale
                                            </button>
                                            {(() => {
                                              let hasPersonnelTypes = false;
                                              try {
                                                if (assignment.personnelRequests) {
                                                  const parsed = JSON.parse(assignment.personnelRequests);
                                                  hasPersonnelTypes = Array.isArray(parsed) && parsed.length > 0;
                                                }
                                              } catch {}
                                              return (
                                                <button
                                                  onClick={() => hasPersonnelTypes && handleOpenAssignUsersModal(assignment)}
                                                  disabled={!hasPersonnelTypes}
                                                  className={`px-3 py-2 text-xs rounded-lg transition-all duration-200 ${hasPersonnelTypes ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-100 cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                                                >
                                                  Imposta personale in turno
                                                </button>
                                              );
                                            })()}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>


        {/* Activities Modal */}
        {showActivitiesModal && (
          <div 
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveActivities();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowActivitiesModal(false);
              }
            }}
            tabIndex={-1}
          >
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">Definisci Attività</h2>
              <p className="text-gray-600 mb-6">Seleziona le attività da definire per questa giornata</p>

              <div className="space-y-3 mb-6">
                {taskTypes
                  .filter(taskType => taskType.type === "ACTIVITY")
                  .map((taskType) => (
                    <div
                      key={taskType.id}
                      className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedTaskTypes.includes(taskType.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTaskTypes([...selectedTaskTypes, taskType.id]);
                              setActivityTimes(prev => ({
                                ...prev,
                                [taskType.id]: [{ start: "", end: "" }]
                              }));
                            } else {
                              setSelectedTaskTypes(selectedTaskTypes.filter(id => id !== taskType.id));
                              setActivityTimes(prev => {
                                const { [taskType.id]: _, ...rest } = prev;
                                return rest;
                              });
                              setActivityTimeErrors(prev => {
                                const { [taskType.id]: _, ...rest } = prev;
                                return rest;
                              });
                            }
                          }}
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                        />
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900">{taskType.name}</p>
                          {taskType.description && (
                            <p className="text-sm text-gray-500">{taskType.description}</p>
                          )}
                        </div>
                      </div>
                      {selectedTaskTypes.includes(taskType.id) && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                          {(activityTimes[taskType.id] || [{ start: "", end: "" }]).map((interval, idx) => (
                            <div key={idx} className="space-y-2">
                              <div className="flex gap-4 items-end">
                                <div className="flex-1">
                                  <label className="block text-xs text-gray-500 mb-1">Ora Inizio</label>
                                  <input
                                    type="time"
                                    value={interval.start || ""}
                                    onChange={(e) => {
                                      const intervals = [...(activityTimes[taskType.id] || [{ start: "", end: "" }])];
                                      intervals[idx] = { ...intervals[idx], start: e.target.value };
                                      const updatedTimes = { ...activityTimes, [taskType.id]: intervals };
                                      setActivityTimes(updatedTimes);
                                      const errors = validateActivityTimesWithData(updatedTimes);
                                      setActivityTimeErrors(errors);
                                    }}
                                    onBlur={(e) => {
                                      if (e.target.value && !e.target.value.includes(":")) {
                                        const normalized = `${e.target.value}:00`;
                                        const intervals = [...(activityTimes[taskType.id] || [{ start: "", end: "" }])];
                                        intervals[idx] = { ...intervals[idx], start: normalized };
                                        const updatedTimes = { ...activityTimes, [taskType.id]: intervals };
                                        setActivityTimes(updatedTimes);
                                        const errors = validateActivityTimesWithData(updatedTimes);
                                        setActivityTimeErrors(errors);
                                      }
                                    }}
                                    className={`w-full px-3 py-2 h-10 border rounded-lg text-sm ${
                                      activityTimeErrors[taskType.id]?.[idx]?.start ? 'border-red-500' : 'border-gray-300'
                                    }`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs text-gray-500 mb-1">Ora Fine</label>
                                  <input
                                    type="time"
                                    value={interval.end || ""}
                                    onChange={(e) => {
                                      const intervals = [...(activityTimes[taskType.id] || [{ start: "", end: "" }])];
                                      intervals[idx] = { ...intervals[idx], end: e.target.value };
                                      const updatedTimes = { ...activityTimes, [taskType.id]: intervals };
                                      setActivityTimes(updatedTimes);
                                      const errors = validateActivityTimesWithData(updatedTimes);
                                      setActivityTimeErrors(errors);
                                    }}
                                    onBlur={(e) => {
                                      if (e.target.value && !e.target.value.includes(":")) {
                                        const normalized = `${e.target.value}:00`;
                                        const intervals = [...(activityTimes[taskType.id] || [{ start: "", end: "" }])];
                                        intervals[idx] = { ...intervals[idx], end: normalized };
                                        const updatedTimes = { ...activityTimes, [taskType.id]: intervals };
                                        setActivityTimes(updatedTimes);
                                        const errors = validateActivityTimesWithData(updatedTimes);
                                        setActivityTimeErrors(errors);
                                      }
                                    }}
                                    className={`w-full px-3 py-2 h-10 border rounded-lg text-sm ${
                                      activityTimeErrors[taskType.id]?.[idx]?.end ? 'border-red-500' : 'border-gray-300'
                                    }`}
                                  />
                                </div>
                                {(activityTimes[taskType.id]?.length ?? 1) > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const intervals = (activityTimes[taskType.id] || [{ start: "", end: "" }]).filter((_, i) => i !== idx);
                                      const updatedTimes = intervals.length > 0
                                        ? { ...activityTimes, [taskType.id]: intervals }
                                        : (() => { const { [taskType.id]: _, ...rest } = activityTimes; return rest; })();
                                      setActivityTimes(updatedTimes);
                                      const errors = validateActivityTimesWithData(updatedTimes);
                                      setActivityTimeErrors(errors);
                                    }}
                                    className="px-3 py-2 text-red-600 hover:text-red-800 font-medium"
                                    title="Rimuovi intervallo"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              {activityTimeErrors[taskType.id]?.[idx] && (
                                <p className="text-xs text-red-600">{activityTimeErrors[taskType.id][idx].message}</p>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const intervals = [...(activityTimes[taskType.id] || [{ start: "", end: "" }]), { start: "", end: "" }];
                              const updatedTimes = { ...activityTimes, [taskType.id]: intervals };
                              setActivityTimes(updatedTimes);
                            }}
                            className="text-sm px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            + Aggiungi intervallo
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowActivitiesModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveActivities}
                  disabled={Object.values(activityTimeErrors).some(intervalErrs => Object.keys(intervalErrs || {}).length > 0)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    Object.values(activityTimeErrors).some(intervalErrs => Object.keys(intervalErrs || {}).length > 0)
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100'
                  }`}
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assign Users Modal */}
        {showAssignUsersModal && assignUsersTarget && (
          <div 
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveAssignedUsers();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowAssignUsersModal(false);
                setCrossLocationConfirm(null);
                setUnavailabilityConfirm(null);
                setOverlapInfoMessage(null);
                setUserDisableReasons({});
                setUserUnavailabilityMessages({});
                setUserUnavailabilityIds({});
                setSelectedCompanyFilter("");
              }
            }}
            tabIndex={-1}
          >
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">Imposta personale in turno</h2>
              <p className="text-gray-600 mb-3">Seleziona fino al numero previsto per ogni mansione.</p>
              {/* Duty tabs */}
              <div className="mb-3 flex flex-wrap gap-2">
                {dutyTabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveDutyId(t.id)}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${activeDutyId===t.id?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {t.name} ({(dutyToSelectedUserIds[t.id]?.size||0)}/{t.quantity})
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center gap-2">
                <label className="text-sm text-gray-700">Azienda:</label>
                <select
                  value={selectedCompanyFilter}
                  onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                >
                  <option value="">Tutte</option>
                  {companiesForFilter.map(c => (
                    <option key={c.id} value={c.id}>{c.ragioneSociale}</option>
                  ))}
                </select>
              </div>
              <div className="border rounded-md divide-y">
                {allUsers.map((u) => {
                  // Semplice filtro per area se definita sul turno
                  let hidden = false;
                  try {
                    if (assignUsersTarget.area && u.areas) {
                      const arr = JSON.parse(u.areas || '[]');
                      if (Array.isArray(arr) && !arr.includes(assignUsersTarget.area)) hidden = true;
                    }
                  } catch {}
                  if (!hidden && selectedCompanyFilter) {
                    if ((u.company?.id || u.companyId || '') !== selectedCompanyFilter) hidden = true;
                  }
                  if (hidden) return null;
                  const currentSet = dutyToSelectedUserIds[activeDutyId] || new Set();
                  const checked = currentSet.has(u.id);
                  const max = getMaxForActiveDuty();
                  // se l'utente è già assegnato in un'altra mansione, disabilita nelle altre tab
                  const selectedInOtherDuty = Object.entries(dutyToSelectedUserIds).some(([dutyId, set]) => dutyId !== activeDutyId && (set as Set<string>)?.has(u.id));
                  // blocco per sovrapposizione con altri turni della giornata
                  let overlapsOtherShift = false;
                  try {
                    const tgtStart = assignUsersTarget.startTime;
                    const tgtEnd = assignUsersTarget.endTime;
                    const t2m = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
                    const sM = t2m(tgtStart);
                    let eM = t2m(tgtEnd); if (eM <= sM) eM += 1440;
                    (workday?.assignments||[]).forEach(a => {
                      if (overlapsOtherShift || a.id === assignUsersTarget.id) return;
                      let assigned: string[] = [];
                      try {
                        if (a.assignedUsers) {
                          const arr = typeof a.assignedUsers === 'string' ? JSON.parse(a.assignedUsers) : a.assignedUsers;
                          if (Array.isArray(arr)) {
                            // arr può essere [id] o [{userId,...}]
                            for (const it of arr) {
                              if (typeof it === 'string') assigned.push(it); else if (it && typeof it==='object' && it.userId) assigned.push(it.userId);
                            }
                          }
                        }
                      } catch {}
                      if (!assigned.includes(u.id)) return;
                      const as = t2m(a.startTime); let ae = t2m(a.endTime); if (ae <= as) ae += 1440;
                      // overlap se intervalli si intersecano
                      if (Math.max(sM, as) < Math.min(eM, ae)) overlapsOtherShift = true;
                    });
                  } catch {}
                  const disabled = (!checked && max > 0 && currentSet.size >= max) || (!checked && selectedInOtherDuty);
                  const disabledByOverlap = (!checked && overlapsOtherShift);
                  const externalReason = userDisableReasons[u.id];
                  const unavMsg = userUnavailabilityMessages[u.id];
                  return (
                    <label key={u.id} className={`flex items-center justify-between px-3 py-2 ${disabled ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-3 relative group">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUserSelection(u.id)}
                          disabled={disabled || disabledByOverlap || Boolean(externalReason)}
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                        />
                        <span className={`text-sm ${unavMsg ? 'text-gray-500' : 'text-gray-800'}`}>
                          {u.code} — {formatUserName(u, allUsers)}
                        </span>
                        {disabledByOverlap && (
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:flex items-center px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50">
                            Utente già assegnato in un turno sovrapposto
                          </div>
                        )}
                        {externalReason && (
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:flex items-center px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50">
                            {externalReason}
                          </div>
                        )}
                        {unavMsg && (
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:flex items-center px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50">
                            Il dipendente ha comunicato indisponibilità ({unavMsg})
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-4">
                <div>
                  {Object.values(dutyToSelectedUserIds).reduce((acc, s) => acc + (s?.size || 0), 0) > 0 && (
                  <button
                    onClick={() => {
                      // Solo reset locale; il salvataggio avverrà con "Salva"
                      setDutyToSelectedUserIds({});
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                  >
                    Rimuovi personale
                  </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setShowAssignUsersModal(false); setSelectedCompanyFilter(""); setCrossLocationConfirm(null); setUnavailabilityConfirm(null); setOverlapInfoMessage(null); setUserDisableReasons({}); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer">Annulla</button>
                  <button onClick={handleSaveAssignedUsers} className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer">Salva</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shift Modal */}
        {showShiftModal && shiftModalAreaId && (
          <div 
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveShifts();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowShiftModal(false);
                setShiftModalAreaId(null);
              }
            }}
            tabIndex={-1}
          >
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">Imposta Turni</h2>
              <p className="text-gray-600 mb-6">
                Seleziona i turni da definire per {enabledAreas.find(a => a.id === shiftModalAreaId)?.name || "questa area"}
              </p>

              <div className="space-y-3 mb-6">
                {shiftTypes.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nessun turno disponibile per questa area. Configura i turni nella pagina Impostazioni.
                  </p>
                ) : (
                  shiftTypes.map((shiftType) => (
                    <div
                      key={shiftType.id}
                      className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center">
                        <div className="relative group">
                          <input
                           type="checkbox"
                           checked={selectedShiftTypes.includes(shiftType.id)}
                           onChange={(e) => {
                             if (disabledShiftTypes[shiftType.id]) return; // blocca se disabilitato
                             if (e.target.checked) {
                               setSelectedShiftTypes([...selectedShiftTypes, shiftType.id]);
                               setShiftTimes(prev => ({
                                 ...prev,
                                 [shiftType.id]: [{ start: "", end: "" }]
                               }));
                               setShiftClients(prev => ({
                                 ...prev,
                                 [shiftType.id]: [""]
                               }));
                             } else {
                               setSelectedShiftTypes(selectedShiftTypes.filter(id => id !== shiftType.id));
                               setShiftTimes(prev => {
                                 const { [shiftType.id]: _, ...rest } = prev;
                                 return rest;
                               });
                              setShiftClients(prev => {
                                const { [shiftType.id]: _, ...rest } = prev;
                                return rest;
                              });
                              setShiftBreaks(prev => {
                                const { [shiftType.id]: _, ...rest } = prev;
                                return rest;
                              });
                              // Clear error message when unchecking
                               setShiftTimeErrors(prev => {
                                 const { [shiftType.id]: _, ...rest } = prev;
                                 return rest;
                               });
                             }
                           }}
                           disabled={Boolean(disabledShiftTypes[shiftType.id])}
                           className={`w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500 ${disabledShiftTypes[shiftType.id] ? 'opacity-60 cursor-not-allowed' : ''}`}
                          />
                          {disabledShiftTypes[shiftType.id] && (
                            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex items-center px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50 whitespace-nowrap">
                              Ci sono lavoratori assegnati a questo turno
                            </div>
                          )}
                        </div>
                        <div className="ml-3 flex-1 flex items-center gap-2">
                          {shiftType.color && (
                            <div
                              className="w-4 h-4 rounded border border-gray-300"
                              style={{ backgroundColor: shiftType.color }}
                            />
                          )}
                          <div>
                            <p className="text-sm font-medium text-gray-900">{shiftType.name}</p>
                            {shiftType.description && (
                              <p className="text-sm text-gray-500">{shiftType.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      {selectedShiftTypes.includes(shiftType.id) && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-700">Intervalli orari</span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentIntervals = shiftTimes[shiftType.id] || [{ start: "", end: "" }];
                                const currentClients = shiftClients[shiftType.id] || [];
                                const currentBreaks = shiftBreaks[shiftType.id] || [];
                                setShiftTimes({
                                  ...shiftTimes,
                                  [shiftType.id]: [...currentIntervals, { start: "", end: "" }]
                                });
                                setShiftClients({
                                  ...shiftClients,
                                  [shiftType.id]: [...currentClients, ""]
                                });
                                setShiftBreaks({
                                  ...shiftBreaks,
                                  [shiftType.id]: [...currentBreaks, { hasScheduledBreak: false, scheduledBreakStartTime: "", scheduledBreakEndTime: "" }]
                                });
                                // Re-validate
                                setTimeout(() => {
                                  const errors = validateShiftTimes();
                                  setShiftTimeErrors(errors);
                                }, 0);
                              }}
                              className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                            >
                              + Aggiungi intervallo
                            </button>
                          </div>
                          
                          {(shiftTimes[shiftType.id] || [{ start: "", end: "" }]).map((interval, intervalIdx) => (
                            <div key={intervalIdx} className={`mb-3 space-y-2 ${intervalIdx > 0 ? 'pt-3 border-t border-gray-200' : ''}`}>
                              <div className="flex gap-2 items-end">
                                {/* Pulsanti su/giù - solo se ci sono più intervalli */}
                                {(shiftTimes[shiftType.id] || []).length > 1 && (
                                  <div className="flex flex-col gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentIntervals = [...(shiftTimes[shiftType.id] || [])];
                                        if (intervalIdx === 0) return;
                                        [currentIntervals[intervalIdx], currentIntervals[intervalIdx - 1]] = 
                                          [currentIntervals[intervalIdx - 1], currentIntervals[intervalIdx]];
                                        setShiftTimes({
                                          ...shiftTimes,
                                          [shiftType.id]: currentIntervals
                                        });
                                        // Re-validate
                                        setTimeout(() => {
                                          const errors = validateShiftTimes(ignoreOverlaps);
                                          setShiftTimeErrors(errors);
                                        }, 0);
                                      }}
                                      disabled={intervalIdx === 0}
                                      className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 transition-colors"
                                      title="Sposta su"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentIntervals = [...(shiftTimes[shiftType.id] || [])];
                                        if (intervalIdx === currentIntervals.length - 1) return;
                                        [currentIntervals[intervalIdx], currentIntervals[intervalIdx + 1]] = 
                                          [currentIntervals[intervalIdx + 1], currentIntervals[intervalIdx]];
                                        setShiftTimes({
                                          ...shiftTimes,
                                          [shiftType.id]: currentIntervals
                                        });
                                        // Re-validate
                                        setTimeout(() => {
                                          const errors = validateShiftTimes(ignoreOverlaps);
                                          setShiftTimeErrors(errors);
                                        }, 0);
                                      }}
                                      disabled={intervalIdx === (shiftTimes[shiftType.id] || []).length - 1}
                                      className="px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 transition-colors"
                                      title="Sposta giù"
                                    >
                                      ↓
                                    </button>
                                  </div>
                                )}
                                <div className="flex-1">
                                  <label className="block text-xs text-gray-500 mb-1">Ora Inizio</label>
                                  <input
                                    type="time"
                                    value={interval.start}
                                    onChange={(e) => {
                                      const currentIntervals = [...(shiftTimes[shiftType.id] || [])];
                                      currentIntervals[intervalIdx].start = e.target.value;
                                      setShiftTimes({
                                        ...shiftTimes,
                                        [shiftType.id]: currentIntervals
                                      });
                                      // Validazione immediata del solo start
                                      validateSingleTimeEdge(shiftType.id, intervalIdx, 'start', e.target.value);
                                      // Esegui la validazione completa solo se entrambi i campi sono compilati
                                      const hasBoth = Boolean(currentIntervals[intervalIdx].start && currentIntervals[intervalIdx].end);
                                      if (hasBoth) {
                                        setTimeout(() => {
                                          const errors = validateShiftTimes(ignoreOverlaps);
                                          setShiftTimeErrors(errors);
                                        }, 0);
                                      }
                                    }}
                                    onBlur={(e) => {
                                      if (e.target.value && !e.target.value.includes(":")) {
                                        const normalized = `${e.target.value}:00`;
                                        const currentIntervals = [...(shiftTimes[shiftType.id] || [])];
                                        currentIntervals[intervalIdx].start = normalized;
                                        setShiftTimes({
                                          ...shiftTimes,
                                          [shiftType.id]: currentIntervals
                                        });
                                        validateSingleTimeEdge(shiftType.id, intervalIdx, 'start', normalized);
                                        const hasBoth = Boolean(currentIntervals[intervalIdx].start && currentIntervals[intervalIdx].end);
                                        if (hasBoth) {
                                          // Re-validate
                                          setTimeout(() => {
                                            const errors = validateShiftTimes(ignoreOverlaps);
                                            setShiftTimeErrors(errors);
                                          }, 0);
                                        }
                                      }
                                    }}
                                    className={`w-full px-3 py-2 h-10 border rounded-lg text-sm ${
                                      (shiftTimeErrors[shiftType.id]?.[intervalIdx]?.start && 
                                       (!ignoreOverlaps || !shiftTimeErrors[shiftType.id]?.[intervalIdx]?.message?.includes("sovrapposto"))) 
                                        ? 'border-red-500' 
                                        : 'border-gray-300'
                                    }`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs text-gray-500 mb-1">Ora Fine</label>
                                  <input
                                    type="time"
                                    value={interval.end}
                                    onChange={(e) => {
                                      const currentIntervals = [...(shiftTimes[shiftType.id] || [])];
                                      currentIntervals[intervalIdx].end = e.target.value;
                                      setShiftTimes({
                                        ...shiftTimes,
                                        [shiftType.id]: currentIntervals
                                      });
                                      // Validazione immediata del solo end
                                      validateSingleTimeEdge(shiftType.id, intervalIdx, 'end', e.target.value);
                                      const hasBoth = Boolean(currentIntervals[intervalIdx].start && currentIntervals[intervalIdx].end);
                                      if (hasBoth) {
                                        setTimeout(() => {
                                          const errors = validateShiftTimes(ignoreOverlaps);
                                          setShiftTimeErrors(errors);
                                        }, 0);
                                      }
                                    }}
                                    onBlur={(e) => {
                                      if (e.target.value && !e.target.value.includes(":")) {
                                        const normalized = `${e.target.value}:00`;
                                        const currentIntervals = [...(shiftTimes[shiftType.id] || [])];
                                        currentIntervals[intervalIdx].end = normalized;
                                        setShiftTimes({
                                          ...shiftTimes,
                                          [shiftType.id]: currentIntervals
                                        });
                                        validateSingleTimeEdge(shiftType.id, intervalIdx, 'end', normalized);
                                        const hasBoth = Boolean(currentIntervals[intervalIdx].start && currentIntervals[intervalIdx].end);
                                        if (hasBoth) {
                                          // Re-validate
                                          setTimeout(() => {
                                            const errors = validateShiftTimes(ignoreOverlaps);
                                            setShiftTimeErrors(errors);
                                          }, 0);
                                        }
                                      }
                                    }}
                                    className={`w-full px-3 py-2 h-10 border rounded-lg text-sm ${
                                      (shiftTimeErrors[shiftType.id]?.[intervalIdx]?.end && 
                                       (!ignoreOverlaps || !shiftTimeErrors[shiftType.id]?.[intervalIdx]?.message?.includes("sovrapposto"))) 
                                        ? 'border-red-500' 
                                        : 'border-gray-300'
                                    }`}
                                  />
                                </div>
                                {/* Selettore cliente - desktop: sulla stessa riga degli orari */}
                                {eventClients.length > 0 && (
                                  <div className="flex-1 hidden lg:block">
                                    <label className="block text-xs text-gray-500 mb-1">Cliente</label>
                                    <select
                                      value={(shiftClients[shiftType.id] || [])[intervalIdx] || ""}
                                      onChange={(e) => {
                                        const currentClients = [...(shiftClients[shiftType.id] || [])];
                                        while (currentClients.length <= intervalIdx) {
                                          currentClients.push("");
                                        }
                                        currentClients[intervalIdx] = e.target.value;
                                        setShiftClients({
                                          ...shiftClients,
                                          [shiftType.id]: currentClients
                                        });
                                      }}
                                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
                                    >
                                      <option value="">Seleziona cliente...</option>
                                      {eventClients.map(client => (
                                        <option key={client.id} value={client.id}>
                                          {client.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {/* Checkbox Pausa prevista - mobile: al posto di Cliente sulla riga degli orari */}
                                {eventClients.length > 0 && (
                                  <div className="flex-1 lg:hidden flex items-center">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={(shiftBreaks[shiftType.id] || [])[intervalIdx]?.hasScheduledBreak || false}
                                        onChange={(e) => {
                                          const currentBreaks = [...(shiftBreaks[shiftType.id] || [])];
                                          while (currentBreaks.length <= intervalIdx) {
                                            currentBreaks.push({ hasScheduledBreak: false, scheduledBreakStartTime: "", scheduledBreakEndTime: "" });
                                          }
                                          currentBreaks[intervalIdx] = {
                                            hasScheduledBreak: e.target.checked,
                                            scheduledBreakStartTime: e.target.checked ? currentBreaks[intervalIdx]?.scheduledBreakStartTime || "" : "",
                                            scheduledBreakEndTime: e.target.checked ? currentBreaks[intervalIdx]?.scheduledBreakEndTime || "" : "",
                                          };
                                          setShiftBreaks({
                                            ...shiftBreaks,
                                            [shiftType.id]: currentBreaks
                                          });
                                        }}
                                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                                      />
                                      <span className="text-xs text-gray-500">Pausa prevista</span>
                                    </label>
                                  </div>
                                )}
                                {/* Pulsante rimuovi intervallo - mostrato solo se ci sono più intervalli */}
                                {(shiftTimes[shiftType.id] || []).length > 1 && (
                                  <div className="relative group">
                                    <button
                                     type="button"
                                     onClick={() => {
                                       const key = `${shiftType.id}|${interval.start}-${interval.end}`;
                                       if (disabledIntervalKeys[key]) return; // blocca rimozione dell'intervallo con personale
                                       const currentIntervals = [...(shiftTimes[shiftType.id] || [])];
                                       const currentClients = [...(shiftClients[shiftType.id] || [])];
                                       const currentBreaks = [...(shiftBreaks[shiftType.id] || [])];
                                       currentIntervals.splice(intervalIdx, 1);
                                       currentClients.splice(intervalIdx, 1);
                                       currentBreaks.splice(intervalIdx, 1);
                                       setShiftTimes({
                                         ...shiftTimes,
                                         [shiftType.id]: currentIntervals.length > 0 ? currentIntervals : [{ start: "", end: "" }]
                                       });
                                       setShiftClients({
                                         ...shiftClients,
                                         [shiftType.id]: currentClients.length > 0 ? currentClients : [""]
                                       });
                                       setShiftBreaks({
                                         ...shiftBreaks,
                                         [shiftType.id]: currentBreaks.length > 0 ? currentBreaks : [{ hasScheduledBreak: false, scheduledBreakStartTime: "", scheduledBreakEndTime: "" }]
                                       });
                                       // Remove errors for this interval
                                       const errors = { ...shiftTimeErrors };
                                       if (errors[shiftType.id]) {
                                         const intervalErrors = { ...errors[shiftType.id] };
                                         delete intervalErrors[intervalIdx];
                                         // Shift indices down
                                         const newIntervalErrors: Record<number, { start?: string; end?: string; message?: string }> = {};
                                         Object.keys(intervalErrors).forEach(key => {
                                           const oldIdx = parseInt(key);
                                           if (oldIdx > intervalIdx) {
                                             newIntervalErrors[oldIdx - 1] = intervalErrors[oldIdx];
                                           } else {
                                             newIntervalErrors[oldIdx] = intervalErrors[oldIdx];
                                           }
                                         });
                                        if (Object.keys(newIntervalErrors).length > 0) {
                                          errors[shiftType.id] = newIntervalErrors;
                                        } else {
                                          delete errors[shiftType.id];
                                        }
                                       }
                                       setShiftTimeErrors(errors);
                                       // Re-validate
                                       setTimeout(() => {
                                         const newErrors = validateShiftTimes(ignoreOverlaps);
                                         setShiftTimeErrors(newErrors);
                                       }, 0);
                                     }}
                                     disabled={Boolean(disabledIntervalKeys[`${shiftType.id}|${interval.start}-${interval.end}`])}
                                     className={`px-3 py-2 font-medium transition-colors ${disabledIntervalKeys[`${shiftType.id}|${interval.start}-${interval.end}`] ? 'text-red-300 cursor-not-allowed' : 'text-red-600 hover:text-red-800'}`}
                                     title={disabledIntervalKeys[`${shiftType.id}|${interval.start}-${interval.end}`] ? 'Impossibile rimuovere: presenti lavoratori su questo intervallo' : 'Rimuovi intervallo'}
                                   >
                                     ×
                                   </button>
                                    {disabledIntervalKeys[`${shiftType.id}|${interval.start}-${interval.end}`] && (
                                      <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex items-center px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50 whitespace-nowrap">
                                       Ci sono lavoratori assegnati a questo turno
                                     </div>
                                   )}
                                 </div>
                               )}
                              </div>
                              {/* Cliente - mobile: sotto gli orari */}
                              {eventClients.length > 0 && (
                                <div className="w-full lg:hidden">
                                  <label className="block text-xs text-gray-500 mb-1">Cliente</label>
                                  <select
                                    value={(shiftClients[shiftType.id] || [])[intervalIdx] || ""}
                                    onChange={(e) => {
                                      const currentClients = [...(shiftClients[shiftType.id] || [])];
                                      while (currentClients.length <= intervalIdx) {
                                        currentClients.push("");
                                      }
                                      currentClients[intervalIdx] = e.target.value;
                                      setShiftClients({
                                        ...shiftClients,
                                        [shiftType.id]: currentClients
                                      });
                                    }}
                                    className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
                                  >
                                    <option value="">Seleziona cliente...</option>
                                    {eventClients.map(client => (
                                      <option key={client.id} value={client.id}>
                                        {client.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {/* Seconda riga: campi pausa */}
                              <div className="flex gap-2 items-start">
                                {/* Spazio per pulsanti su/giù per allineamento */}
                                {(shiftTimes[shiftType.id] || []).length > 1 && (
                                  <div className="w-[33px]"></div>
                                )}
                                {/* Inizio pausa - sotto Ora Inizio */}
                                {(shiftBreaks[shiftType.id] || [])[intervalIdx]?.hasScheduledBreak ? (
                                  <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">Inizio pausa</label>
                                    <input
                                      type="time"
                                      value={(shiftBreaks[shiftType.id] || [])[intervalIdx]?.scheduledBreakStartTime || ""}
                                      onChange={(e) => {
                                        const currentBreaks = [...(shiftBreaks[shiftType.id] || [])];
                                        while (currentBreaks.length <= intervalIdx) {
                                          currentBreaks.push({ hasScheduledBreak: false, scheduledBreakStartTime: "", scheduledBreakEndTime: "" });
                                        }
                                        currentBreaks[intervalIdx] = {
                                          ...currentBreaks[intervalIdx],
                                          scheduledBreakStartTime: e.target.value
                                        };
                                        setShiftBreaks({
                                          ...shiftBreaks,
                                          [shiftType.id]: currentBreaks
                                        });
                                      }}
                                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex-1"></div>
                                )}
                                {/* Fine pausa - sotto Ora Fine */}
                                {(shiftBreaks[shiftType.id] || [])[intervalIdx]?.hasScheduledBreak ? (
                                  <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">Fine pausa</label>
                                    <input
                                      type="time"
                                      value={(shiftBreaks[shiftType.id] || [])[intervalIdx]?.scheduledBreakEndTime || ""}
                                      onChange={(e) => {
                                        const currentBreaks = [...(shiftBreaks[shiftType.id] || [])];
                                        while (currentBreaks.length <= intervalIdx) {
                                          currentBreaks.push({ hasScheduledBreak: false, scheduledBreakStartTime: "", scheduledBreakEndTime: "" });
                                        }
                                        currentBreaks[intervalIdx] = {
                                          ...currentBreaks[intervalIdx],
                                          scheduledBreakEndTime: e.target.value
                                        };
                                        setShiftBreaks({
                                          ...shiftBreaks,
                                          [shiftType.id]: currentBreaks
                                        });
                                      }}
                                      className="w-full px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex-1"></div>
                                )}
                                {/* Checkbox Pausa prevista - desktop: sotto Cliente; mobile: nella riga degli orari */}
                                {eventClients.length > 0 && (
                                  <div className="flex-1 hidden lg:block">
                                    <label className="flex items-center space-x-2 cursor-pointer mb-1">
                                      <input
                                        type="checkbox"
                                        checked={(shiftBreaks[shiftType.id] || [])[intervalIdx]?.hasScheduledBreak || false}
                                        onChange={(e) => {
                                          const currentBreaks = [...(shiftBreaks[shiftType.id] || [])];
                                          while (currentBreaks.length <= intervalIdx) {
                                            currentBreaks.push({ hasScheduledBreak: false, scheduledBreakStartTime: "", scheduledBreakEndTime: "" });
                                          }
                                          currentBreaks[intervalIdx] = {
                                            hasScheduledBreak: e.target.checked,
                                            scheduledBreakStartTime: e.target.checked ? currentBreaks[intervalIdx]?.scheduledBreakStartTime || "" : "",
                                            scheduledBreakEndTime: e.target.checked ? currentBreaks[intervalIdx]?.scheduledBreakEndTime || "" : "",
                                          };
                                          setShiftBreaks({
                                            ...shiftBreaks,
                                            [shiftType.id]: currentBreaks
                                          });
                                        }}
                                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                                      />
                                      <span className="text-xs text-gray-500">Pausa prevista</span>
                                    </label>
                                    <div className="h-[42px]"></div>
                                  </div>
                                )}
                                {/* Spazio per pulsante rimuovi per allineamento */}
                                {(shiftTimes[shiftType.id] || []).length > 1 && (
                                  <div className="w-[33px]"></div>
                                )}
                              </div>
                              {/* Errori validazione */}
                              {(shiftTimeErrors[shiftType.id]?.[intervalIdx]?.start || 
                                shiftTimeErrors[shiftType.id]?.[intervalIdx]?.end ||
                                (shiftTimeErrors[shiftType.id]?.[intervalIdx]?.message && 
                                 (!ignoreOverlaps || !shiftTimeErrors[shiftType.id]?.[intervalIdx]?.message?.includes("sovrapposto")))) && (
                                <div className="space-y-1">
                                  {shiftTimeErrors[shiftType.id]?.[intervalIdx]?.start && (
                                    <p className="text-xs text-red-600">{shiftTimeErrors[shiftType.id][intervalIdx].start}</p>
                                  )}
                                  {shiftTimeErrors[shiftType.id]?.[intervalIdx]?.end && (
                                    <p className="text-xs text-red-600">{shiftTimeErrors[shiftType.id][intervalIdx].end}</p>
                                  )}
                                  {shiftTimeErrors[shiftType.id]?.[intervalIdx]?.message && 
                                   (!ignoreOverlaps || !shiftTimeErrors[shiftType.id]?.[intervalIdx]?.message?.includes("sovrapposto")) && (
                                    <p className="text-xs text-red-600">{shiftTimeErrors[shiftType.id][intervalIdx].message}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Opzione per ignorare sovrapposizioni */}
              {(() => {
                // Verifica se ci sono errori di sovrapposizione (senza ignorare)
                const allErrors = validateShiftTimes(false);
                const hasOverlapErrors = Object.values(allErrors).some(intervalErrors => 
                  Object.values(intervalErrors).some(err => err && err.message && err.message.includes("sovrapposto"))
                );
                
                if (!hasOverlapErrors) return null;
                
                return (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ignoreOverlaps}
                        onChange={(e) => {
                          setIgnoreOverlaps(e.target.checked);
                          // Re-validate con il nuovo stato
                          setTimeout(() => {
                            const errors = validateShiftTimes(e.target.checked);
                            setShiftTimeErrors(errors);
                          }, 0);
                        }}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">
                        Ignora errori di sovrapposizione intervalli
                      </span>
                    </label>
                    <p className="text-xs text-gray-600 mt-1 ml-6">
                      Consenti di salvare anche se ci sono intervalli sovrapposti
                    </p>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowShiftModal(false);
                    setShiftModalAreaId(null);
                    setIgnoreOverlaps(false);
                    setSelectedShiftTypes([]);
                    setShiftTimes({});
                    setShiftTimeErrors({});
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveShifts}
                  disabled={(() => {
                    // Disabilita solo se ci sono errori non ignorati
                    const errors = validateShiftTimes(ignoreOverlaps);
                    const hasErrors = Object.values(errors).some(intervalErrors => 
                      Object.values(intervalErrors).some(err => 
                        err.start || err.end || (err.message && (!ignoreOverlaps || !err.message.includes("sovrapposto")))
                      )
                    );
                    return hasErrors;
                  })()}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    (() => {
                      const errors = validateShiftTimes(ignoreOverlaps);
                      const hasErrors = Object.values(errors).some(intervalErrors => 
                        Object.values(intervalErrors).some(err => 
                          err.start || err.end || (err.message && (!ignoreOverlaps || !err.message.includes("sovrapposto")))
                        )
                      );
                      return hasErrors;
                    })()
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100'
                  }`}
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Personnel Modal */}
      {showPersonnelModal && selectedAssignment && (
        <div 
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowPersonnelModal(false);
              setSelectedAssignment(null);
            }
          }}
          tabIndex={-1}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Aggiungi Personale</h2>
            <p className="text-gray-600 mb-6">
              Definisci il numero di persone necessarie per {selectedAssignment.taskType?.name}{' '}({selectedAssignment.startTime} - {selectedAssignment.endTime})
            </p>

            <div className="space-y-3 mb-6">
              {duties.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Nessuna mansione disponibile per {selectedAssignment.area}. Configura le mansioni nella pagina Impostazioni.
                </p>
              ) : (
                duties.map((duty) => (
                  <div
                    key={duty.id}
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{duty.name}</p>
                        <p className="text-xs text-gray-500">{duty.code}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700">Quantità:</label>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={
                            personnelQuantities[duty.id] === undefined
                              ? ""
                              : String(personnelQuantities[duty.id])
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            setPersonnelQuantities(prev => {
                              const next = { ...prev } as Record<string, number | undefined>;
                              if (raw === "") {
                                // permetti input vuoto mentre si digita
                                next[duty.id] = undefined;
                              } else {
                                const parsed = parseInt(raw, 10);
                                if (!Number.isNaN(parsed) && parsed >= 0) {
                                  next[duty.id] = parsed;
                                }
                              }
                              return next as Record<string, number>;
                            });
                          }}
                          onBlur={(e) => {
                            // se lasciato vuoto, normalizza a 0
                            if (e.target.value === "") {
                              setPersonnelQuantities(prev => ({ ...prev, [duty.id]: 0 }));
                            }
                          }}
                          className="w-20 px-3 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

      {/* Avviso sovrapposizione utente - stile app */}
      {showAssignUsersModal && overlapInfoMessage && (
        <ConfirmDialog
          isOpen={true}
          title="Avviso"
          message={overlapInfoMessage}
          onCancel={() => setOverlapInfoMessage(null)}
          onConfirm={() => setOverlapInfoMessage(null)}
        />
      )}

            {(() => {
              let hasExisting = false;
              try {
                if (selectedAssignment?.personnelRequests) {
                  const req = JSON.parse(selectedAssignment.personnelRequests);
                  hasExisting = Array.isArray(req) && req.length > 0;
                }
              } catch {}
              if (!hasExisting) {
                hasExisting = Object.values(personnelQuantities).some(q => (q || 0) > 0);
              }
              return (
                <div className="flex items-center justify-between">
                  <div>
                    {hasExisting && (
                      <button
                        onClick={() => {
                          setIsClearing(true);
                          setPersonnelQuantities(prev => {
                            const next: Record<string, number> = {};
                            duties.forEach(d => { next[d.id] = 0; });
                            return next;
                          });
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 hover:shadow-md transition-all duration-200"
                      >
                        Svuota
                      </button>
                    )}
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowPersonnelModal(false);
                        setSelectedAssignment(null);
                        setPersonnelQuantities({});
                        setIsClearing(false);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={handleSavePersonnel}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                    >
                      Salva
                    </button>
                  </div>
                </div>
              );
            })()}
            
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div 
          className="fixed z-[2147483647] bg-gray-900 text-white text-xs rounded py-2 px-3 shadow-lg whitespace-nowrap pointer-events-none"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 8}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </DashboardShell>
    
    {/* Conferma utente già in turno in altra location nello stesso giorno */}
    {crossLocationConfirm && (
      <ConfirmDialog
        key={`cross-loc-${crossLocationConfirm.userId}`}
        isOpen={true}
        title="Conferma"
        message={`L'utente è già in turno presso ${crossLocationConfirm.locationName} dalle ${crossLocationConfirm.start} alle ${crossLocationConfirm.end}. Sei sicuro di voler procedere?`}
        onCancel={() => {
          const uid = crossLocationConfirm.userId;
          setDutyToSelectedUserIds(prev => {
            const clone: Record<string, Set<string>> = {} as any;
            Object.entries(prev).forEach(([k,v]) => clone[k] = new Set(v as Set<string>));
            Object.values(clone).forEach(set => set.delete(uid));
            return clone;
          });
          setCrossLocationConfirm(null);
        }}
        onConfirm={() => {
          setCrossLocationConfirm(null);
          if (userUnavailabilityIds[crossLocationConfirm.userId]?.length) {
            const u = allUsers.find((x: any) => x.id === crossLocationConfirm.userId);
            const name = u ? (u.name && u.cognome ? `${u.name} ${u.cognome}` : u.name || u.code || "Utente") : "Utente";
            const msg = userUnavailabilityMessages[crossLocationConfirm.userId] || "indisponibilità comunicata";
            setUnavailabilityConfirm({ userId: crossLocationConfirm.userId, userName: name, message: msg });
          }
        }}
      />
    )}

    {/* Conferma assegnazione dipendente con indisponibilità comunicata */}
    {unavailabilityConfirm && (
      <ConfirmDialog
        key={`unav-${unavailabilityConfirm.userId}`}
        isOpen={true}
        title="Conferma assegnazione"
        message={`${unavailabilityConfirm.userName} ha comunicato indisponibilità (${unavailabilityConfirm.message}). Sei sicuro di voler assegnarlo comunque? Confermando, l'indisponibilità verrà eliminata.`}
        onCancel={() => {
          const uid = unavailabilityConfirm.userId;
          setDutyToSelectedUserIds(prev => {
            const clone: Record<string, Set<string>> = {} as any;
            Object.entries(prev).forEach(([k,v]) => clone[k] = new Set(v as Set<string>));
            Object.values(clone).forEach(set => set.delete(uid));
            return clone;
          });
          setUnavailabilityConfirm(null);
        }}
        onConfirm={() => setUnavailabilityConfirm(null)}
      />
    )}
    
    {/* Copy Personnel Modal */}
    {showCopyModal && copyTargets.length > 0 && (
      <div 
        className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
        tabIndex={-1}
      >
        <div className="bg-white rounded-lg p-6 w-full max-w-lg">
          <h3 className="text-xl font-semibold mb-3">Copia personale</h3>
          <p className="text-gray-700 mb-6">
            Vuoi copiare anche nell'altro turno di {copyTargets[0].taskType?.name} ({copyTargets[0].startTime} - {copyTargets[0].endTime})?
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={async () => {
                // Salta questo target
                const [, ...rest] = copyTargets;
                if (rest.length === 0) {
                  setShowCopyModal(false);
                  setCopyTargets([]);
                  setCopyPayload(null);
                  await fetchWorkday();
                } else {
                  setCopyTargets(rest);
                }
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md transition-all duration-200 cursor-pointer"
            >
              No
            </button>
            <button
              onClick={async () => {
                try {
                  const target = copyTargets[0];
                  await fetch(`/api/assignments/${target.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ personnelRequests: copyPayload }),
                  });
                } catch (e) {
                  console.error('Errore copia personale su target', copyTargets[0]?.id, e);
                } finally {
                  const [, ...rest] = copyTargets;
                  if (rest.length === 0) {
                    setShowCopyModal(false);
                    setCopyTargets([]);
                    setCopyPayload(null);
                    await fetchWorkday();
                  } else {
                    setCopyTargets(rest);
                  }
                }
              }}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              Sì, copia
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Clear Personnel Modal */}
    {showClearModal && clearTargets.length > 0 && (
      <div 
        className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
        tabIndex={-1}
      >
        <div className="bg-white rounded-lg p-6 w-full max-w-lg">
          <h3 className="text-xl font-semibold mb-3">Svuota personale</h3>
          <p className="text-gray-700 mb-6">
            Vuoi svuotare anche l'altro turno di {clearTargets[0].taskType?.name} ({clearTargets[0].startTime} - {clearTargets[0].endTime})?
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={async () => {
                // Salta questo target
                const [, ...rest] = clearTargets;
                if (rest.length === 0) {
                  setShowClearModal(false);
                  setClearTargets([]);
                  await fetchWorkday();
                } else {
                  setClearTargets(rest);
                }
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md transition-all duration-200 cursor-pointer"
            >
              No
            </button>
            <button
              onClick={async () => {
                try {
                  const target = clearTargets[0];
                  await fetch(`/api/assignments/${target.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ personnelRequests: null }),
                  });
                } catch (e) {
                  console.error('Errore svuotando personale su target', clearTargets[0]?.id, e);
                } finally {
                  const [, ...rest] = clearTargets;
                  if (rest.length === 0) {
                    setShowClearModal(false);
                    setClearTargets([]);
                    await fetchWorkday();
                  } else {
                    setClearTargets(rest);
                  }
                }
              }}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              Sì, svuota
            </button>
          </div>
        </div>
      </div>
    )}
    {areaDisableConfirm && (
      <ConfirmDialog
        isOpen={true}
        title="Disattiva area"
        message="Sono presenti turni per quest'area di lavoro. Disattivandola verranno eliminati. Sei sicuro di procedere?"
        onCancel={() => setAreaDisableConfirm(null)}
        onConfirm={async () => {
          try {
            // Optimistic: remove assignments for this area from UI immediately
            setWorkday((prev) => {
              if (!prev) return prev;
              const area = enabledAreas.find((a) => a.id === areaDisableConfirm.areaId);
              const areaName = area?.name || null;
              const filtered = (prev.assignments || []).filter(
                (a) => !(a.taskType?.type === "SHIFT" && (!!areaName ? a.area === areaName : true))
              );
              return { ...prev, assignments: filtered } as Workday;
            });
            for (const id of areaDisableConfirm.shiftIds) {
              await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
            }
          } catch (e) {
            console.error('Errore eliminando turni area:', e);
          } finally {
            await finalizeAreaToggle(areaDisableConfirm.areaId, false);
            // Ensure latest state after deletions
            await fetchWorkday();
            setAreaDisableConfirm(null);
          }
        }}
      />
    )}
    </>
  );
}

