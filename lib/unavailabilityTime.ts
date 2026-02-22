/**
 * Utilità per la conversione orari indisponibilità.
 * A schermo l'utente vede l'orario inserito; a sistema si salva:
 * - "fino alle": -1 minuto sulla fine (14:00 → 13:59)
 * - "dalle": +1 minuto sull'inizio (16:00 → 16:01)
 * - "intervallo": +1 min inizio, -1 min fine (18:00-20:00 → 18:01-19:59)
 */

/** Aggiunge 1 minuto (es. 14:00 → 14:01, 23:59 → 24:00) */
export function timeAddMinute(t: string | null): string | null {
  if (!t) return null;
  if (t === "24:00") return "24:00";
  const [h, m] = t.split(":").map(Number);
  let total = (h || 0) * 60 + (m || 0);
  total += 1;
  if (total >= 24 * 60) return "24:00";
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

/** Sottrae 1 minuto (es. 14:00 → 13:59, 00:00 → 23:59) */
export function timeSubtractMinute(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  let total = (h || 0) * 60 + (m || 0);
  total -= 1;
  if (total < 0) return "23:59";
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function parseTimeToMinutes(t: string | null): number {
  if (!t) return 0;
  if (t === "24:00") return 24 * 60;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Restituisce [startMin, endMin] per indisponibilità (valori di sistema) */
function getUnavTimeRangeMinutes(start: string | null, end: string | null): [number, number] {
  if (!start && !end) return [0, 24 * 60];
  if (start === "06:00" && end) return [360, parseTimeToMinutes(end)];
  if (start && end === "24:00") return [parseTimeToMinutes(start), 24 * 60];
  if (start && end) return [parseTimeToMinutes(start), parseTimeToMinutes(end)];
  if (start) return [parseTimeToMinutes(start), 24 * 60];
  if (end) return [360, parseTimeToMinutes(end)];
  return [0, 24 * 60];
}

/** Verifica se l'indisponibilità (valori di sistema) si sovrappone al turno */
export function unavailabilityOverlapsShift(
  unavStart: string | null,
  unavEnd: string | null,
  shiftStart: string,
  shiftEnd: string
): boolean {
  const [u1, u2] = getUnavTimeRangeMinutes(unavStart, unavEnd);
  const s1 = parseTimeToMinutes(shiftStart);
  let s2 = parseTimeToMinutes(shiftEnd);
  if (s2 <= s1) s2 += 24 * 60;
  return u1 < s2 && s1 < u2;
}

/** Formatta l'intervallo per visualizzazione (valori user-friendly da valori di sistema) */
export function formatUnavailabilityTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Tutto il giorno";
  if (start === "06:00" && end) return `fino alle ${timeAddMinute(end) ?? end}`;
  if (start && end === "24:00") return `dalle ${timeSubtractMinute(start) ?? start}`;
  if (start && end) return `${timeSubtractMinute(start) ?? start} - ${timeAddMinute(end) ?? end}`;
  if (start) return `dalle ${timeSubtractMinute(start) ?? start}`;
  if (end) return `fino alle ${timeAddMinute(end) ?? end}`;
  return "-";
}
