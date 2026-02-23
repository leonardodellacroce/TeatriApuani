import { prisma } from "@/lib/prisma";
import {
  getWorkdayAlertStates,
  getPersonnelAlertState,
  getClientAlertState,
} from "@/app/dashboard/events/utils";
import { buildDutyIdToNameForWorkdays } from "@/lib/workdayDutyMap";

export interface WorkdayPreferences {
  companyIds: string[];
  areaIds: string[];
  workdayIssuesDaysAhead: number;
}

function workdayMatchesPreferences(
  wd: WorkdayWithAssignments,
  prefs: WorkdayPreferences
): boolean {
  const { companyIds, areaIds } = prefs;
  const allCompanies = companyIds.length === 0;
  const allAreas = areaIds.length === 0;
  if (allCompanies && allAreas) return true;

  const assignments = wd.assignments || [];
  // Workday senza assegnazioni o senza lavoratori assegnati: includi (es. attività mancanti, slot vuoti)
  const hasAnyAssignedWorker = assignments.some((a) => (a.user as { companyId?: string | null } | null) != null);
  if (!hasAnyAssignedWorker) return true;

  for (const a of assignments) {
    const taskType = a.taskType as { areas?: string | null } | null;
    let areaIdsArr: string[] = [];
    try {
      areaIdsArr = taskType?.areas
        ? (JSON.parse(taskType.areas) as string[]).filter(Boolean)
        : [];
    } catch {
      /* ignore */
    }
    const matchesArea = allAreas || areaIdsArr.some((aid) => areaIds.includes(aid));

    const user = a.user as { companyId?: string | null } | null;
    const workerCompanyId = user?.companyId ?? null;
    const matchesCompany = allCompanies || (workerCompanyId && companyIds.includes(workerCompanyId));

    if (matchesArea && matchesCompany) return true;
  }
  return false;
}

type WorkdayWithAssignments = Awaited<
  ReturnType<typeof prisma.workday.findMany<{
    include: {
      event: { select: { id: true; title: true; clientIds: true } };
      location: { select: { id: true; name: true } };
      assignments: {
        include: {
          taskType: { select: { id: true; name: true; type: true; areas: true } };
          user: { select: { companyId: true } };
        };
      };
    };
  }>>
>[number];

/**
 * Calcola il badge per problemi di programmazione nei prossimi N giorni.
 * - rosso: problemi workday, personale, o clienti + altro
 * - giallo: SOLO valorizzazione cliente (nessun turno o alcuni turni senza cliente)
 * - null: nessun problema
 * @param adminUserId - se fornito, usa le preferenze dell'admin per filtrare (companyIds, areaIds, workdayIssuesDaysAhead)
 */
export async function computeWorkdayIssuesBadge(adminUserId?: string): Promise<{
  badge: "red" | "yellow" | null;
  count: number;
}> {
  const today = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);

  const startDate = new Date(todayStr + "T00:00:00.000Z");
  let daysAhead = 7;
  let prefs: WorkdayPreferences = { companyIds: [], areaIds: [], workdayIssuesDaysAhead: 7 };

  const workdaySetting = await prisma.notificationTypeSetting.findUnique({
    where: { type: "WORKDAY_ISSUES" },
    select: { metadata: true },
  });
  const systemDaysAhead =
    (workdaySetting?.metadata as { workdayIssuesDaysAhead?: number } | null)?.workdayIssuesDaysAhead ?? 7;
  daysAhead = systemDaysAhead;
  prefs.workdayIssuesDaysAhead = systemDaysAhead;

  if (adminUserId) {
    const pref = await prisma.adminNotificationPreference.findUnique({
      where: { userId: adminUserId },
    });
    if (pref) {
      try {
        prefs = {
          companyIds: pref.companyIds ? (JSON.parse(pref.companyIds) as string[]) : [],
          areaIds: pref.areaIds ? (JSON.parse(pref.areaIds) as string[]) : [],
          workdayIssuesDaysAhead: systemDaysAhead,
        };
      } catch {
        prefs = { companyIds: [], areaIds: [], workdayIssuesDaysAhead: systemDaysAhead };
      }
    }
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysAhead);

  const allWorkdays = await prisma.workday.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      event: { isClosed: false },
    },
    include: {
      event: { select: { id: true, title: true, clientIds: true } },
      location: { select: { id: true, name: true } },
      assignments: {
        include: {
          taskType: { select: { id: true, name: true, type: true, areas: true } },
          user: { select: { companyId: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  let workdays = allWorkdays.filter((wd) => {
    const cids = wd.event?.clientIds;
    if (!cids) return false;
    if (cids === "" || cids === "[]") return false;
    try {
      const arr = JSON.parse(cids);
      return Array.isArray(arr) && arr.length > 0;
    } catch {
      return true;
    }
  });

  if (adminUserId) {
    workdays = workdays.filter((wd) => workdayMatchesPreferences(wd as WorkdayWithAssignments, prefs));
  }

  if (workdays.length === 0) {
    return { badge: null, count: 0 };
  }

  const areas = await prisma.area.findMany({
    select: { id: true, name: true },
  });
  const areaNamesMap: Record<string, string> = {};
  areas.forEach((a) => {
    areaNamesMap[a.id] = a.name || a.id;
  });

  const dutyIdToNameByWorkday = await buildDutyIdToNameForWorkdays(
    workdays.map((wd) => ({ id: wd.id, assignments: wd.assignments }))
  );

  let daysWithSeriousIssue = 0;
  let daysWithOnlyClientIssue = 0;

  for (const wd of workdays) {
    const workdayWithMeta = {
      ...wd,
      areaNamesMap,
      dutyIdToName: dutyIdToNameByWorkday[wd.id] || {},
    };

    const states = getWorkdayAlertStates(workdayWithMeta as any);
    const pState = getPersonnelAlertState(workdayWithMeta as any);
    const cState = getClientAlertState(workdayWithMeta as any);

    const hasWorkdayIssue =
      states.activityMissing ||
      states.activityCoverageGap ||
      states.shiftMissing ||
      states.shiftCoverageGap;
    const hasPersonnelIssue = pState.color === "red" || pState.color === "yellow";
    const hasClientIssue = cState.color === "red" || cState.color === "yellow";

    if (hasWorkdayIssue || hasPersonnelIssue) {
      daysWithSeriousIssue++;
    } else if (hasClientIssue) {
      daysWithOnlyClientIssue++;
    }
  }

  const totalDaysWithIssues = daysWithSeriousIssue + daysWithOnlyClientIssue;

  if (daysWithSeriousIssue > 0) {
    return { badge: "red", count: totalDaysWithIssues };
  }
  if (daysWithOnlyClientIssue > 0) {
    return { badge: "yellow", count: daysWithOnlyClientIssue };
  }
  return { badge: null, count: 0 };
}
