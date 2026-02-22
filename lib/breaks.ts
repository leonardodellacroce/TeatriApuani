/**
 * Utilità per pause programmate ed effettive.
 * Formato JSON: [{ start: "11:00", end: "11:30" }, ...]
 */

export type BreakInterval = { start: string; end: string };

export function parseScheduledBreaks(json: string | null): BreakInterval[] {
  if (!json || json.trim() === "") return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (b): b is BreakInterval =>
        b && typeof b === "object" && typeof b.start === "string" && typeof b.end === "string"
    );
  } catch {
    return [];
  }
}

export function parseActualBreaks(json: string | null): BreakInterval[] {
  return parseScheduledBreaks(json); // stesso formato
}

export function serializeBreaks(breaks: BreakInterval[]): string | null {
  if (!breaks.length) return null;
  return JSON.stringify(breaks);
}

/** Converte legacy (singola pausa) in array. Usare per retrocompatibilità lettura. */
export function legacyToBreaks(
  hasBreak: boolean,
  start: string | null,
  end: string | null
): BreakInterval[] {
  if (!hasBreak || !start || !end) return [];
  return [{ start, end }];
}

/** Calcola ore totali di pausa da JSON o legacy */
export function calculateBreakHours(
  scheduledBreaksJson: string | null,
  legacyHasBreak?: boolean,
  legacyStart?: string | null,
  legacyEnd?: string | null
): number {
  const breaks = parseScheduledBreaks(scheduledBreaksJson);
  const arr = breaks.length > 0 ? breaks : legacyToBreaks(!!legacyHasBreak, legacyStart ?? null, legacyEnd ?? null);
  let total = 0;
  for (const b of arr) {
    const [sh, sm] = b.start.split(":").map(Number);
    const [eh, em] = b.end.split(":").map(Number);
    let dur = (eh || 0) * 60 + (em || 0) - ((sh || 0) * 60 + (sm || 0));
    if (dur < 0) dur += 24 * 60;
    total += dur;
  }
  return total / 60;
}
