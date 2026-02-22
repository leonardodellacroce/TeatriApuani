import { getAssignmentsForUserInDateRange } from "@/lib/myShiftsData";

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
