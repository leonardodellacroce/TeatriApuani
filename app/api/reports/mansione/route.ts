import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Helper per calcolare le ore da un intervallo di tempo
function calculateHoursFromTimeRange(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0;
  
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  
  return (endMinutes - startMinutes) / 60;
}

function calculateBreakHours(
  hasScheduledBreak: boolean,
  breakStartTime: string | null,
  breakEndTime: string | null
): number {
  if (!hasScheduledBreak || !breakStartTime || !breakEndTime) return 0;
  return calculateHoursFromTimeRange(breakStartTime, breakEndTime);
}

function calculateShiftAndOvertime(
  hours: number,
  shiftHours: number | null
): { shifts: number; overtimeHours: number } {
  if (!shiftHours || shiftHours <= 0) return { shifts: 0, overtimeHours: hours };
  if (hours <= shiftHours) return { shifts: 1, overtimeHours: 0 };
  return { shifts: 1, overtimeHours: hours - shiftHours };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dutyId = searchParams.get("dutyId");
    const clientId = searchParams.get("clientId");
    const locationId = searchParams.get("locationId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const hoursType = searchParams.get("hoursType") || "actual";
    const includeBreaksHourly = searchParams.get("includeBreaksHourly") !== "false"; // solo per servizi orari; servizi a turno mai
    const showBreakTimes = searchParams.get("showBreakTimes") !== "false"; // default true

    if (!dutyId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "dutyId, startDate and endDate are required" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Recupera la mansione
    const duty = await prisma.duty.findUnique({
      where: { id: dutyId },
      select: { name: true, code: true },
    });

    if (!duty) {
      return NextResponse.json({ error: "Duty not found" }, { status: 404 });
    }

    // Trova gli eventi (location e cliente opzionali)
    const eventWhere: any = {};
    if (locationId) eventWhere.locationId = locationId;
    if (clientId) eventWhere.clientIds = { contains: clientId };
    
    const events = await prisma.event.findMany({
      where: eventWhere,
      select: { id: true },
    });

    const eventIds = events.map(e => e.id);
    if (eventIds.length === 0) {
      return NextResponse.json({
        dutyId,
        dutyName: duty.name,
        dutyCode: duty.code,
        clientId,
        locationId,
        startDate,
        endDate,
        totalHours: 0,
        dailyDetails: [],
      });
    }

    // Trova i workdays (location opzionale)
    const workdayWhere: any = {
      eventId: { in: eventIds },
      date: { gte: start, lte: end },
    };
    if (locationId) workdayWhere.locationId = locationId;
    
    const workdays = await prisma.workday.findMany({
      where: workdayWhere,
      select: { id: true, date: true },
    });

    const workdayIds = workdays.map(w => w.id);
    if (workdayIds.length === 0) {
      return NextResponse.json({
        dutyId,
        dutyName: duty.name,
        dutyCode: duty.code,
        clientId,
        locationId,
        startDate,
        endDate,
        totalHours: 0,
        dailyDetails: [],
      });
    }

    // Costruisci il filtro per gli Assignment
    const assignmentWhere: any = {
      workdayId: { in: workdayIds },
      taskType: { is: { type: "SHIFT" } },
    };
    
    // Se è specificato un clientId, filtra per quel cliente
    if (clientId) {
      assignmentWhere.clientId = clientId;
    }
    
    // Recupera gli Assignment che hanno questa mansione
    const assignments = await prisma.assignment.findMany({
      where: assignmentWhere,
      select: {
        id: true,
        workdayId: true,
        taskTypeId: true,
        taskType: {
          select: {
            id: true,
            name: true,
            isHourlyService: true,
            shiftHours: true,
          },
        },
        startTime: true,
        endTime: true,
        hasScheduledBreak: true,
        scheduledBreakStartTime: true,
        scheduledBreakEndTime: true,
        assignedUsers: true,
        personnelRequests: true,
        timeEntries: {
          select: {
            userId: true,
            hoursWorked: true,
          },
        },
      },
    });

    // Mappa workdayId -> date
    const workdayDateMap = new Map<string, Date>();
    workdays.forEach(w => {
      workdayDateMap.set(w.id, w.date);
    });

    let totalHours = 0;
    // Struttura semplificata: data -> taskTypeId -> { taskTypeName, totalHours, shifts, overtimeHours }
    const dailyDetailsMap = new Map<string, Map<string, {
      taskTypeName: string;
      totalHours: number;
      shifts: number;
      overtimeHours: number;
    }>>();
    const taskTypeCache = new Map<string, { name: string; isHourlyService: boolean | null; shiftHours: number | null }>();

    // Filtra solo quelli che hanno effettivamente questa mansione
    for (const assignment of assignments) {
      let hasDuty = false;
      const assignmentUserDutyMap = new Map<string, string>();

      if (assignment.assignedUsers) {
        try {
          const parsed = JSON.parse(assignment.assignedUsers);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              if (item?.userId && item?.dutyId) {
                assignmentUserDutyMap.set(item.userId, item.dutyId);
                if (item.dutyId === dutyId) {
                  hasDuty = true;
                }
              }
            });
          }
        } catch {}
      }

      if (!hasDuty && assignment.personnelRequests) {
        try {
          const parsed = JSON.parse(assignment.personnelRequests);
          if (Array.isArray(parsed)) {
            hasDuty = parsed.some((item: any) => item?.dutyId === dutyId);
          }
        } catch {}
      }

      if (!hasDuty) continue;

      const workdayDate = workdayDateMap.get(assignment.workdayId);
      if (!workdayDate) continue;

      const dateKey = workdayDate.toISOString().split('T')[0];
      const taskTypeId = assignment.taskTypeId;
      const taskTypeName = assignment.taskType?.name || "Non specificato";
      const taskTypeIsHourlyService = assignment.taskType?.isHourlyService ?? true;
      const taskTypeShiftHours = assignment.taskType?.shiftHours ?? null;
      const includeBreaksForAssignment = taskTypeIsHourlyService ? includeBreaksHourly : false; // servizi a turno: pause mai incluse
      
      if (!taskTypeCache.has(taskTypeId)) {
        taskTypeCache.set(taskTypeId, {
          name: taskTypeName,
          isHourlyService: taskTypeIsHourlyService,
          shiftHours: taskTypeShiftHours,
        });
      }

      let shiftHours = 0;
      let numberOfPeople = 0;

      if (hoursType === "actual") {
        const userHoursMap = new Map<string, number>();
        
        for (const timeEntry of assignment.timeEntries) {
          const entryDutyId = assignmentUserDutyMap.get(timeEntry.userId);
          if (entryDutyId !== dutyId) continue;
          
          let hours = timeEntry.hoursWorked;
          const breakHours = assignment.hasScheduledBreak
            ? calculateBreakHours(
                assignment.hasScheduledBreak,
                assignment.scheduledBreakStartTime,
                assignment.scheduledBreakEndTime
              )
            : 0;
          
          if (includeBreaksForAssignment && breakHours > 0) {
            hours = hours + breakHours;
          }
          
          userHoursMap.set(timeEntry.userId, hours);
          totalHours += hours;
        }
        
        numberOfPeople = userHoursMap.size;
        shiftHours = userHoursMap.size > 0
          ? Array.from(userHoursMap.values()).reduce((a, b) => a + b, 0) / userHoursMap.size
          : 0;
      } else {
        let hours = calculateHoursFromTimeRange(assignment.startTime, assignment.endTime);
        
        if (!includeBreaksForAssignment && assignment.hasScheduledBreak) {
          const breakHours = calculateBreakHours(
            assignment.hasScheduledBreak,
            assignment.scheduledBreakStartTime,
            assignment.scheduledBreakEndTime
          );
          hours = Math.max(0, hours - breakHours);
        }
        
        const assignedUserIds = new Set<string>();
        if (assignment.assignedUsers) {
          try {
            const parsed = JSON.parse(assignment.assignedUsers);
            if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                if (item?.userId && item?.dutyId === dutyId) {
                  assignedUserIds.add(item.userId);
                }
              });
            }
          } catch {}
        }
        
        numberOfPeople = assignedUserIds.size || 1;
        shiftHours = hours;
        totalHours += hours * numberOfPeople;
      }

      // Aggiorna i totali per giornata e mansione (senza dettagli orari)
      let shiftsToAdd = 0;
      let overtimeToAdd = 0;
      if (!taskTypeIsHourlyService) {
        const calc = calculateShiftAndOvertime(shiftHours, taskTypeShiftHours);
        shiftsToAdd = calc.shifts * numberOfPeople;
        overtimeToAdd = calc.overtimeHours * numberOfPeople;
      }
      const hoursToAdd = taskTypeIsHourlyService ? shiftHours * numberOfPeople : 0;
      
      if (!dailyDetailsMap.has(dateKey)) {
        dailyDetailsMap.set(dateKey, new Map());
      }
      const dateMap = dailyDetailsMap.get(dateKey)!;
      
      if (!dateMap.has(taskTypeId)) {
        dateMap.set(taskTypeId, {
          taskTypeName: taskTypeName,
          totalHours: 0,
          shifts: 0,
          overtimeHours: 0,
        });
      }
      const taskTypeData = dateMap.get(taskTypeId)!;
      taskTypeData.totalHours += taskTypeIsHourlyService ? shiftHours * numberOfPeople : 0;
      taskTypeData.shifts += shiftsToAdd;
      taskTypeData.overtimeHours += overtimeToAdd;
    }

    // Recupera nomi (solo se clientId è specificato)
    let clientName = null;
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { 
          type: true,
          ragioneSociale: true,
          nome: true,
          cognome: true,
        },
      });

      clientName = client?.type === "PRIVATO"
        ? `${client.nome || ""} ${client.cognome || ""}`.trim()
        : client?.ragioneSociale || null;
    }

    let locationName: string | null = null;
    if (locationId) {
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { name: true, city: true },
      });
      locationName = location ? `${location.name}${location.city ? ` (${location.city})` : ''}` : null;
    }

    // Converti i dettagli giornalieri (solo totali per mansione, senza orari)
    const dailyDetails: Array<{
      date: string;
      taskTypes: Array<{
        taskTypeId: string;
        taskTypeName: string;
        isHourlyService: boolean;
        totalHours: number;
        shifts: number;
        overtimeHours: number;
      }>;
    }> = [];

    const sortedDates = Array.from(dailyDetailsMap.keys()).sort();
    
    for (const dateKey of sortedDates) {
      const dateMap = dailyDetailsMap.get(dateKey)!;
      const taskTypes: Array<{
        taskTypeId: string;
        taskTypeName: string;
        isHourlyService: boolean;
        totalHours: number;
        shifts: number;
        overtimeHours: number;
      }> = [];

      for (const [taskTypeId, taskTypeData] of dateMap.entries()) {
        const taskTypeInfo = taskTypeCache.get(taskTypeId) || { name: taskTypeData.taskTypeName, isHourlyService: true, shiftHours: null };
        taskTypes.push({
          taskTypeId,
          taskTypeName: taskTypeData.taskTypeName,
          isHourlyService: taskTypeInfo.isHourlyService ?? true,
          totalHours: taskTypeData.totalHours,
          shifts: taskTypeData.shifts,
          overtimeHours: taskTypeData.overtimeHours,
        });
      }

      taskTypes.sort((a, b) => a.taskTypeName.localeCompare(b.taskTypeName));

      dailyDetails.push({
        date: dateKey,
        taskTypes,
      });
    }

    return NextResponse.json({
      dutyId,
      dutyName: duty.name,
      dutyCode: duty.code,
      clientId,
      clientName: clientName,
      locationId,
      locationName: locationName,
      startDate,
      endDate,
      showBreakTimes,
      totalHours,
      dailyDetails,
    });
  } catch (error) {
    console.error("Error generating duty report:", error);
    return NextResponse.json(
      { error: "Error generating report", details: String(error) },
      { status: 500 }
    );
  }
}
