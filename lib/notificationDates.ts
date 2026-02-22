/**
 * Estrae le date da una notifica MISSING_HOURS_REMINDER e calcola l'intervallo
 * per il redirect a my-shifts (primo giorno del mese più antico -> ultimo giorno del mese più recente).
 */

export function getDateRangeFromNotification(
  message: string,
  metadata?: { dates?: string[] } | null
): { startDate: string; endDate: string } | null {
  let dates: string[] = [];

  if (metadata?.dates && Array.isArray(metadata.dates) && metadata.dates.length > 0) {
    dates = metadata.dates;
  } else {
    const match = message.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
    if (match) {
      dates = match.map((d) => {
        const [day, month, year] = d.split("/");
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      });
    }
  }

  if (dates.length === 0) return null;

  const sorted = [...dates].sort();
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];

  const [yearStart, monthStart] = earliest.split("-").map(Number);
  const [yearEnd, monthEnd] = latest.split("-").map(Number);

  const startDate = `${yearStart}-${String(monthStart).padStart(2, "0")}-01`;
  const lastDay = new Date(yearEnd, monthEnd, 0);

  const endDate = `${yearEnd}-${String(monthEnd).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  return { startDate, endDate };
}

export function buildMyShiftsUrlWithDates(
  message: string,
  metadata?: { dates?: string[] } | null
): string {
  const range = getDateRangeFromNotification(message, metadata);
  if (!range) return "/dashboard/my-shifts";
  return `/dashboard/my-shifts?startDate=${range.startDate}&endDate=${range.endDate}`;
}
