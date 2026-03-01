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

/** URL per notifiche ORE_* (dateFrom/dateTo in metadata) */
export function buildMyShiftsUrlForOreNotification(
  metadata?: { dateFrom?: string; dateTo?: string } | null
): string {
  const dateFrom = metadata?.dateFrom ?? metadata?.dateTo;
  const dateTo = metadata?.dateTo ?? metadata?.dateFrom;
  if (!dateFrom) return "/dashboard/my-shifts";
  return `/dashboard/my-shifts?startDate=${dateFrom}&endDate=${dateTo || dateFrom}`;
}

/** Estrae date da una notifica (metadata.dates o regex dal messaggio) */
function extractDatesFromNotification(
  message: string,
  metadata?: { dates?: string[] } | null
): string[] {
  if (metadata?.dates && Array.isArray(metadata.dates) && metadata.dates.length > 0) {
    return metadata.dates;
  }
  const match = message.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
  if (match) {
    return match.map((d) => {
      const [day, month, year] = d.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    });
  }
  return [];
}

/** Merge date da un gruppo di notifiche MISSING_HOURS_REMINDER → range completo */
export function getDateRangeFromNotificationGroup(
  notifications: Array<{ message: string; metadata?: { dates?: string[] } | null }>
): { startDate: string; endDate: string } | null {
  const allDates: string[] = [];
  for (const n of notifications) {
    allDates.push(...extractDatesFromNotification(n.message, n.metadata));
  }
  if (allDates.length === 0) return null;
  const sorted = [...new Set(allDates)].sort();
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const [yearStart, monthStart] = earliest.split("-").map(Number);
  const [yearEnd, monthEnd] = latest.split("-").map(Number);
  const startDate = `${yearStart}-${String(monthStart).padStart(2, "0")}-01`;
  const lastDay = new Date(yearEnd, monthEnd, 0);
  const endDate = `${yearEnd}-${String(monthEnd).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  return { startDate, endDate };
}

/** URL per gruppo MISSING_HOURS_REMINDER (intervallo che copre tutte le date) */
export function buildMyShiftsUrlForMissingHoursGroup(
  notifications: Array<{ message: string; metadata?: { dates?: string[] } | null }>
): string {
  const range = getDateRangeFromNotificationGroup(notifications);
  if (!range) return "/dashboard/my-shifts";
  return `/dashboard/my-shifts?startDate=${range.startDate}&endDate=${range.endDate}`;
}

/** Merge dateFrom/dateTo da un gruppo di notifiche ORE_* / FREE_HOURS_CONVERTED → range completo */
export function buildMyShiftsUrlForOreNotificationGroup(
  notifications: Array<{ metadata?: { dateFrom?: string; dateTo?: string } | null }>
): string {
  let minFrom: string | null = null;
  let maxTo: string | null = null;
  for (const n of notifications) {
    const meta = n.metadata;
    const from = meta?.dateFrom ?? meta?.dateTo;
    const to = meta?.dateTo ?? meta?.dateFrom;
    if (from) {
      if (!minFrom || from < minFrom) minFrom = from;
      if (!maxTo || (to || from) > maxTo) maxTo = to || from;
    }
  }
  if (!minFrom) return "/dashboard/my-shifts";
  return `/dashboard/my-shifts?startDate=${minFrom}&endDate=${maxTo || minFrom}`;
}
