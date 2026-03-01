import { prisma } from "@/lib/prisma";

export type AssignmentChangeAction = "ADDED" | "MODIFIED" | "REMOVED";

/** Estrae gli userId da un assignment (userId + assignedUsers) */
export function getAssignmentUserIds(assignment: {
  userId: string | null;
  assignedUsers: string | null;
}): string[] {
  const ids: string[] = [];
  if (assignment.userId) ids.push(assignment.userId);
  if (assignment.assignedUsers) {
    try {
      const parsed = JSON.parse(assignment.assignedUsers);
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          const uid = typeof u === "string" ? u : (u as { userId?: string })?.userId;
          if (uid && !ids.includes(uid)) ids.push(uid);
        }
      }
    } catch {}
  }
  return ids;
}

/** Logga una modifica a un assignment SHIFT per i lavoratori interessati */
export async function logAssignmentChange(params: {
  assignmentId: string | null;
  workdayId: string;
  workdayDate: Date;
  userIds: string[];
  action: AssignmentChangeAction;
  details?: {
    eventTitle?: string;
    locationName?: string;
    taskTypeName?: string;
    startTime?: string | null;
    endTime?: string | null;
    area?: string | null;
  };
}): Promise<void> {
  const { assignmentId, workdayId, workdayDate, userIds, action, details } = params;
  if (userIds.length === 0) return;

  const workdayDateNorm = workdayDate instanceof Date ? workdayDate : new Date(workdayDate);
  for (const userId of userIds) {
    await prisma.assignmentChangeLog.create({
      data: {
        assignmentId,
        workdayId,
        workdayDate: workdayDateNorm,
        userId,
        action,
        details: details ? (details as object) : undefined,
      },
    });
  }
}
