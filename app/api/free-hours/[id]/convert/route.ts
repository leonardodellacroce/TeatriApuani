import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyWorkerFreeHours } from "@/lib/notifications";

/** POST /api/free-hours/[id]/convert - Admin converte ore libere in evento/turno. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role || "";
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const {
      eventTitle,
      clientIds,
      locationId,
      notes,
      date: overrideDate,
      startTime: overrideStartTime,
      endTime: overrideEndTime,
      areaId: overrideAreaId,
      taskTypeId: overrideTaskTypeId,
      dutyId: overrideDutyId,
      actualBreaks: overrideActualBreaks,
      hoursWorked: overrideHoursWorked,
    } = body;

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

    const title = eventTitle?.trim() || `Ore libere - ${[entry.user.name, entry.user.cognome].filter(Boolean).join(" ")} - ${entry.date.toISOString().slice(0, 10)}`;

    let finalClientIds: string | null = null;
    if (clientIds) {
      const parsed = typeof clientIds === "string" ? JSON.parse(clientIds) : clientIds;
      finalClientIds = Array.isArray(parsed) && parsed.length > 0 ? JSON.stringify(parsed) : null;
    }

    const effectiveLocationId = locationId && typeof locationId === "string" ? locationId : entry.locationId;

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

    // Evento di un solo giorno: stessa data per inizio e fine (1 workday)
    const startDateTime = new Date(dateStr + "T00:00:00.000Z");
    const endDateTime = new Date(dateStr + "T00:00:00.000Z");

    // Usa override o entry per taskTypeId, dutyId, area
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

    // personnelRequests per visualizzare tipologia e personale nella giornata
    const personnelRequests = effectiveDutyId
      ? JSON.stringify([{ dutyId: effectiveDutyId, quantity: 1 }])
      : null;

    // areaEnabledStates: abilita l'area delle ore libere nella giornata
    let areaEnabledStates: string | null = null;
    const areaRecord = await prisma.area.findFirst({
      where: { name: areaName, enabledInWorkdayPlanning: true },
      select: { id: true },
    });
    if (areaRecord) {
      areaEnabledStates = JSON.stringify({ [areaRecord.id]: true });
    }

    // Activity per soddisfare validazione (primo ACTIVITY)
    const activityTaskType = await prisma.taskType.findFirst({
      where: { type: "ACTIVITY" },
      select: { id: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title,
          clientIds: finalClientIds,
          locationId: effectiveLocationId || null,
          startDate: startDateTime,
          endDate: endDateTime,
          notes: notes && typeof notes === "string" ? notes : null,
        },
      });

      const timeSpans = [{ start: effectiveStartTime, end: effectiveEndTime }];
      const workday = await tx.workday.create({
        data: {
          eventId: event.id,
          locationId: effectiveLocationId || null,
          date: startDateTime,
          isOpen: true,
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
          timeSpans: JSON.stringify(timeSpans),
          areaEnabledStates,
        },
      });

      // Crea attività se necessario (per validazione turni)
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

      const firstClientId = finalClientIds ? (JSON.parse(finalClientIds) as string[])[0] : null;
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

      const timeEntryDate = overrideDate ? new Date(dateStr + "T00:00:00.000Z") : entry.date;
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

      return { event, workday, assignment };
    });

    const detail = `Data: ${dateStr}\nOrario: ${effectiveStartTime} - ${effectiveEndTime}\nOre: ${effectiveHoursWorked.toFixed(2)}\nEvento: ${title}`;
    notifyWorkerFreeHours(entry.userId, "CONVERTED", detail, { dateFrom: dateStr, dateTo: dateStr }).catch((e) =>
      console.error("[free-hours] notifyWorkerFreeHours CONVERTED error:", e)
    );

    return NextResponse.json({
      ok: true,
      eventId: result.event.id,
      workdayId: result.workday.id,
      assignmentId: result.assignment.id,
      freeHoursEntryId: id,
    });
  } catch (error) {
    console.error("POST /api/free-hours/[id]/convert error:", error);
    return NextResponse.json(
      { error: "Errore nella conversione", details: String(error) },
      { status: 500 }
    );
  }
}
