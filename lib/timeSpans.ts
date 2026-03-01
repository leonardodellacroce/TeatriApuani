/**
 * Utility per merge degli orari della giornata quando si associano ore libere a un evento.
 *
 * Regole:
 * - Nessun orario definito → crea orari dalle ore libere
 * - Ore libere dentro orari esistenti → nessuna modifica
 * - Ore libere iniziano prima → anticipa l'inizio
 * - Ore libere finiscono dopo → estende la fine
 * - Entrambe → estende inizio e fine
 * - Ore libere completamente fuori → aggiunge nuovo intervallo
 */

export type TimeSpan = { start: string; end: string };

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Normalizza end "00:00" come 24:00 quando start > 0 (turno fino a mezzanotte). */
function spanEndMinutes(start: string, end: string): number {
  const sm = timeToMinutes(start);
  let em = timeToMinutes(end);
  if (em === 0 && sm > 0) return 24 * 60;
  if (em <= sm) em += 24 * 60; // overnight
  return em;
}

function minutesToTime(m: number): string {
  const v = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const min = v % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Merge ore libere negli orari della giornata esistenti.
 * @param existingSpans - Intervalli già definiti (timeSpans del workday)
 * @param freeHours - Intervallo delle ore libere da associare
 * @returns Nuovi timeSpans (eventualmente invariati, estesi o con nuovo intervallo)
 */
export function mergeFreeHoursIntoTimeSpans(
  existingSpans: TimeSpan[],
  freeHours: TimeSpan
): TimeSpan[] {
  if (existingSpans.length === 0) {
    return [freeHours];
  }

  const fhStart = timeToMinutes(freeHours.start);
  const fhEnd = spanEndMinutes(freeHours.start, freeHours.end);

  const spans: Array<{ start: number; end: number }> = existingSpans
    .map((s) => ({
      start: timeToMinutes(s.start),
      end: spanEndMinutes(s.start, s.end),
    }))
    .sort((a, b) => a.start - b.start);

  const overlapping: number[] = [];
  for (let i = 0; i < spans.length; i++) {
    if (fhStart < spans[i].end && fhEnd > spans[i].start) {
      overlapping.push(i);
    }
  }

  if (overlapping.length === 0) {
    // Scenario 4: Ore libere completamente fuori → aggiungi nuovo intervallo
    const result: TimeSpan[] = spans.map((s) => ({
      start: minutesToTime(s.start),
      end: s.end >= 1440 ? "00:00" : minutesToTime(s.end),
    }));
    result.push(freeHours);
    result.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    return result;
  }

  const firstIdx = overlapping[0];
  const lastIdx = overlapping[overlapping.length - 1];
  const firstSpan = spans[firstIdx];
  const lastSpan = spans[lastIdx];

  if (fhStart >= firstSpan.start && fhEnd <= lastSpan.end) {
    // Scenario 1: Ore libere dentro orari esistenti → nessuna modifica
    return existingSpans;
  }

  // Scenari 2, 3 o 2+3: estendi inizio e/o fine
  const newFirstStart = Math.min(fhStart, firstSpan.start);
  const newLastEnd = Math.max(fhEnd, lastSpan.end);

  const result: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < firstIdx; i++) result.push(spans[i]);
  result.push({ start: newFirstStart, end: newLastEnd });
  for (let i = lastIdx + 1; i < spans.length; i++) result.push(spans[i]);

  // Merge eventuali intervalli adiacenti/sovrapposti
  const merged: Array<{ start: number; end: number }> = [];
  for (const s of result) {
    if (merged.length === 0) {
      merged.push(s);
    } else {
      const last = merged[merged.length - 1];
      if (s.start <= last.end) {
        last.end = Math.max(last.end, s.end);
      } else {
        merged.push(s);
      }
    }
  }

  return merged.map((s) => ({
    start: minutesToTime(s.start),
    end: s.end >= 1440 ? "00:00" : minutesToTime(s.end),
  }));
}
