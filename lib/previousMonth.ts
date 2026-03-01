/**
 * Utility per verificare il mese precedente (client-safe, no prisma).
 * Usato per le limitazioni ADMIN: può riaprire solo mese/giornate/eventi del mese precedente.
 */

/** Restituisce (anno, mese 1-12) del mese precedente rispetto a oggi */
export function getPreviousMonth(): { year: number; month: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  if (month === 0) {
    return { year: year - 1, month: 12 };
  }
  return { year, month };
}

/** Verifica se (year, month) è il mese precedente rispetto a oggi */
export function isPreviousMonth(year: number, month: number): boolean {
  const prev = getPreviousMonth();
  return year === prev.year && month === prev.month;
}

/** Verifica se una data ricade nel mese precedente rispetto a oggi */
export function isDateInPreviousMonth(date: Date | string): boolean {
  const d = new Date(date);
  const prev = getPreviousMonth();
  return d.getFullYear() === prev.year && d.getMonth() + 1 === prev.month;
}
