import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyWorkerFreeHours } from "@/lib/notifications";
import { mergeFreeHoursIntoTimeSpans } from "@/lib/timeSpans";

/** POST /api/free-hours/[id]/associate-to-event - Admin associa ore libere a un evento esistente. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role || "";
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const {
      eventId,
      date: overrideDate,
      startTime: overrideStartTime,
      endTime: overrideEndTime,
      areaId: overrideAreaId,
      taskTypeId: overrideTaskTypeId,
      dutyId: overrideDutyId,
      actualBreaks: overrideActualBreaks,
      hoursWorked: overrideHoursWorked,
      notes,
    } = body;

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "eventId obbligatorio" }, { status: 400 });
    }

    const entry = await prisma.freeHoursEntry.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, cognome: true } } },
    });

    if (!entry) {
      return NextResponse.json({ error: "Ore libere non trovate" }, { status: 404 });
    }
    if (entry.status !== "PENDING") {
      return NextResponse.json({ error: "Queste ore libere sono già state convertite" }, { status: 400 });
    }

    const dateStr =
      overrideDate && typeof overrideDate === "string"
        ? overrideDate.slice(0, 10)
        : entry.date.toISOString().slice(0, 10);
    const effectiveStartTime =
      overrideStartTime && typeof overrideStartTime === "string" ? overrideStartTime : entry.startTime;
    const effectiveEndTime =
      overrideEndTime && typeof overrideEndTime === "string" ? overrideEndTime : entry.endTime;
    const effectiveHoursWorked =
      typeof overrideHoursWorked === "number" && overrideHoursWorked > 0 ? overrideHoursWorked : entry.hoursWorked;
    let effectiveActualBreaks: string | null = entry.actualBreaks;
    if (Array.isArray(overrideActualBreaks)) {
      const valid = overrideActualBreaks.filter(
        (b: unknown) => b && typeof b === "object" && "start" in b && "end" in b
      );
      effectiveActualBreaks = valid.length > 0 ? JSON.stringify(valid) : null;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { location: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });
    }
    if (event.isClosed) {
      return NextResponse.json({ error: "L'evento è chiuso, non è possibile associare ore" }, { status: 400 });
    }

    const entryLocationId = entry.locationId;
    const eventLocationId = event.locationId;
    if (entryLocationId !== eventLocationId) {
      return NextResponse.json(
        { error: "La location delle ore libere non corrisponde a quella dell'evento" },
        { status: 400 }
      );
    }

    const dateObj = new Date(dateStr + "T00:00:00.000Z");
    const dateStart = new Date(dateObj);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(dateObj);
    dateEnd.setUTCHours(23, 59, 59, 999);

    if (event.startDate > dateEnd || event.endDate < dateStart) {
      return NextResponse.json(
        { error: "La data delle ore libere non rientra nel periodo dell'evento" },
        { status: 400 }
      );
    }

    const effectiveTaskTypeId = overrideTaskTypeId && typeof overrideTaskTypeId === "string" ? overrideTaskTypeId : entry.taskTypeId;
    const effectiveDutyId = overrideDutyId && typeof overrideDutyId === "string" ? overrideDutyId : entry.dutyId;

    let shiftTaskTypeId: string;
    let areaName: string | null = entry.area;

    if (overrideAreaId && typeof overrideAreaId === "string") {
      const areaRec = await prisma.area.findUnique({ where: { id: overrideAreaId }, select: { name: true } });
      if (areaRec) areaName = areaRec.name;
    }

    if (effectiveTaskTypeId) {
      const tt = await prisma.taskType.findFirst({
        where: { id: effectiveTaskTypeId, type: "SHIFT" },
        select: { id: true, areas: true },
      });
      if (tt) {
        shiftTaskTypeId = tt.id;
        if (!areaName && tt.areas) {
          try {
            const arr = JSON.parse(tt.areas) as string[];
            if (Array.isArray(arr) && arr.length > 0) {
              const a = await prisma.area.findUnique({ where: { id: arr[0] }, select: { name: true } });
              if (a) areaName = a.name;
            }
          } catch {}
        }
      } else {
        const fallback = await prisma.taskType.findFirst({ where: { type: "SHIFT" }, select: { id: true, areas: true } });
        if (!fallback) {
          return NextResponse.json(
            { error: "Nessun tipo di turno configurato. Crea un tipo turno da Impostazioni." },
            { status: 400 }
          );
        }
        shiftTaskTypeId = fallback.id;
        if (!areaName && fallback.areas) {
          try {
            const arr = JSON.parse(fallback.areas) as string[];
            if (Array.isArray(arr) && arr.length > 0) {
              const a = await prisma.area.findUnique({ where: { id: arr[0] }, select: { name: true } });
              if (a) areaName = a.name;
            }
          } catch {}
        }
      }
    } else {
      const shiftTaskType = await prisma.taskType.findFirst({
        where: { type: "SHIFT" },
        select: { id: true, areas: true },
      });
      if (!shiftTaskType) {
        return NextResponse.json(
          { error: "Nessun tipo di turno configurato. Crea un tipo turno da Impostazioni." },
          { status: 400 }
        );
      }
      shiftTaskTypeId = shiftTaskType.id;
      if (!areaName && shiftTaskType.areas) {
        try {
          const arr = JSON.parse(shiftTaskType.areas) as string[];
          if (Array.isArray(arr) && arr.length > 0) {
            const a = await prisma.area.findUnique({ where: { id: arr[0] }, select: { name: true } });
            if (a) areaName = a.name;
          }
        } catch {}
      }
    }

    if (!areaName) {
      return NextResponse.json(
        { error: "Nessuna area configurata per i turni. Configura le aree da Impostazioni." },
        { status: 400 }
      );
    }

    const assignedUsers = effectiveDutyId
      ? JSON.stringify([{ userId: entry.userId, dutyId: effectiveDutyId }])
      : JSON.stringify([{ userId: entry.userId }]);

    const personnelRequests = effectiveDutyId
      ? JSON.stringify([{ dutyId: effectiveDutyId, quantity: 1 }])
      : null;

    const activityTaskType = await prisma.taskType.findFirst({
      where: { type: "ACTIVITY" },
      select: { id: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const dayStart = new Date(dateStr + "T00:00:00.000Z");
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      let workday = await tx.workday.findFirst({
        where: {
          eventId: event.id,
          date: { gte: dayStart, lt: dayEnd },
        },
      });

      if (!workday) {
        const timeSpans = [{ start: effectiveStartTime, end: effectiveEndTime }];
        let areaEnabledStates: string | null = null;
        const areaRecord = await prisma.area.findFirst({
          where: { name: areaName, enabledInWorkdayPlanning: true },
          select: { id: true },
        });
        if (areaRecord) {
          areaEnabledStates = JSON.stringify({ [areaRecord.id]: true });
        }

        workday = await tx.workday.create({
          data: {
            eventId: event.id,
            locationId: eventLocationId || null,
            date: new Date(dateStr + "T00:00:00.000Z"),
            isOpen: true,
            startTime: effectiveStartTime,
            endTime: effectiveEndTime,
            timeSpans: JSON.stringify(timeSpans),
            areaEnabledStates,
          },
        });

        if (activityTaskType) {
          await tx.assignment.create({
            data: {
              workdayId: workday.id,
              taskTypeId: activityTaskType.id,
              startTime: effectiveStartTime,
              endTime: effectiveEndTime,
              area: areaName,
            },
          });
        }
      } else {
        // Workday esistente: aggiorna areaEnabledStates se l'area non è abilitata
        const areaRecord = await prisma.area.findFirst({
          where: { name: areaName, enabledInWorkdayPlanning: true },
          select: { id: true },
        });
        if (areaRecord && workday.areaEnabledStates) {
          try {
            const states = JSON.parse(workday.areaEnabledStates) as Record<string, boolean>;
            if (!states[areaRecord.id]) {
              states[areaRecord.id] = true;
              await tx.workday.update({
                where: { id: workday.id },
                data: { areaEnabledStates: JSON.stringify(states) },
              });
            }
          } catch {}
        } else if (areaRecord && !workday.areaEnabledStates) {
          await tx.workday.update({
            where: { id: workday.id },
            data: { areaEnabledStates: JSON.stringify({ [areaRecord.id]: true }) },
          });
        }

        // Merge ore libere negli orari della giornata (estendi solo se necessario)
        let existingSpans: Array<{ start: string; end: string }> = [];
        if (workday.timeSpans) {
          try {
            const arr = JSON.parse(workday.timeSpans) as Array<{ start: string; end: string }>;
            if (Array.isArray(arr)) existingSpans = arr;
          } catch {}
        }
        if (existingSpans.length === 0 && workday.startTime && workday.endTime) {
          existingSpans = [{ start: workday.startTime, end: workday.endTime }];
        }
        const newSpans = mergeFreeHoursIntoTimeSpans(existingSpans, {
          start: effectiveStartTime,
          end: effectiveEndTime,
        });
        const spansChanged =
          JSON.stringify(newSpans) !== JSON.stringify(existingSpans);
        if (spansChanged) {
          await tx.workday.update({
            where: { id: workday.id },
            data: { timeSpans: JSON.stringify(newSpans) },
          });
        }
      }

      const firstClientId = event.clientIds ? (JSON.parse(event.clientIds) as string[])[0] : null;
      const assignment = await tx.assignment.create({
        data: {
          workdayId: workday.id,
          taskTypeId: shiftTaskTypeId,
          userId: entry.userId,
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
          area: areaName,
          assignedUsers,
          personnelRequests,
          clientId: firstClientId || null,
        },
      });

      const timeEntryDate = new Date(dateStr + "T00:00:00.000Z");
      await tx.timeEntry.create({
        data: {
          assignmentId: assignment.id,
          userId: entry.userId,
          date: timeEntryDate,
          hoursWorked: effectiveHoursWorked,
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
          actualBreaks: effectiveActualBreaks,
          notes: notes && typeof notes === "string" ? notes : entry.notes,
        },
      });

      await tx.freeHoursEntry.update({
        where: { id },
        data: {
          status: "CONVERTED",
          convertedToAssignmentId: assignment.id,
        },
      });

      return { workday, assignment };
    });

    const detail = `Data: ${dateStr}\nOrario: ${effectiveStartTime} - ${effectiveEndTime}\nOre: ${effectiveHoursWorked.toFixed(2)}\nEvento: ${event.title}`;
    notifyWorkerFreeHours(entry.userId, "CONVERTED", detail, { dateFrom: dateStr, dateTo: dateStr }).catch((e) =>
      console.error("[free-hours] notifyWorkerFreeHours CONVERTED error:", e)
    );

    return NextResponse.json({
      ok: true,
      eventId: event.id,
      workdayId: result.workday.id,
      assignmentId: result.assignment.id,
      freeHoursEntryId: id,
    });
  } catch (error) {
    console.error("POST /api/free-hours/[id]/associate-to-event error:", error);
    return NextResponse.json(
      { error: "Errore nell'associazione", details: String(error) },
      { status: 500 }
    );
  }
}
