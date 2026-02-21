import { prisma } from "@/lib/prisma";

function collectDutyKeysFromAssignments(
  assignments: Array<{ assignedUsers?: string | null; personnelRequests?: string | null }>
): Set<string> {
  const dutyKeys = new Set<string>();
  for (const assignment of assignments) {
    const assignedUsersRaw = assignment.assignedUsers;
    if (assignedUsersRaw) {
      try {
        const parsed = JSON.parse(assignedUsersRaw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === "object" && item.dutyId) {
              dutyKeys.add(item.dutyId);
            }
          }
        }
      } catch {}
    }
    const prRaw = assignment.personnelRequests;
    if (prRaw) {
      try {
        const arr = JSON.parse(prRaw);
        if (Array.isArray(arr)) {
          for (const it of arr) {
            const key = it?.dutyId || it?.code || it?.name || it?.duty;
            if (key && typeof key === "string") dutyKeys.add(key);
          }
        }
      } catch {}
    }
  }
  return dutyKeys;
}

function dutiesToMap(duties: Array<{ id: string; code: string; name: string }>): Record<string, string> {
  const map: Record<string, string> = {};
  duties.forEach((d) => {
    if (d.id) map[d.id] = d.name;
    if (d.code) map[d.code] = d.name;
    if (d.name) map[d.name] = d.name;
    if (d.name) map[d.name.toLowerCase?.() ?? d.name] = d.name;
  });
  return map;
}

/**
 * Costruisce la mappa dutyId/code/name -> nome mansione per gli assignments di un workday.
 */
export async function buildDutyIdToNameForAssignments(
  assignments: Array<{
    assignedUsers?: string | null;
    personnelRequests?: string | null;
  }>
): Promise<Record<string, string>> {
  const dutyKeys = collectDutyKeysFromAssignments(assignments);
  const keys = Array.from(dutyKeys);
  if (keys.length === 0) return {};
  const duties = await prisma.duty.findMany({
    where: {
      OR: [
        { id: { in: keys } },
        { code: { in: keys } },
        { name: { in: keys } },
      ],
    },
    select: { id: true, code: true, name: true },
  });
  return dutiesToMap(duties);
}

/**
 * Costruisce dutyIdToName per più workdays in una sola query DB.
 */
export async function buildDutyIdToNameForWorkdays(
  workdays: Array<{
    id: string;
    assignments: Array<{ assignedUsers?: string | null; personnelRequests?: string | null }>;
  }>
): Promise<Record<string, Record<string, string>>> {
  const allKeys = new Set<string>();
  const keysByWorkday: string[][] = [];
  for (const wd of workdays) {
    const keys = collectDutyKeysFromAssignments(wd.assignments || []);
    keysByWorkday.push(Array.from(keys));
    keys.forEach((k) => allKeys.add(k));
  }
  const keysArr = Array.from(allKeys);
  const result: Record<string, Record<string, string>> = {};
  if (keysArr.length === 0) {
    workdays.forEach((wd) => {
      result[wd.id] = {};
    });
    return result;
  }
  const duties = await prisma.duty.findMany({
    where: {
      OR: [
        { id: { in: keysArr } },
        { code: { in: keysArr } },
        { name: { in: keysArr } },
      ],
    },
    select: { id: true, code: true, name: true },
  });
  const globalMap = dutiesToMap(duties);
  workdays.forEach((wd, i) => {
    const wdKeys = keysByWorkday[i];
    const wdMap: Record<string, string> = {};
    wdKeys.forEach((k) => {
      const name = globalMap[k] || globalMap[k.toLowerCase?.()];
      if (name) wdMap[k] = name;
    });
    result[wd.id] = wdMap;
  });
  return result;
}
