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
    let companyId = searchParams.get("companyId"); // Opzionale: filtra per azienda
    const hoursType = searchParams.get("hoursType") || "actual";
    let includeBreaksHourly = searchParams.get("includeBreaksHourly") !== "false"; // solo per servizi orari; servizi a turno mai
    let showBreakTimes = searchParams.get("showBreakTimes") !== "false"; // default true
    const includeDailyDetails = searchParams.get("includeDailyDetails") === "true"; // default false

    // RESPONSABILE: solo la propria azienda, pause sempre incluse e orari pause sempre mostrati
    if (session.user.role === "RESPONSABILE") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      if (!currentUser?.companyId) {
        return NextResponse.json({ error: "Non sei associato ad un'azienda" }, { status: 403 });
      }
      companyId = currentUser.companyId;
      includeBreaksHourly = true;
      showBreakTimes = true;
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Recupera le aziende (tutte o solo quella selezionata)
    const companies = await prisma.company.findMany({
      where: companyId ? { id: companyId } : undefined,
      select: { id: true, ragioneSociale: true },
    });

    // Recupera i workdays nell'intervallo
    const workdays = await prisma.workday.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      select: { id: true },
    });

    const workdayIds = workdays.map(w => w.id);
    if (workdayIds.length === 0) {
      return NextResponse.json({
        startDate,
        endDate,
        companies: companies.map(c => ({
          companyId: c.id,
          companyName: c.ragioneSociale,
          totalHours: 0,
          totalShifts: 0,
          totalOvertimeHours: 0,
          categories: [],
        })),
      });
    }

    // Recupera i workdays con date per i dettagli giornalieri
    const workdaysWithDates = await prisma.workday.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      select: { id: true, date: true },
    });
    const workdayDateMap = new Map<string, Date>();
    workdaysWithDates.forEach(w => {
      workdayDateMap.set(w.id, w.date);
    });

    // Recupera gli Assignment
    const assignments = await prisma.assignment.findMany({
      where: {
        workdayId: { in: workdayIds },
        taskType: { is: { type: "SHIFT" } },
      },
      select: {
        id: true,
        workdayId: true,
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
        personnelRequests: true,
        timeEntries: {
          select: {
            userId: true,
            hoursWorked: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    // Raggruppa per azienda e categoria (mansione)
    const companyDataMap = new Map<string, {
      companyName: string;
      totalHours: number;
      categories: Map<string, { dutyName: string; dutyCode: string; hours: number; shifts: number; overtimeHours: number }>;
      // Dettagli giornalieri: data -> taskTypeId -> Map<shiftKey, shiftData>
      dailyDetails: Map<string, Map<string, Map<string, {
        startTime: string | null;
        endTime: string | null;
        hasScheduledBreak?: boolean;
        scheduledBreakStartTime?: string | null;
        scheduledBreakEndTime?: string | null;
        duties: Map<string, {
          dutyId: string;
          dutyName: string;
          dutyCode: string;
          numberOfPeople: number;
          totalHours: number;
        }>;
        totalHours: number;
        numberOfPeople: number;
        shifts?: number;
        overtimeHours?: number;
      }>>>;
    }>();

    for (const company of companies) {
      companyDataMap.set(company.id, {
        companyName: company.ragioneSociale,
        totalHours: 0,
        categories: new Map(),
        dailyDetails: new Map(),
      });
    }

    // Pre-carica tutti i duty per evitare query multiple
    const allDuties = await prisma.duty.findMany({
      select: { id: true, name: true, code: true },
    });
    const dutyMap = new Map(allDuties.map(d => [d.id, d]));
    const taskTypeCache = new Map<string, { name: string; isHourlyService: boolean | null; shiftHours: number | null }>();

    for (const assignment of assignments) {
      // Estrai dutyId
      const assignmentUserDutyMap = new Map<string, string>();

      if (assignment.assignedUsers) {
        try {
          const parsed = JSON.parse(assignment.assignedUsers);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              if (item?.userId && item?.dutyId) {
                assignmentUserDutyMap.set(item.userId, item.dutyId);
              }
            });
          }
        } catch {}
      }

      if (assignmentUserDutyMap.size === 0 && assignment.personnelRequests) {
        try {
          const parsed = JSON.parse(assignment.personnelRequests);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const firstDutyId = parsed[0]?.dutyId;
            if (firstDutyId) {
              assignment.timeEntries.forEach(te => {
                assignmentUserDutyMap.set(te.userId, firstDutyId);
              });
            }
          }
        } catch {}
      }

      // Gestisci anche userId diretto
      if (assignment.userId && !assignmentUserDutyMap.has(assignment.userId)) {
        // Se c'è un userId diretto ma non è in assignedUsers, non ha dutyId specifico
        assignmentUserDutyMap.set(assignment.userId, "");
      }

      const workdayDate = workdayDateMap.get(assignment.workdayId);
      if (!workdayDate) continue;
      
      const dateKey = workdayDate.toISOString().split('T')[0];
      const taskTypeId = assignment.taskTypeId || "";
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

      if (hoursType === "actual") {
        // Raggruppa per azienda e utente per i dettagli giornalieri
        const companyUserHoursMap = new Map<string, Map<string, number>>();
        
        for (const timeEntry of assignment.timeEntries) {
          const user = await prisma.user.findUnique({
            where: { id: timeEntry.userId },
            select: { companyId: true },
          });

          if (!user?.companyId) continue;

          const companyData = companyDataMap.get(user.companyId);
          if (!companyData) continue;

          const dutyId = assignmentUserDutyMap.get(timeEntry.userId) || "";
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
          
          companyData.totalHours += hours;

          if (!companyData.categories.has(dutyId)) {
            if (dutyId) {
              const duty = dutyMap.get(dutyId);
              if (duty) {
                companyData.categories.set(dutyId, {
                  dutyName: duty.name,
                  dutyCode: duty.code,
                  hours: 0,
                  shifts: 0,
                  overtimeHours: 0,
                });
              }
            } else {
              companyData.categories.set("", {
                dutyName: "Non specificato",
                dutyCode: "",
                hours: 0,
                shifts: 0,
                overtimeHours: 0,
              });
            }
          }
          const categoryData = companyData.categories.get(dutyId);
          if (categoryData) {
            const taskTypeShiftHours = assignment.taskType?.shiftHours ?? null;
            if (taskTypeIsHourlyService) {
              categoryData.hours += hours;
            } else {
              const { shifts: s, overtimeHours: o } = calculateShiftAndOvertime(hours, taskTypeShiftHours);
              categoryData.shifts += s;
              categoryData.overtimeHours += o;
            }
          }
          
          // Per i dettagli giornalieri
          if (!companyUserHoursMap.has(user.companyId)) {
            companyUserHoursMap.set(user.companyId, new Map());
          }
          const userHoursMap = companyUserHoursMap.get(user.companyId)!;
          userHoursMap.set(timeEntry.userId, hours);
        }
        
        // Aggiungi ai dettagli giornalieri per ogni azienda
        let actualStartTime: string | null = null;
        let actualEndTime: string | null = null;
        for (const te of assignment.timeEntries) {
          const st = te.startTime ? String(te.startTime) : null;
          const et = te.endTime ? String(te.endTime) : null;
          if (st) actualStartTime = actualStartTime == null ? st : (st < (actualStartTime as string) ? st : actualStartTime);
          if (et) actualEndTime = actualEndTime == null ? et : (et > (actualEndTime as string) ? et : actualEndTime);
        }
        
        for (const [companyId, userHoursMap] of companyUserHoursMap.entries()) {
          const companyData = companyDataMap.get(companyId);
          if (!companyData) continue;
          
          const shiftKey = `${assignment.startTime || ""}-${assignment.endTime || ""}`;
          const displayStartTime = (hoursType === "actual" && actualStartTime) ? actualStartTime : assignment.startTime;
          const displayEndTime = (hoursType === "actual" && actualEndTime) ? actualEndTime : assignment.endTime;
          const shiftTotalHours = Array.from(userHoursMap.values()).reduce((a, b) => a + b, 0);
          let shifts = 0;
          let overtimeHours = 0;
          if (!taskTypeIsHourlyService) {
            const hoursPerPerson = userHoursMap.size > 0 ? shiftTotalHours / userHoursMap.size : 0;
            const calc = calculateShiftAndOvertime(hoursPerPerson, taskTypeShiftHours);
            shifts = calc.shifts * userHoursMap.size;
            overtimeHours = calc.overtimeHours * userHoursMap.size;
          }
          
          if (includeDailyDetails) {
            if (!companyData.dailyDetails.has(dateKey)) {
              companyData.dailyDetails.set(dateKey, new Map());
            }
            const dateMap = companyData.dailyDetails.get(dateKey)!;
            
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
              duties: new Map(),
              totalHours: shiftTotalHours,
              numberOfPeople: userHoursMap.size,
              shifts,
              overtimeHours,
            });
          }
          const shift = taskTypeMap.get(shiftKey)!;
          
          // Raggruppa per duty
          const dutyHoursInShift = new Map<string, number>();
          const dutyPeopleCount = new Map<string, number>();
          
          for (const [userId, hours] of userHoursMap.entries()) {
            const dutyId = assignmentUserDutyMap.get(userId) || "";
            const current = dutyHoursInShift.get(dutyId) || 0;
            dutyHoursInShift.set(dutyId, current + hours);
            
            const currentPeople = dutyPeopleCount.get(dutyId) || 0;
            dutyPeopleCount.set(dutyId, currentPeople + 1);
          }
          
          for (const [dutyId, hours] of dutyHoursInShift.entries()) {
            const duty = dutyMap.get(dutyId);
            const dutyInfo = duty ? { name: duty.name, code: duty.code } : { name: "Non specificato", code: "" };
            const peopleCount = dutyPeopleCount.get(dutyId) || 0;
            const hoursPerPerson = peopleCount > 0 ? hours / peopleCount : hours;
            
            shift.duties.set(dutyId, {
              dutyId,
              dutyName: dutyInfo.name,
              dutyCode: dutyInfo.code,
              numberOfPeople: peopleCount,
              totalHours: hoursPerPerson,
            });
          }
          }
        }
      } else {
        // Ore previste
        const assignmentHours = calculateHoursFromTimeRange(assignment.startTime, assignment.endTime);
        let hours = assignmentHours;
        if (!includeBreaksForAssignment && assignment.hasScheduledBreak) {
          const breakHours = calculateBreakHours(
            assignment.hasScheduledBreak,
            assignment.scheduledBreakStartTime,
            assignment.scheduledBreakEndTime
          );
          hours = Math.max(0, hours - breakHours);
        }
        
        if (hours > 0) {
          const userIds = new Set<string>();
          if (assignment.assignedUsers) {
            try {
              const parsed = JSON.parse(assignment.assignedUsers);
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  if (item?.userId) userIds.add(item.userId);
                });
              }
            } catch {}
          }
          if (userIds.size === 0) {
            assignment.timeEntries.forEach(te => userIds.add(te.userId));
          }
          if (userIds.size === 0 && assignment.userId) {
            userIds.add(assignment.userId);
          }
          
          const hoursPerUser = hours / Math.max(1, userIds.size);
          
          // Raggruppa per azienda per i dettagli giornalieri
          const companyUserMap = new Map<string, Set<string>>();
          const companyDutyMap = new Map<string, Map<string, number>>();
          
          for (const userId of userIds) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { companyId: true },
            });
            if (!user?.companyId) continue;
            
            const companyData = companyDataMap.get(user.companyId);
            if (!companyData) continue;
            
            const dutyId = assignmentUserDutyMap.get(userId) || "";
            companyData.totalHours += hoursPerUser;
            
            if (!companyData.categories.has(dutyId)) {
              if (dutyId) {
                const duty = dutyMap.get(dutyId);
                if (duty) {
                  companyData.categories.set(dutyId, {
                    dutyName: duty.name,
                    dutyCode: duty.code,
                    hours: 0,
                    shifts: 0,
                    overtimeHours: 0,
                  });
                }
              } else {
                companyData.categories.set("", {
                  dutyName: "Non specificato",
                  dutyCode: "",
                  hours: 0,
                  shifts: 0,
                  overtimeHours: 0,
                });
              }
            }
            const categoryData = companyData.categories.get(dutyId);
            if (categoryData) {
              if (taskTypeIsHourlyService) {
                categoryData.hours += hoursPerUser;
              } else {
                const { shifts: s, overtimeHours: o } = calculateShiftAndOvertime(hoursPerUser, taskTypeShiftHours);
                categoryData.shifts += s;
                categoryData.overtimeHours += o;
              }
            }
            
            // Per i dettagli giornalieri
            if (!companyUserMap.has(user.companyId)) {
              companyUserMap.set(user.companyId, new Set());
              companyDutyMap.set(user.companyId, new Map());
            }
            companyUserMap.get(user.companyId)!.add(userId);
            
            const dutyCount = companyDutyMap.get(user.companyId)!.get(dutyId) || 0;
            companyDutyMap.get(user.companyId)!.set(dutyId, dutyCount + 1);
          }
          
          // Aggiungi ai dettagli giornalieri per ogni azienda
          if (includeDailyDetails) {
            for (const [companyId, userSet] of companyUserMap.entries()) {
              const companyData = companyDataMap.get(companyId);
              if (!companyData) continue;
              
              const shiftKey = `${assignment.startTime || ""}-${assignment.endTime || ""}`;
              
              if (!companyData.dailyDetails.has(dateKey)) {
                companyData.dailyDetails.set(dateKey, new Map());
              }
              const dateMap = companyData.dailyDetails.get(dateKey)!;
            
            if (!dateMap.has(taskTypeId)) {
              dateMap.set(taskTypeId, new Map());
            }
            const taskTypeMap = dateMap.get(taskTypeId)!;
            
            if (!taskTypeMap.has(shiftKey)) {
              let shifts = 0;
              let overtimeHours = 0;
              if (!taskTypeIsHourlyService) {
                const calc = calculateShiftAndOvertime(hours, taskTypeShiftHours);
                shifts = calc.shifts * userSet.size;
                overtimeHours = calc.overtimeHours * userSet.size;
              }
              taskTypeMap.set(shiftKey, {
                startTime: assignment.startTime,
                endTime: assignment.endTime,
                hasScheduledBreak: assignment.hasScheduledBreak || false,
                scheduledBreakStartTime: assignment.scheduledBreakStartTime || null,
                scheduledBreakEndTime: assignment.scheduledBreakEndTime || null,
                duties: new Map(),
                totalHours: hours * userSet.size,
                numberOfPeople: userSet.size,
                shifts,
                overtimeHours,
              });
            }
            const shift = taskTypeMap.get(shiftKey)!;
            
            const dutyCounts = companyDutyMap.get(companyId)!;
            for (const [dutyId, peopleCount] of dutyCounts.entries()) {
              const duty = dutyMap.get(dutyId);
              const dutyInfo = duty ? { name: duty.name, code: duty.code } : { name: "Non specificato", code: "" };
              
              shift.duties.set(dutyId, {
                dutyId,
                dutyName: dutyInfo.name,
                dutyCode: dutyInfo.code,
                numberOfPeople: peopleCount,
                totalHours: hours,
              });
            }
          }
          }
        }
      }
    }

    const companiesData = Array.from(companyDataMap.entries()).map(([companyId, data]) => {
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
            duties: Array<{
              dutyId: string;
              dutyName: string;
              dutyCode: string;
              numberOfPeople: number;
              totalHours: number;
            }>;
            totalHours: number;
            numberOfPeople: number;
          }>;
          totalHours: number;
        }>;
      }> = [];

      const sortedDates = Array.from(data.dailyDetails.keys()).sort();
      
      for (const dateKey of sortedDates) {
        const dateMap = data.dailyDetails.get(dateKey)!;
        const taskTypes: Array<{
          taskTypeId: string;
          taskTypeName: string;
          isHourlyService?: boolean;
          shifts: Array<{
            startTime: string | null;
            endTime: string | null;
            duties: Array<{
              dutyId: string;
              dutyName: string;
              dutyCode: string;
              numberOfPeople: number;
              totalHours: number;
            }>;
            totalHours: number;
            numberOfPeople: number;
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
            duties: Array<{
              dutyId: string;
              dutyName: string;
              dutyCode: string;
              numberOfPeople: number;
              totalHours: number;
            }>;
            totalHours: number;
            numberOfPeople: number;
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
              duties: Array.from(shift.duties.values()),
              totalHours: shift.totalHours,
              numberOfPeople: shift.numberOfPeople,
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

      const categoriesArray = Array.from(data.categories.values()).map(c => ({
        dutyCode: c.dutyCode,
        dutyName: c.dutyName,
        hours: c.hours,
        shifts: c.shifts,
        overtimeHours: c.overtimeHours,
      }));
      const totalShifts = categoriesArray.reduce((sum, c) => sum + (c.shifts || 0), 0);
      const totalOvertimeHours = categoriesArray.reduce((sum, c) => sum + (c.overtimeHours || 0), 0);

      return {
        companyId,
        companyName: data.companyName,
        totalHours: data.totalHours,
        totalShifts,
        totalOvertimeHours,
        categories: categoriesArray,
        dailyDetails,
      };
    });

    return NextResponse.json({
      startDate,
      endDate,
      showBreakTimes,
      companies: companiesData,
    });
  } catch (error) {
    console.error("Error generating company report:", error);
    return NextResponse.json(
      { error: "Error generating report", details: String(error) },
      { status: 500 }
    );
  }
}

