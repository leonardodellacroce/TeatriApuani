import { prisma } from "@/lib/prisma";
import { getAssignmentsForUserInDateRange } from "@/lib/myShiftsData";

/**
 * Estrae le date da metadata o dal messaggio di una notifica MISSING_HOURS_REMINDER.
 */
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

/**
 * Segna come lette le notifiche MISSING_HOURS_REMINDER dell'utente per cui
 * non ha più ore da inserire (ha risolto tutti i turni per quelle date).
 * Da chiamare dopo create/update di time entry.
 */
export async function markMissingHoursNotificationsAsReadIfResolved(
  userId: string
): Promise<void> {
  const unread = await prisma.notification.findMany({
    where: {
      userId,
      type: "MISSING_HOURS_REMINDER",
      read: false,
    },
  });
  if (unread.length === 0) return;

  const toMarkRead: string[] = [];
  for (const n of unread) {
    const meta = n.metadata as { dates?: string[] } | null;
    const dates = extractDatesFromNotification(n.message, meta);
    if (dates.length === 0) continue;
    const stillHasMissing = await userHasMissingShiftsForDates(userId, dates);
    if (!stillHasMissing) {
      toMarkRead.push(n.id);
    }
  }
  if (toMarkRead.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: toMarkRead } },
      data: { read: true },
    });
  }
}

/**
 * Verifica se l'utente ha ancora turni senza ore inserite per le date indicate.
 * Usa la STESSA logica di /api/my-shifts (getAssignmentsForUserInDateRange).
 */
export async function userHasMissingShiftsForDates(
  userId: string,
  dates: string[]
): Promise<boolean> {
  if (dates.length === 0) return false;

  const sortedDates = [...dates].sort();
  const startDateStr = sortedDates[0];
  const endDateStr = sortedDates[sortedDates.length - 1];

  const assignments = await getAssignmentsForUserInDateRange(userId, startDateStr, endDateStr);

  for (const a of assignments) {
    const hasNoTimeEntry = !a.timeEntries || a.timeEntries.length === 0;
    if (hasNoTimeEntry) {
      return true; // ha almeno un turno senza ore
    }
  }
  return false;
}
