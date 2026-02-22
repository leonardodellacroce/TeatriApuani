import { prisma } from "@/lib/prisma";

/**
 * Logica condivisa con my-shifts: determina se un utente è assegnato a un assignment.
 */
function isUserAssignedToAssignment(assignment: { userId: string | null; assignedUsers: string | null }, userId: string): boolean {
  if (assignment.userId === userId) return true;
  if (!assignment.assignedUsers) return false;
  try {
    const parsed = JSON.parse(assignment.assignedUsers);
    if (!Array.isArray(parsed)) return false;
    const found = parsed.some((u: unknown) => {
      if (typeof u === "string") return u === userId;
      if (u && typeof u === "object" && "userId" in u) return (u as { userId: string }).userId === userId;
      return false;
    });
    if (found) return true;
    return parsed.some(
      (u: unknown) =>
        u && typeof u === "object" && ((u as { id?: string }).id === userId || (u as { user_id?: string }).user_id === userId)
    );
  } catch {
    return false;
  }
}

/**
 * Ritorna gli assignment SHIFT assegnati all'utente nel range date.
 * Stessa logica esatta di /api/my-shifts.
 */
export async function getAssignmentsForUserInDateRange(
  userId: string,
  startDateStr: string,
  endDateStr: string
) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDateStr) {
    const d = new Date(startDateStr);
    d.setUTCHours(0, 0, 0, 0);
    dateFilter.gte = d;
  }
  if (endDateStr) {
    const d = new Date(endDateStr);
    d.setUTCHours(23, 59, 59, 999);
    dateFilter.lte = d;
  }

  const allAssignments = await prisma.assignment.findMany({
    where: {
      taskType: { is: { type: "SHIFT" } },
      ...(Object.keys(dateFilter).length > 0 && {
        workday: { date: dateFilter },
      }),
    },
    include: {
      workday: { select: { date: true } },
      timeEntries: { where: { userId }, select: { id: true } },
    },
  });

  return allAssignments.filter((a) => isUserAssignedToAssignment(a, userId));
}
