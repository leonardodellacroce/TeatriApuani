import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/shifts-hours?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Ritorna tutti i turni SHIFT con gli utenti assegnati e le ore inserite.
// Solo per ADMIN, SUPER_ADMIN, RESPONSABILE (RESPONSABILE: solo dipendenti della propria azienda).
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role || "";
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let companyIdFilter: string | null = null;
    if (userRole === "RESPONSABILE") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      if (!currentUser?.companyId) {
        return NextResponse.json({ error: "Non sei associato ad un'azienda" }, { status: 403 });
      }
      companyIdFilter = currentUser.companyId;
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const userIdFilter = searchParams.get("userId");

    const dateFilter: any = {};
    if (startDate) {
      const d = new Date(startDate);
      d.setUTCHours(0, 0, 0, 0);
      dateFilter.gte = d;
    }
    if (endDate) {
      const d = new Date(endDate);
      d.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        ...(Object.keys(dateFilter).length > 0 && {
          workday: { date: dateFilter },
        }),
      },
      include: {
        workday: {
          include: {
            event: { select: { id: true, title: true } },
            location: { select: { id: true, name: true } },
          },
        },
        taskType: { select: { id: true, name: true, type: true } },
        timeEntries: {
          select: {
            id: true,
            userId: true,
            hoursWorked: true,
            startTime: true,
            endTime: true,
            notes: true,
            hasTakenBreak: true,
            actualBreakStartTime: true,
            actualBreakEndTime: true,
            actualBreaks: true,
            date: true,
          },
        },
      },
      orderBy: [{ workday: { date: "desc" } }, { startTime: "asc" }],
    });

    const dutyMap = new Map(
      (await prisma.duty.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name])
    );

    const userIds = new Set<string>();
    for (const a of assignments) {
      if (a.userId) userIds.add(a.userId);
      if (a.assignedUsers) {
        try {
          const parsed = JSON.parse(a.assignedUsers);
          if (Array.isArray(parsed)) {
            parsed.forEach((u: any) => {
              const uid = typeof u === "string" ? u : u?.userId;
              if (uid) userIds.add(uid);
            });
          }
        } catch {}
      }
    }

    const users = await prisma.user.findMany({
      where: {
        id: { in: Array.from(userIds) },
        ...(companyIdFilter && { companyId: companyIdFilter }),
      },
      select: { id: true, name: true, cognome: true, code: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    type Row = {
      assignmentId: string;
      assignment: {
        id: string;
        startTime: string | null;
        endTime: string | null;
        area: string | null;
        note: string | null;
        hasScheduledBreak: boolean | null;
        scheduledBreakStartTime: string | null;
        scheduledBreakEndTime: string | null;
        workday: {
          date: string;
          event: { id: string; title: string };
          location: { id: string; name: string } | null;
        };
        taskType: { id: string; name: string; type: string };
      };
      userId: string;
      userName: string;
      userCode: string;
      dutyName: string | null;
      timeEntry: {
        id: string;
        hoursWorked: number;
        startTime: string | null;
        endTime: string | null;
        notes: string | null;
        hasTakenBreak: boolean | null;
        actualBreakStartTime: string | null;
        actualBreakEndTime: string | null;
        date: string;
      } | null;
    };

    const rows: Row[] = [];

    for (const a of assignments) {
      const getUserIds = (): string[] => {
        const ids: string[] = [];
        if (a.userId) ids.push(a.userId);
        if (a.assignedUsers) {
          try {
            const parsed = JSON.parse(a.assignedUsers);
            if (Array.isArray(parsed)) {
              parsed.forEach((u: any) => {
                const uid = typeof u === "string" ? u : u?.userId;
                if (uid && !ids.includes(uid)) ids.push(uid);
              });
            }
          } catch {}
        }
        return ids;
      };

      const ids = getUserIds();
      for (const uid of ids) {
        if (companyIdFilter && !userMap.has(uid)) continue;
        if (userIdFilter && uid !== userIdFilter) continue;

        const user = userMap.get(uid);
        let dutyName: string | null = null;
        if (a.assignedUsers) {
          try {
            const parsed = JSON.parse(a.assignedUsers);
            if (Array.isArray(parsed)) {
              const entry = parsed.find((u: any) => (typeof u === "string" ? u : u?.userId) === uid);
              if (entry && typeof entry === "object" && entry.dutyId) {
                dutyName = dutyMap.get(entry.dutyId) || null;
              }
            }
          } catch {}
        }

        const te = a.timeEntries.find((t) => t.userId === uid) ?? null;

        rows.push({
          assignmentId: a.id,
          assignment: {
            id: a.id,
            startTime: a.startTime,
            endTime: a.endTime,
            area: a.area,
            note: a.note,
            hasScheduledBreak: a.hasScheduledBreak,
            scheduledBreakStartTime: a.scheduledBreakStartTime,
            scheduledBreakEndTime: a.scheduledBreakEndTime,
            scheduledBreaks: a.scheduledBreaks,
            workday: a.workday
              ? {
                  date:
                    a.workday.date instanceof Date
                      ? a.workday.date.toISOString()
                      : String(a.workday.date),
                  event: a.workday.event,
                  location: a.workday.location,
                }
              : (null as any),
            taskType: a.taskType,
          },
          userId: uid,
          userName: user ? `${user.name || ""} ${user.cognome || ""}`.trim() || user.code : uid,
          userCode: user?.code || "",
          dutyName,
          timeEntry: te
            ? {
                id: te.id,
                hoursWorked: te.hoursWorked,
                startTime: te.startTime,
                endTime: te.endTime,
                notes: te.notes,
                hasTakenBreak: te.hasTakenBreak,
                actualBreakStartTime: te.actualBreakStartTime,
                actualBreakEndTime: te.actualBreakEndTime,
                actualBreaks: te.actualBreaks,
                date:
                  te.date instanceof Date ? te.date.toISOString() : String(te.date),
              }
            : null,
        });
      }
    }

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Error fetching admin shifts-hours:", error);
    return NextResponse.json(
      { error: "Failed to fetch", details: String(error) },
      { status: 500 }
    );
  }
}
