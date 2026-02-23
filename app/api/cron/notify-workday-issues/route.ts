import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNotificationTypeSetting } from "@/lib/notifications";
import { getWorkdayAlertStates, getPersonnelAlertState } from "@/app/dashboard/events/utils";
import { buildDutyIdToNameForWorkdays } from "@/lib/workdayDutyMap";
import type { WorkdayPreferences } from "@/lib/workdayIssuesBadge";

function workdayMatchesPreferences(
  wd: { assignments?: Array<{ taskType?: { areas?: string | null } | null; user?: { companyId?: string | null } | null }> },
  prefs: WorkdayPreferences
): boolean {
  const { companyIds, areaIds } = prefs;
  const allCompanies = companyIds.length === 0;
  const allAreas = areaIds.length === 0;
  if (allCompanies && allAreas) return true;

  const assignments = wd.assignments || [];
  const hasAnyAssignedWorker = assignments.some((a) => a.user != null);
  if (!hasAnyAssignedWorker) return true;

  for (const a of assignments) {
    const taskType = a.taskType;
    let areaIdsArr: string[] = [];
    try {
      areaIdsArr = taskType?.areas
        ? (JSON.parse(taskType.areas) as string[]).filter(Boolean)
        : [];
    } catch {
      /* ignore */
    }
    const matchesArea = allAreas || areaIdsArr.some((aid) => areaIds.includes(aid));
    const workerCompanyId = a.user?.companyId ?? null;
    const matchesCompany = allCompanies || (workerCompanyId && companyIds.includes(workerCompanyId));

    if (matchesArea && matchesCompany) return true;
  }
  return false;
}

// GET /api/cron/notify-workday-issues
// Chiamato da Vercel Cron ogni giorno alle 8:00 (Europe/Rome)
// Notifica gli admin su problemi di programmazione nei prossimi N giorni (per preferenze).
// Usa getWorkdayAlertStates e getPersonnelAlertState (NON getClientAlertState).
// Escluso: clienti non impostati (eventi senza clientIds).
// Una notifica al giorno per admin. Anti-duplicati: non creare se esiste già nelle ultime 20-24 ore.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workdaySetting = await getNotificationTypeSetting("WORKDAY_ISSUES");
    if (workdaySetting && !workdaySetting.isActive) {
      return NextResponse.json({ ok: true, created: 0, daysWithIssues: 0, skipped: "type_disabled" });
    }

    const today = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today);

    const startDate = new Date(todayStr + "T00:00:00.000Z");
    const maxEndDate = new Date(startDate);
    maxEndDate.setDate(maxEndDate.getDate() + 90);

    const allWorkdays = await prisma.workday.findMany({
      where: {
        date: { gte: startDate, lt: maxEndDate },
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

    const workdays = allWorkdays.filter((wd) => {
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

    if (workdays.length === 0) {
      return NextResponse.json({ ok: true, created: 0, daysWithIssues: 0 });
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

    const workdaysWithIssues: Array<{ dateStr: string; line: string; wd: (typeof workdays)[number] }> = [];

    for (const wd of workdays) {
      const wdDate = wd.date instanceof Date ? wd.date : new Date(wd.date);
      const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(wdDate);

      const workdayWithMeta = {
        ...wd,
        areaNamesMap,
        dutyIdToName: dutyIdToNameByWorkday[wd.id] || {},
      };

      const states = getWorkdayAlertStates(workdayWithMeta as any);
      const pState = getPersonnelAlertState(workdayWithMeta as any);

      const hasWorkdayIssue =
        states.activityMissing ||
        states.activityCoverageGap ||
        states.shiftMissing ||
        states.shiftCoverageGap;
      const hasPersonnelIssue = pState.color === "red" || pState.color === "yellow";

      if (hasWorkdayIssue || hasPersonnelIssue) {
        const eventTitle = wd.event?.title || "Evento";
        const locationName = wd.location?.name || "";
        const locPart = locationName ? ` (${locationName})` : "";
        const msgs: string[] = [];
        if (states.activityMissing) msgs.push(states.activityMessage);
        if (states.activityCoverageGap) msgs.push(states.activityCoverageMessage);
        if (states.shiftMissing) msgs.push(states.shiftMessage || states.shiftMessages?.[0] || "Turni mancanti");
        if (states.shiftCoverageGap) msgs.push(states.shiftCoverageMessage);
        if (pState.messages.length > 0) msgs.push(...pState.messages);
        const uniqueMsgs = [...new Set(msgs.filter(Boolean))];
        const line = `${eventTitle}${locPart}: ${uniqueMsgs.slice(0, 3).join("; ")}`;
        workdaysWithIssues.push({ dateStr, line, wd });
      }
    }

    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        isArchived: false,
        OR: [
          { isSuperAdmin: true },
          { isAdmin: true },
          { isResponsabile: true },
        ],
      },
      select: { id: true },
    });

    const systemDaysAhead =
      (workdaySetting?.metadata as { workdayIssuesDaysAhead?: number } | null)?.workdayIssuesDaysAhead ?? 7;

    const prefsByAdmin = new Map<string, WorkdayPreferences>();
    for (const admin of admins) {
      const pref = await prisma.adminNotificationPreference.findUnique({
        where: { userId: admin.id },
      });
      const daysAhead = systemDaysAhead;
      const endForAdmin = new Date(startDate);
      endForAdmin.setDate(endForAdmin.getDate() + daysAhead);
      prefsByAdmin.set(admin.id, {
        companyIds: pref?.companyIds ? (JSON.parse(pref.companyIds) as string[]) : [],
        areaIds: pref?.areaIds ? (JSON.parse(pref.areaIds) as string[]) : [],
        workdayIssuesDaysAhead: daysAhead,
      });
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let created = 0;

    for (const admin of admins) {
      const prefs = prefsByAdmin.get(admin.id)!;
      const endForAdmin = new Date(startDate);
      endForAdmin.setDate(endForAdmin.getDate() + prefs.workdayIssuesDaysAhead);

      const issuesByDate = new Map<string, string[]>();
      for (const { dateStr, line, wd } of workdaysWithIssues) {
        const wdDate = wd.date instanceof Date ? wd.date : new Date(wd.date);
        if (wdDate >= endForAdmin) continue;
        if (!workdayMatchesPreferences(wd, prefs)) continue;
        if (!issuesByDate.has(dateStr)) issuesByDate.set(dateStr, []);
        const existing = issuesByDate.get(dateStr)!;
        if (!existing.includes(line)) existing.push(line);
      }

      for (const [dateStr, lines] of issuesByDate) {
        if (lines.length === 0) continue;

        const [y, m, d] = dateStr.split("-");
        const formattedDate = `${d}/${m}/${y}`;
        const message =
          lines.length === 1
            ? `${formattedDate}: ${lines[0]}`
            : `${formattedDate}: ${lines.slice(0, 3).join(" | ")}`;

        const recentSameType = await prisma.notification.findMany({
          where: {
            userId: admin.id,
            type: "WORKDAY_ISSUES",
            createdAt: { gte: twentyFourHoursAgo },
          },
          select: { metadata: true },
        });
        const alreadyNotifiedForDate = recentSameType.some(
          (n) => (n.metadata as Record<string, unknown>)?.date === dateStr
        );

        if (!alreadyNotifiedForDate) {
          await prisma.notification.create({
            data: {
              userId: admin.id,
              type: "WORKDAY_ISSUES",
              title: "Problemi programmazione",
              message,
              metadata: { date: dateStr },
              priority: workdaySetting?.priority ?? "HIGH",
              read: false,
            },
          });
          created++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      daysWithIssues: workdaysWithIssues.length,
    });
  } catch (error) {
    console.error("Cron notify-workday-issues error:", error);
    return NextResponse.json(
      { error: "Cron failed", details: String(error) },
      { status: 500 }
    );
  }
}
