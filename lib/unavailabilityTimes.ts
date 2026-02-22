/**
 * Utility per la conversione orari indisponibilità.
 * A sistema: "fino alle" = -1 min, "dalle" = +1 min, intervallo: inizio +1, fine -1.
 * A schermo: si mostra sempre l'orario inserito dall'utente.
 */

export type UnavailabilityTimeMode = "all_day" | "until" | "from" | "interval";

function parseTimeToMinutes(t: string | null): number {
  if (!t) return 0;
  if (t === "24:00") return 24 * 60;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Aggiunge delta minuti a un orario HH:MM. Gestisce 24:00 come fine giornata. */
export function addMinutesToTime(t: string, delta: number): string {
  if (!t) return t;
  let total = parseTimeToMinutes(t) + delta;
  if (total < 0) total += 24 * 60;
  if (total >= 24 * 60) total -= 24 * 60;
  if (total === 24 * 60) return "24:00";
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

/** Converte i valori salvati in DB nella versione da mostrare all'utente. */
export function storedToDisplayTimeRange(
  start: string | null,
  end: string | null
): { start: string | null; end: string | null } {
  if (!start && !end) return { start: null, end: null };
  // until: end salvato -1 min, display +1
  if (start === "06:00" && end) return { start: "06:00", end: addMinutesToTime(end, 1) };
  // from: start salvato +1 min, display -1
  if (start && end === "24:00") return { start: addMinutesToTime(start, -1), end: "24:00" };
  // interval: start +1, end -1 salvati → display start -1, end +1
  if (start && end) return { start: addMinutesToTime(start, -1), end: addMinutesToTime(end, 1) };
  return { start, end };
}

/** Converte l'input utente nei valori da salvare in DB. */
export function userInputToStoredTimes(
  mode: UnavailabilityTimeMode,
  formStart: string,
  formEnd: string
): { startTime: string | undefined; endTime: string | undefined } {
  if (mode === "all_day") return { startTime: undefined, endTime: undefined };
  if (mode === "until") {
    return { startTime: "06:00", endTime: formEnd ? addMinutesToTime(formEnd, -1) : undefined };
  }
  if (mode === "from") {
    return { startTime: formStart ? addMinutesToTime(formStart, 1) : undefined, endTime: "24:00" };
  }
  // interval
  return {
    startTime: formStart ? addMinutesToTime(formStart, 1) : undefined,
    endTime: formEnd ? addMinutesToTime(formEnd, -1) : undefined,
  };
}
