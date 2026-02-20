import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function calculateHoursFromTimeRange(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
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

    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let userId = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const hoursType = searchParams.get("hoursType") || "actual";
    let includeBreaksHourly = searchParams.get("includeBreaksHourly") !== "false"; // solo per servizi orari; servizi a turno mai
    let showBreakTimes = searchParams.get("showBreakTimes") !== "false"; // default true
    const includeDailyDetails = searchParams.get("includeDailyDetails") === "true"; // default false

    // RESPONSABILE: solo i propri dipendenti, pause sempre incluse e orari pause sempre mostrati
    let responsabileCompanyId: string | null = null;
    if (session.user.role === "RESPONSABILE") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      if (!currentUser?.companyId) {
        return NextResponse.json({ error: "Non sei associato ad un'azienda" }, { status: 403 });
      }
      responsabileCompanyId = currentUser.companyId;
      includeBreaksHourly = true;
      showBreakTimes = true;
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    // RESPONSABILE: se userId specificato, verifica che appartenga alla sua azienda
    if (userId && responsabileCompanyId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      });
      if (!targetUser || targetUser.companyId !== responsabileCompanyId) {
        return NextResponse.json({ error: "Non autorizzato ad accedere a questo dipendente" }, { status: 403 });
      }
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Recupera i workdays nell'intervallo
    const workdays = await prisma.workday.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      select: { id: true, date: true },
    });

    const workdayIds = workdays.map(w => w.id);
    if (workdayIds.length === 0) {
      return NextResponse.json({
        startDate,
        endDate,
        employees: [],
      });
    }

    // Recupera tutti gli Assignment (filtriamo dopo per userId se necessario)
    const assignments = await prisma.assignment.findMany({
      where: {
        workdayId: { in: workdayIds },
        taskType: { is: { type: "SHIFT" } },
      },
      select: {
        id: true,
        userId: true,
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
        workday: {
          select: {
            date: true,
            event: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        timeEntries: {
          select: {
            userId: true,
            hoursWorked: true,
            date: true,
            startTime: true,
            endTime: true,
            notes: true,
          },
        },
      },
    });

    // Raggruppa per dipendente
    const employeeMap = new Map<string, {
      userId: string;
      userName: string;
      userCode: string;
      totalHours: number;
      entries: Array<{
        date: string;
        eventTitle: string;
        hours: number;
        startTime: string | null;
        endTime: string | null;
        notes: string | null;
        shifts?: number;
        overtimeHours?: number;
      }>;
      // Dettagli giornalieri: data -> taskTypeId -> Map<shiftKey, shiftData>
      dailyDetails: Map<string, Map<string, Map<string, {
        startTime: string | null;
        endTime: string | null;
        hasScheduledBreak?: boolean;
        scheduledBreakStartTime?: string | null;
        scheduledBreakEndTime?: string | null;
        eventTitle: string;
        totalHours: number;
        notes: string | null;
        shifts?: number;
        overtimeHours?: number;
      }>>>;
    }>();
    
    const taskTypeCache = new Map<string, { name: string; isHourlyService: boolean | null; shiftHours: number | null }>();

    for (const assignment of assignments) {
      const taskTypeIsHourlyService = assignment.taskType?.isHourlyService ?? true;
      const taskTypeShiftHours = assignment.taskType?.shiftHours ?? null;
      const includeBreaksForAssignment = taskTypeIsHourlyService ? includeBreaksHourly : false; // servizi a turno: pause mai incluse
      
      // Gestisci utenti da userId o assignedUsers
      const usersToProcess: string[] = [];

      if (assignment.userId) {
        usersToProcess.push(assignment.userId);
      }

      if (assignment.assignedUsers) {
        try {
          const parsed = JSON.parse(assignment.assignedUsers);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              const uid = typeof item === 'string' ? item : item?.userId;
              if (uid && !usersToProcess.includes(uid)) {
                usersToProcess.push(uid);
              }
            });
          }
        } catch {}
      }

      // Se è specificato un userId, filtra solo quello
      if (userId) {
        if (!usersToProcess.includes(userId)) {
          continue;
        }
      }

      for (const uid of usersToProcess) {
        if (userId && uid !== userId) continue;

        const timeEntries = assignment.timeEntries.filter(te => te.userId === uid);

        if (timeEntries.length === 0) continue;

        if (!employeeMap.has(uid)) {
          const user = await prisma.user.findUnique({
            where: { id: uid },
            select: { name: true, cognome: true, code: true, companyId: true },
          });
          // RESPONSABILE: solo dipendenti della propria azienda
          if (responsabileCompanyId && user?.companyId !== responsabileCompanyId) {
            continue;
          }
          if (user) {
            employeeMap.set(uid, {
              userId: uid,
              userName: `${user.name || ''} ${user.cognome || ''}`.trim(),
              userCode: user.code,
              totalHours: 0,
              entries: [],
              dailyDetails: new Map(),
            });
          }
        }

        const employeeData = employeeMap.get(uid);
        if (!employeeData) continue;

        const taskTypeId = assignment.taskTypeId || "";
        const taskTypeName = assignment.taskType?.name || "Non specificato";
        
        if (!taskTypeCache.has(taskTypeId)) {
          taskTypeCache.set(taskTypeId, {
            name: taskTypeName,
            isHourlyService: taskTypeIsHourlyService,
            shiftHours: taskTypeShiftHours,
          });
        }

        const dateKey = assignment.workday.date.toISOString().split('T')[0];
        const shiftKey = `${assignment.startTime || ""}-${assignment.endTime || ""}`;

        if (hoursType === "actual") {
          const totalShiftHours = timeEntries.reduce((sum, te) => {
            let h = te.hoursWorked;
            const breakH = assignment.hasScheduledBreak
              ? calculateBreakHours(assignment.hasScheduledBreak, assignment.scheduledBreakStartTime, assignment.scheduledBreakEndTime)
              : 0;
            if (includeBreaksForAssignment && breakH > 0) h = h + breakH;
            return sum + h;
          }, 0);
          let entryShifts = 0;
          let entryOvertimeHours = 0;
          if (!taskTypeIsHourlyService) {
            const calc = calculateShiftAndOvertime(totalShiftHours, taskTypeShiftHours);
            const n = Math.max(1, timeEntries.length);
            entryShifts = calc.shifts / n;
            entryOvertimeHours = calc.overtimeHours / n;
          }
          for (const timeEntry of timeEntries) {
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
            
            employeeData.totalHours += hours;
            employeeData.entries.push({
              date: timeEntry.date.toISOString().split('T')[0],
              eventTitle: assignment.workday.event.title,
              hours: hours,
              startTime: timeEntry.startTime,
              endTime: timeEntry.endTime,
              notes: timeEntry.notes,
              shifts: taskTypeIsHourlyService ? undefined : entryShifts,
              overtimeHours: taskTypeIsHourlyService ? undefined : entryOvertimeHours,
            });
          }
          
          // Aggiungi ai dettagli giornalieri - usa ore effettive dai time entries
          if (includeDailyDetails) {
            let actualStartTime: string | null = null;
            let actualEndTime: string | null = null;
            for (const te of timeEntries) {
              const st = te.startTime ? String(te.startTime) : null;
              const et = te.endTime ? String(te.endTime) : null;
              if (st) actualStartTime = actualStartTime == null ? st : (st < (actualStartTime as string) ? st : actualStartTime);
              if (et) actualEndTime = actualEndTime == null ? et : (et > (actualEndTime as string) ? et : actualEndTime);
            }
            const displayStartTime = actualStartTime || assignment.startTime;
            const displayEndTime = actualEndTime || assignment.endTime;
            let shifts = 0;
            let overtimeHours = 0;
            if (!taskTypeIsHourlyService) {
              const calc = calculateShiftAndOvertime(totalShiftHours, taskTypeShiftHours);
              shifts = calc.shifts;
              overtimeHours = calc.overtimeHours;
            }
            
            if (!employeeData.dailyDetails.has(dateKey)) {
              employeeData.dailyDetails.set(dateKey, new Map());
            }
            const dateMap = employeeData.dailyDetails.get(dateKey)!;
            
            if (!dateMap.has(taskTypeId)) {
              dateMap.set(taskTypeId, new Map());
            }
            const taskTypeMap = dateMap.get(taskTypeId)!;
            
            if (!taskTypeMap.has(shiftKey)) {
              taskTypeMap.set(shiftKey, {
                startTime: displayStartTime,
                endTime: displayEndTime,
                hasScheduledBreak: assignment.hasScheduledBreak || false,
                scheduledBreakStartTime: assignment.scheduledBreakStartTime || null,
                scheduledBreakEndTime: assignment.scheduledBreakEndTime || null,
                eventTitle: assignment.workday.event.title,
                totalHours: totalShiftHours,
                notes: timeEntries[0]?.notes || null,
                shifts,
                overtimeHours,
              });
            } else {
              const existing = taskTypeMap.get(shiftKey)!;
              existing.totalHours += totalShiftHours;
              (existing as any).shifts = ((existing as any).shifts || 0) + shifts;
              (existing as any).overtimeHours = ((existing as any).overtimeHours || 0) + overtimeHours;
            }
          }
        } else {
          // Ore previste
          let hours = calculateHoursFromTimeRange(assignment.startTime, assignment.endTime);
          if (!includeBreaksForAssignment && assignment.hasScheduledBreak) {
            const breakHours = calculateBreakHours(
              assignment.hasScheduledBreak,
              assignment.scheduledBreakStartTime,
              assignment.scheduledBreakEndTime
            );
            hours = Math.max(0, hours - breakHours);
          }
          
          if (hours > 0) {
            // Crea una entry per ogni timeEntry o almeno una
            const entriesToCreate = timeEntries.length > 0 ? timeEntries : [{
              userId: uid,
              date: assignment.workday.date,
              startTime: assignment.startTime,
              endTime: assignment.endTime,
              notes: null,
            }];
            
            const hoursPerEntry = hours / entriesToCreate.length;
            
            let entryShifts = 0;
            let entryOvertimeHours = 0;
            if (!taskTypeIsHourlyService) {
              const calc = calculateShiftAndOvertime(hours, taskTypeShiftHours);
              const n = Math.max(1, entriesToCreate.length);
              entryShifts = calc.shifts / n;
              entryOvertimeHours = calc.overtimeHours / n;
            }
            for (const entry of entriesToCreate) {
              employeeData.totalHours += hoursPerEntry;
              employeeData.entries.push({
                date: entry.date.toISOString().split('T')[0],
                eventTitle: assignment.workday.event.title,
                hours: hoursPerEntry,
                startTime: assignment.startTime,
                endTime: assignment.endTime,
                notes: entry.notes,
                shifts: taskTypeIsHourlyService ? undefined : entryShifts,
                overtimeHours: taskTypeIsHourlyService ? undefined : entryOvertimeHours,
              });
            }
            
            // Aggiungi ai dettagli giornalieri
            if (includeDailyDetails) {
              let shifts = 0;
              let overtimeHours = 0;
              if (!taskTypeIsHourlyService) {
                const calc = calculateShiftAndOvertime(hours, taskTypeShiftHours);
                shifts = calc.shifts;
                overtimeHours = calc.overtimeHours;
              }
              
              if (!employeeData.dailyDetails.has(dateKey)) {
                employeeData.dailyDetails.set(dateKey, new Map());
              }
              const dateMap = employeeData.dailyDetails.get(dateKey)!;
              
              if (!dateMap.has(taskTypeId)) {
                dateMap.set(taskTypeId, new Map());
              }
              const taskTypeMap = dateMap.get(taskTypeId)!;
              
              if (!taskTypeMap.has(shiftKey)) {
                taskTypeMap.set(shiftKey, {
                  startTime: assignment.startTime,
                  endTime: assignment.endTime,
                  hasScheduledBreak: assignment.hasScheduledBreak || false,
                  scheduledBreakStartTime: assignment.scheduledBreakStartTime || null,
                  scheduledBreakEndTime: assignment.scheduledBreakEndTime || null,
                  eventTitle: assignment.workday.event.title,
                  totalHours: hours,
                  notes: entriesToCreate[0]?.notes || null,
                  shifts,
                  overtimeHours,
                });
              } else {
                const existing = taskTypeMap.get(shiftKey)!;
                existing.totalHours += hours;
                (existing as any).shifts = ((existing as any).shifts || 0) + shifts;
                (existing as any).overtimeHours = ((existing as any).overtimeHours || 0) + overtimeHours;
              }
            }
          }
        }
      }
    }

    const employees = Array.from(employeeMap.values()).map(e => {
      // Calcola totalShifts e totalOvertimeHours da dailyDetails o da entries
      let totalShifts = 0;
      let totalOvertimeHours = 0;
      if (e.dailyDetails.size > 0) {
        for (const dateMap of e.dailyDetails.values()) {
          for (const taskTypeMap of dateMap.values()) {
            for (const shift of taskTypeMap.values()) {
              const shiftData = shift as any;
              totalShifts += shiftData.shifts ?? 0;
              totalOvertimeHours += shiftData.overtimeHours ?? 0;
            }
          }
        }
      } else {
        for (const entry of e.entries) {
          totalShifts += (entry as any).shifts ?? 0;
          totalOvertimeHours += (entry as any).overtimeHours ?? 0;
        }
      }

      // Converti i dettagli giornalieri
      const dailyDetails: Array<{
        date: string;
        taskTypes: Array<{
          taskTypeId: string;
          taskTypeName: string;
          isHourlyService?: boolean;
          shifts: Array<{
            startTime: string | null;
            endTime: string | null;
            eventTitle: string;
            totalHours: number;
            notes: string | null;
          }>;
          totalHours: number;
        }>;
      }> = [];

      const sortedDates = Array.from(e.dailyDetails.keys()).sort();
      
      for (const dateKey of sortedDates) {
        const dateMap = e.dailyDetails.get(dateKey)!;
        const taskTypes: Array<{
          taskTypeId: string;
          taskTypeName: string;
          isHourlyService?: boolean;
          shifts: Array<{
            startTime: string | null;
            endTime: string | null;
            eventTitle: string;
            totalHours: number;
            notes: string | null;
          }>;
          totalHours: number;
        }> = [];

        for (const [taskTypeId, taskTypeMap] of dateMap.entries()) {
          const taskTypeInfo = taskTypeCache.get(taskTypeId) || { name: "Non specificato", isHourlyService: true, shiftHours: null };
          const shifts: Array<{
            startTime: string | null;
            endTime: string | null;
            hasScheduledBreak?: boolean;
            scheduledBreakStartTime?: string | null;
            scheduledBreakEndTime?: string | null;
            eventTitle: string;
            totalHours: number;
            notes: string | null;
            shifts?: number;
            overtimeHours?: number;
          }> = [];

          for (const shift of taskTypeMap.values()) {
            const shiftData = shift as any;
            shifts.push({
              startTime: shift.startTime,
              endTime: shift.endTime,
              hasScheduledBreak: shiftData.hasScheduledBreak || false,
              scheduledBreakStartTime: shiftData.scheduledBreakStartTime || null,
              scheduledBreakEndTime: shiftData.scheduledBreakEndTime || null,
              eventTitle: shift.eventTitle,
              totalHours: shift.totalHours,
              notes: shift.notes,
              shifts: shiftData.shifts !== undefined ? shiftData.shifts : undefined,
              overtimeHours: shiftData.overtimeHours !== undefined ? shiftData.overtimeHours : undefined,
            });
          }

          shifts.sort((a, b) => {
            const aStart = a.startTime || "";
            const bStart = b.startTime || "";
            return aStart.localeCompare(bStart);
          });

          const totalTaskTypeHours = shifts.reduce((sum, shift) => sum + shift.totalHours, 0);
          
          taskTypes.push({
            taskTypeId,
            taskTypeName: taskTypeInfo.name,
            isHourlyService: taskTypeInfo.isHourlyService ?? true,
            shifts,
            totalHours: totalTaskTypeHours,
          });
        }

        taskTypes.sort((a, b) => a.taskTypeName.localeCompare(b.taskTypeName));

        dailyDetails.push({
          date: dateKey,
          taskTypes,
        });
      }

      const sortedEntries = e.entries.sort((a, b) => a.date.localeCompare(b.date));
      const hasOnlyShiftServices = (totalShifts > 0) && sortedEntries.length > 0 && sortedEntries.every((ent: any) => ent.shifts != null);

      return {
        userId: e.userId,
        userName: e.userName,
        userCode: e.userCode,
        totalHours: e.totalHours,
        totalShifts,
        totalOvertimeHours,
        hasOnlyShiftServices,
        entries: sortedEntries,
        dailyDetails,
      };
    });

    return NextResponse.json({
      startDate,
      endDate,
      showBreakTimes,
      employees,
    });
  } catch (error) {
    console.error("Error generating employee report:", error);
    return NextResponse.json(
      { error: "Error generating report", details: String(error) },
      { status: 500 }
    );
  }
}

