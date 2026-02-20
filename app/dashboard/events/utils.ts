interface TimeSpan {
  start: string;
  end: string;
}

interface Assignment {
  startTime: string | null;
  endTime: string | null;
  taskType?: {
    type: string;
  } | null;
}

interface WorkdayWithAssignments {
  timeSpans?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  assignments?: Assignment[];
  // Opzionale: mappa stati aree abilitate (JSON string) e mappa ID->Nome per messaggi
  areaEnabledStates?: string | null;
  areaNamesMap?: Record<string, string>;
}

function parseTimeSpans(timeSpans: string): Array<{ start: string; end: string }> {
  try {
    const parsed = JSON.parse(timeSpans);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getIncompleteScheduleInfo(workday: WorkdayWithAssignments): { hasWarning: boolean; message: string } {
  // Se non ci sono timeSpans definiti, non c'è niente da verificare
  if (!workday.timeSpans) {
    return { hasWarning: false, message: "" };
  }

  // Parsa gli orari della giornata
  const timeSpans = parseTimeSpans(workday.timeSpans);
  if (!timeSpans || timeSpans.length === 0) {
    return { hasWarning: false, message: "" };
  }

  // Converti gli orari in minuti dall'inizio del giorno
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Filtra solo le assignments di tipo ACTIVITY
  const activityAssignments = workday.assignments?.filter(assignment => 
    assignment.taskType?.type === "ACTIVITY"
  ) || [];
  
  if (activityAssignments.length === 0) {
    return { 
      hasWarning: true, 
      message: "Non sono state definite attività per questa giornata di lavoro" 
    };
  }

  // Raccogli tutti gli intervalli orari coperti dalle attività
  const coveredIntervals: Array<{ start: number; end: number }> = [];
  activityAssignments.forEach(assignment => {
    if (!assignment.startTime || !assignment.endTime) return;
    
    const start = timeToMinutes(assignment.startTime);
    let end = timeToMinutes(assignment.endTime);
    // Se l'ora di fine è precedente all'ora di inizio, è un turno notturno
    if (end <= start) {
      end += 24 * 60; // Aggiungi 24 ore
    }
    coveredIntervals.push({ start, end });
  });

  // Ordina gli intervalli coperti per ora di inizio
  coveredIntervals.sort((a, b) => a.start - b.start);

  // Per ogni timespan della giornata, verifica se è completamente coperto
  for (const timespan of timeSpans) {
    const spanStart = timeToMinutes(timespan.start);
    let spanEnd = timeToMinutes(timespan.end);
    
    // Se l'orario di fine è precedente all'inizio, è un turno notturno
    if (spanEnd <= spanStart) {
      spanEnd += 24 * 60;
    }

    // Verifica se ci sono gap non coperti
    let currentPos = spanStart;
    for (const interval of coveredIntervals) {
      if (interval.start > currentPos) {
        // C'è un gap tra currentPos e interval.start
        const gapStart = Math.floor(currentPos / 60);
        const gapStartMin = currentPos % 60;
        const gapEnd = Math.floor(interval.start / 60);
        const gapEndMin = interval.start % 60;
        return {
          hasWarning: true,
          message: `Ci sono gap orari non coperti da attività (${String(gapStart).padStart(2, '0')}:${String(gapStartMin).padStart(2, '0')} - ${String(gapEnd).padStart(2, '0')}:${String(gapEndMin).padStart(2, '0')})`
        };
      }
      if (interval.end > currentPos) {
        currentPos = interval.end;
      }
    }
    
    // Verifica se l'ultimo intervallo coperto arriva fino alla fine del timespan
    if (currentPos < spanEnd) {
      const gapStart = Math.floor(currentPos / 60);
      const gapStartMin = currentPos % 60;
      const gapEnd = Math.floor(spanEnd / 60);
      const gapEndMin = spanEnd % 60;
      return {
        hasWarning: true,
        message: `Ci sono gap orari non coperti da attività (${String(gapStart).padStart(2, '0')}:${String(gapStartMin).padStart(2, '0')} - ${String(gapEnd).padStart(2, '0')}:${String(gapEndMin).padStart(2, '0')})`
      };
    }
  }

  return { hasWarning: false, message: "" };
}

function getWorkdaySpans(workday: WorkdayWithAssignments): Array<{ start: string; end: string }> {
  if (workday.timeSpans) {
    const spans = parseTimeSpans(workday.timeSpans);
    if (spans.length > 0) return spans;
  }
  if (workday.startTime && workday.endTime) return [{ start: workday.startTime, end: workday.endTime }];
  return [];
}

// Nuova API: separa i due casi richiesti
export function getWorkdayAlertStates(workday: WorkdayWithAssignments): {
  activityMissing: boolean;
  activityMessage: string;
  activityCoverageGap: boolean;
  activityCoverageMessage: string;
  shiftMissing: boolean;
  shiftMessage: string;
  shiftCoverageGap: boolean;
  shiftCoverageMessage: string;
  // new: all gaps collected, in minutes as formatted strings
  activityGaps?: Array<{ start: string; end: string }>;
  shiftGaps?: Array<{ start: string; end: string }>;
  // new: list of red-level shift error messages (can be multiple)
  shiftMessages?: string[];
} {
  const activityAssignments = workday.assignments?.filter(a => a.taskType?.type === "ACTIVITY") || [];
  const shiftAssignments = workday.assignments?.filter(a => a.taskType?.type === "SHIFT") || [];

  const activityMissing = activityAssignments.length === 0;
  // Se non ci sono attività, per coerenza l'orologio deve essere rosso (non ci sono turni)
  let shiftMissing = shiftAssignments.length === 0;

  // Se esistono attività e timeSpans, verifica copertura completa delle attività sugli orari di lavoro
  let activityCoverageGap = false;
  let activityCoverageMessage = "";
  const activityGaps: Array<{ start: string; end: string }> = [];
  try {
    if (!activityMissing) {
      const timeToMinutes = (timeStr: string): number => {
        const [h, m] = timeStr.split(":").map(Number);
        return h * 60 + m;
      };
      const spans = getWorkdaySpans(workday);
      if (spans.length > 0) {
        // Intervalli coperti dalle attività
        const covered: Array<{ start: number; end: number }> = [];
        activityAssignments.forEach(a => {
          if (!a.startTime || !a.endTime) return;
          const s = timeToMinutes(a.startTime);
          let e = timeToMinutes(a.endTime);
          if (e <= s) e += 1440; // notturno
          covered.push({ start: s, end: e });
        });
        covered.sort((a,b) => a.start - b.start);
        
        for (const span of spans) {
          const ss = timeToMinutes(span.start);
          let ee = timeToMinutes(span.end);
          if (ee <= ss) ee += 1440; // notturno
          let cursor = ss;
          for (const iv of covered) {
            if (iv.start > cursor) {
              const gsH = String(Math.floor(cursor/60)).padStart(2,'0');
              const gsM = String(cursor%60).padStart(2,'0');
              const geH = String(Math.floor(iv.start/60)).padStart(2,'0');
              const geM = String(iv.start%60).padStart(2,'0');
              activityCoverageGap = true;
              activityGaps.push({ start: `${gsH}:${gsM}`, end: `${geH}:${geM}` });
              cursor = iv.end; // advance cursor to continue detecting following gaps
              continue;
            }
            if (iv.end > cursor) cursor = iv.end;
          }
          if (cursor < ee) {
            const gsH = String(Math.floor(cursor/60)).padStart(2,'0');
            const gsM = String(cursor%60).padStart(2,'0');
            const geH = String(Math.floor(ee/60)).padStart(2,'0');
            const geM = String(ee%60).padStart(2,'0');
            activityCoverageGap = true;
            activityGaps.push({ start: `${gsH}:${gsM}`, end: `${geH}:${geM}` });
          }
        }

        if (activityGaps.length > 0) {
          activityCoverageMessage = `Ci sono orari non coperti da attività (${activityGaps.map(g => `${g.start} - ${g.end}`).join(", ")})`;
        }
      }
    }
  } catch {}

  // Copertura turni
  let shiftCoverageGap = false;
  let shiftCoverageMessage = "";
  const shiftGaps: Array<{ start: string; end: string }> = [];
  let shiftMessageCustom = "";
  const shiftMessages: string[] = [];
  try {
    if (shiftAssignments.length > 0) {
      const t2m = (t: string): number => {
        const [h,m] = t.split(":").map(Number);
        return h*60+m;
      };
      const spans = getWorkdaySpans(workday);
      if (spans.length > 0) {
        const covered: Array<{ start:number; end:number }> = [];
        shiftAssignments.forEach(s => {
          if (!s.startTime || !s.endTime) return;
          const sM = t2m(s.startTime);
          let eM = t2m(s.endTime);
          if (eM <= sM) eM += 1440;
          covered.push({ start: sM, end: eM });
        });
        covered.sort((a,b)=> a.start-b.start || a.end-b.end);
        for (const span of spans) {
          const ss = t2m(span.start);
          let ee = t2m(span.end);
          if (ee <= ss) ee += 1440;
          let cursor = ss;
          for (const iv of covered) {
            if (iv.end <= cursor) continue;
            if (iv.start > cursor) {
              const gsH = String(Math.floor(cursor/60)).padStart(2,'0');
              const gsM = String(cursor%60).padStart(2,'0');
              const geH = String(Math.floor(iv.start/60)).padStart(2,'0');
              const geM = String(iv.start%60).padStart(2,'0');
              shiftCoverageGap = true;
              shiftGaps.push({ start: `${gsH}:${gsM}`, end: `${geH}:${geM}` });
              cursor = iv.end;
              continue;
            }
            cursor = Math.max(cursor, iv.end);
            if (cursor >= ee) break;
          }
          if (cursor < ee) {
            const gsH = String(Math.floor(cursor/60)).padStart(2,'0');
            const gsM = String(cursor%60).padStart(2,'0');
            const geH = String(Math.floor(ee/60)).padStart(2,'0');
            const geM = String(ee%60).padStart(2,'0');
            shiftCoverageGap = true;
            shiftGaps.push({ start: `${gsH}:${gsM}`, end: `${geH}:${geM}` });
          }
        }
        if (shiftGaps.length > 0) {
          shiftCoverageMessage = `Ci sono orari non coperti da turni (${shiftGaps.map(g => `${g.start} - ${g.end}`).join(", ")})`;
        }
      }
    }
  } catch {}

  // Aree abilitate senza turni
  try {
    if (workday.areaEnabledStates) {
      const parsed = JSON.parse(workday.areaEnabledStates as string) as Record<string, boolean>;
      const enabledIds = Object.keys(parsed || {}).filter((k) => parsed[k]);
      if (enabledIds.length > 0) {
        const areasWithShifts = new Set<string>((shiftAssignments || []).map((s) => (s as any).area || ""));
        const missingAreas: string[] = [];
        enabledIds.forEach((id) => {
          const name = (workday.areaNamesMap && workday.areaNamesMap[id]) || id;
          if (!areasWithShifts.has(name)) missingAreas.push(name);
        });
        if (missingAreas.length > 0) {
          shiftMissing = true; // forza rosso
          if (missingAreas.length === 1) {
            shiftMessages.push(`${missingAreas[0]} è attivata ma non risultano turni definiti per quest'area!`);
          } else {
            const list = missingAreas.join(", ");
            shiftMessages.push(`${list} sono attivate ma non risultano turni definiti per queste aree!`);
          }
        }
      }
    }
  } catch {}

  // Nessun turno definito in assoluto
  if (shiftAssignments.length === 0) {
    shiftMissing = true;
    shiftMessages.push("Non sono stati definiti turni per questa giornata di lavoro");
  }

  return {
    activityMissing,
    activityMessage: activityMissing ? "Non sono state definite attività per questa giornata di lavoro" : "",
    activityCoverageGap,
    activityCoverageMessage,
    shiftMissing,
    shiftMessage: shiftMissing ? (shiftMessageCustom || shiftMessages[0] || "Non sono stati definiti turni per questa giornata di lavoro") : "",
    shiftCoverageGap,
    shiftCoverageMessage,
    activityGaps: activityGaps.length ? activityGaps : undefined,
    shiftGaps: shiftGaps.length ? shiftGaps : undefined,
    shiftMessages: shiftMessages.length ? shiftMessages : undefined,
  };
}

// Valutazione stato "persona" (assegnazioni personale) a livello di giornata
// - rosso: esistono turni senza tipologia di personale (personnelRequests mancante/vuoto)
// - giallo: esistono turni con tipologia ma con assegnazioni utenti incomplete
// - verde: ogni turno ha personale completo
export function getPersonnelAlertState(workday: any): {
  color: 'red' | 'yellow' | 'green';
  messages: string[];
} {
  const assignments = Array.isArray(workday?.assignments) ? workday.assignments : [];
  const shifts = assignments.filter((a: any) => a?.taskType?.type === 'SHIFT');
  if (shifts.length === 0) {
    // Nessun turno aperto: personale non programmabile
    return { color: 'red', messages: ['Personale non ancora programmabile'] };
  }

  const redMessages: string[] = [];
  const yellowPerShift: string[] = [];

  // helper per formattare orari
  const fmt = (t?: string | null) => (t ? t : '--:--');

  for (const s of shifts) {
    let reqs: Array<{ dutyId: string; quantity: number }> = [];
    try {
      if (s.personnelRequests) {
        const parsed = JSON.parse(s.personnelRequests);
        if (Array.isArray(parsed)) reqs = parsed;
      }
    } catch {}

    if (!reqs || reqs.length === 0) {
      const name = s.taskType?.name || 'Turno';
      redMessages.push(`${name} ${fmt(s.startTime)}-${fmt(s.endTime)}`);
      continue;
    }

    // Calcola assegnati per duty
    const assignedByDuty: Record<string, number> = {};
    if (s.assignedUsersByDuty) {
      try {
        Object.entries(s.assignedUsersByDuty as Record<string, any[]>).forEach(([dutyId, users]) => {
          assignedByDuty[dutyId] = (users as any[]).length || 0;
        });
      } catch {}
    } else if (s.assignedUsers) {
      try {
        const arr = typeof s.assignedUsers === 'string' ? JSON.parse(s.assignedUsers) : s.assignedUsers;
        if (Array.isArray(arr)) {
          for (const it of arr) {
            if (it && typeof it === 'object' && it.dutyId) {
              assignedByDuty[it.dutyId] = (assignedByDuty[it.dutyId] || 0) + 1;
            }
          }
        }
      } catch {}
    }

    const parts: string[] = [];
    for (const r of reqs) {
      const q = Number(r.quantity) || 0;
      const asg = assignedByDuty[r.dutyId] || 0;
      if (asg < q) {
        // Preferisci sempre dutyName arricchito lato server
        const candidates: Array<string | undefined> = [
          (r as any)?.dutyName,
          (r as any)?.name,
          (r as any)?.duty,
          (r as any)?.code,
          (r as any)?.dutyId,
        ];
        let dutyName: string | undefined;
        const map = (workday as any)?.dutyIdToName || {};
        for (const c of candidates) {
          if (!c) continue;
          if (map[c]) { dutyName = map[c]; break; }
          const lc = typeof c === 'string' ? c.toLowerCase() : undefined;
          if (lc && map[lc]) { dutyName = map[lc]; break; }
        }
        if (!dutyName) {
          dutyName = (candidates.find(Boolean) as string) || 'Mansione';
        }
        parts.push(`${dutyName} ${asg}/${q}`);
      }
    }
    if (parts.length > 0) {
      yellowPerShift.push(`${fmt(s.startTime)}-${fmt(s.endTime)} ${parts.join(', ')}`);
    }
  }

  if (redMessages.length > 0) {
    return {
      color: 'red',
      messages: [
        'Ci sono turni impostati senza alcun tipo di personale assegnato',
        ...redMessages
      ],
    };
  }
  if (yellowPerShift.length > 0) {
    // Ordina le righe per orario di inizio (primi 5 caratteri HH:MM)
    yellowPerShift.sort((a,b)=> a.slice(0,5).localeCompare(b.slice(0,5)));
    return {
      color: 'yellow',
      messages: [
        'Ci sono turni non completi',
        ...yellowPerShift
      ],
    };
  }
  return { color: 'green', messages: [] };
}

// Valutazione stato "clienti" a livello di giornata
// - rosso: nessun turno ha clienti valorizzati
// - giallo: alcuni turni non hanno clienti valorizzati
// - verde: tutti i turni hanno clienti valorizzati
export function getClientAlertState(workday: any): {
  color: 'red' | 'yellow' | 'green';
  messages: string[];
} {
  const assignments = Array.isArray(workday?.assignments) ? workday.assignments : [];
  const shifts = assignments.filter((a: any) => a?.taskType?.type === 'SHIFT');
  
  if (shifts.length === 0) {
    // Nessun turno definito
    return { 
      color: 'red', 
      messages: ['Clienti non ancora assegnabili ai turni'] 
    };
  }

  const shiftsWithoutClient = shifts.filter((s: any) => !s.clientId);
  
  if (shiftsWithoutClient.length === shifts.length) {
    // Tutti i turni senza cliente
    return {
      color: 'red',
      messages: ['I turni non hanno clienti impostati']
    };
  }
  
  if (shiftsWithoutClient.length > 0) {
    // Alcuni turni senza cliente - ordina per orario di inizio
    const sortedShifts = shiftsWithoutClient.sort((a: any, b: any) => {
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      return timeA.localeCompare(timeB);
    });
    
    const messages = ['Non è impostato il cliente per i seguenti turni:'];
    sortedShifts.forEach((s: any) => {
      const name = s.taskType?.name || 'Turno';
      const start = s.startTime || '--:--';
      const end = s.endTime || '--:--';
      messages.push(`${name} ${start}-${end}`);
    });
    return {
      color: 'yellow',
      messages
    };
  }
  
  // Tutti i turni hanno cliente
  return { color: 'green', messages: [] };
}
