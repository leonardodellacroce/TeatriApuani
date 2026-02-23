import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type NotificationPriority = "HIGH" | "MEDIUM" | "LOW";

/** Tipi notifiche lavoratore */
export const WORKER_NOTIFICATION_TYPES = [
  "MISSING_HOURS_REMINDER",
  "UNAVAILABILITY_CREATED_BY_ADMIN",
  "UNAVAILABILITY_MODIFIED_BY_ADMIN",
  "UNAVAILABILITY_DELETED_BY_ADMIN",
  "UNAVAILABILITY_APPROVED",
  "UNAVAILABILITY_REJECTED",
  "ORE_INSERITE_DA_ADMIN",
  "ORE_MODIFICATE_DA_ADMIN",
  "ORE_ELIMINATE_DA_ADMIN",
] as const;

/** Tipi notifiche admin */
export const ADMIN_NOTIFICATION_TYPES = [
  "ADMIN_LOCKED_ACCOUNTS",
  "UNAVAILABILITY_PENDING_APPROVAL",
  "UNAVAILABILITY_MODIFIED_BY_WORKER",
  "UNAVAILABILITY_DELETED_BY_WORKER",
  "WORKDAY_ISSUES",
] as const;

/** Tipi visibili solo ai SuperAdmin */
export const ADMIN_SUPERADMIN_ONLY_TYPES = ["ADMIN_LOCKED_ACCOUNTS"] as const;

export type WorkerNotificationType = (typeof WORKER_NOTIFICATION_TYPES)[number];
export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

/** Mappa tipo -> priorità */
export const NOTIFICATION_PRIORITY: Record<string, NotificationPriority> = {
  MISSING_HOURS_REMINDER: "HIGH",
  UNAVAILABILITY_CREATED_BY_ADMIN: "MEDIUM",
  UNAVAILABILITY_MODIFIED_BY_ADMIN: "MEDIUM",
  UNAVAILABILITY_DELETED_BY_ADMIN: "MEDIUM",
  UNAVAILABILITY_APPROVED: "LOW",
  UNAVAILABILITY_REJECTED: "HIGH",
  ORE_INSERITE_DA_ADMIN: "MEDIUM",
  ORE_MODIFICATE_DA_ADMIN: "MEDIUM",
  ORE_ELIMINATE_DA_ADMIN: "MEDIUM",
  ADMIN_LOCKED_ACCOUNTS: "HIGH",
  UNAVAILABILITY_PENDING_APPROVAL: "HIGH",
  UNAVAILABILITY_MODIFIED_BY_WORKER: "MEDIUM",
  UNAVAILABILITY_DELETED_BY_WORKER: "MEDIUM",
  WORKDAY_ISSUES: "HIGH",
};

/** Priorità effettiva per visualizzazione (usa tipo se priority non impostata) */
export function getEffectivePriority(
  priority: string | null | undefined,
  type?: string
): string {
  if (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW") return priority;
  if (type && NOTIFICATION_PRIORITY[type]) return NOTIFICATION_PRIORITY[type];
  return "MEDIUM";
}

/** Icona priorità per UI */
export function getPriorityIcon(priority: string | null): string {
  switch (priority) {
    case "HIGH":
      return "!!!";
    case "MEDIUM":
      return "!!";
    case "LOW":
      return "!";
    default:
      return "!!";
  }
}

/** Priorità richiede modal admin? (HIGH o MEDIUM) - fallback quando non c'è setting */
export function isAdminModalPriority(priority: string | null): boolean {
  return priority === "HIGH" || priority === "MEDIUM";
}

/** Restituisce impostazione tipo notifica (isActive, priority, showInDashboardModal). Fallback su default se non esiste. */
export async function getNotificationTypeSetting(type: string): Promise<{
  isActive: boolean;
  priority: string;
  showInDashboardModal: boolean;
  metadata: Record<string, unknown> | null;
} | null> {
  const s = await prisma.notificationTypeSetting.findUnique({
    where: { type },
  });
  if (!s) return null;
  return {
    isActive: s.isActive,
    priority: s.priority,
    showInDashboardModal: s.showInDashboardModal,
    metadata: (s.metadata as Record<string, unknown>) ?? null,
  };
}

/** Priorità da usare per creazione notifiche (da impostazioni o fallback) */
async function getPriorityForType(type: string): Promise<string> {
  const s = await getNotificationTypeSetting(type);
  return s?.priority ?? NOTIFICATION_PRIORITY[type] ?? "MEDIUM";
}

/** Verifica se il tipo notifica è attivo (crea se setting non esiste) */
async function isNotificationTypeActive(type: string): Promise<boolean> {
  const s = await getNotificationTypeSetting(type);
  return s === null || s.isActive;
}

const GROUPING_WINDOW_MS = 15 * 60 * 1000; // 15 minuti

/** Verifica se l'utente riceve notifiche lavoratore: solo isWorker=true (anche per admin che sono anche lavoratori) */
async function shouldNotifyWorker(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorker: true },
  });
  return user?.isWorker === true;
}

/** Trova notifica raggruppabile (stesso userId, stesso tipo, entro 15 min, non letta) */
async function findGroupableNotification(
  userId: string,
  type: string
): Promise<{ id: string; message: string; metadata: unknown } | null> {
  const cutoff = new Date(Date.now() - GROUPING_WINDOW_MS);
  const n = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      read: false,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
  });
  return n;
}

const UNAV_TYPES = ["UNAVAILABILITY_CREATED_BY_ADMIN", "UNAVAILABILITY_MODIFIED_BY_ADMIN", "UNAVAILABILITY_DELETED_BY_ADMIN"];
const ORE_TYPES = ["ORE_INSERITE_DA_ADMIN", "ORE_MODIFICATE_DA_ADMIN", "ORE_ELIMINATE_DA_ADMIN"];

/** Rimuove ~~vecchio~~ da un dettaglio, lasciando solo i valori finali. Usato quando Crea→Modifica o Inserisci→Modifica: il lavoratore non ha visto lo stato iniziale, mostriamo solo i dati attuali. */
function stripStrikethroughFromDetail(detail: string): string {
  return detail.replace(/~~[^~]+~~\s*/g, "");
}

/** Estrae entityKeys da metadata (supporta entityKey singolo per retrocompat) */
function getEntityKeys(meta: { entityKey?: string; entityKeys?: string[] } | null): string[] {
  if (!meta) return [];
  if (meta.entityKeys && Array.isArray(meta.entityKeys)) return meta.entityKeys;
  if (meta.entityKey) return [meta.entityKey];
  return [];
}

/** Trova notifiche non lette che contengono l'entità (entityKey o in entityKeys) negli ultimi 15 min */
async function findEntityNotifications(
  userId: string,
  entityKey: string,
  types: string[]
): Promise<{ id: string; type: string; message: string; metadata: unknown }[]> {
  const cutoff = new Date(Date.now() - GROUPING_WINDOW_MS);
  const list = await prisma.notification.findMany({
    where: {
      userId,
      read: false,
      createdAt: { gte: cutoff },
      type: { in: types },
    },
    orderBy: { createdAt: "asc" },
  });
  return list.filter((n) => {
    const meta = n.metadata as { entityKey?: string; entityKeys?: string[] } | null;
    return meta?.entityKey === entityKey || meta?.entityKeys?.includes(entityKey);
  });
}

/** Crea o aggiorna notifica per lavoratore (indisponibilità) con raggruppamento 15 min.
 * Notifica sempre il proprietario dell'indisponibilità (non solo isWorker), perché
 * chi ha un'indisponibilità deve essere informato quando l'admin la crea/modifica/elimina.
 * entityKey: se fornito (es. unav:${id}), applica merge/suppressione: Crea→Elimina = nessuna notifica; Crea→Modifica = una sola con dati finali. */
export async function notifyWorkerUnavailability(
  userId: string,
  action: "CREATED" | "MODIFIED" | "DELETED",
  count: number,
  detail?: string,
  entityKey?: string
): Promise<void> {
  const typeMap = {
    CREATED: "UNAVAILABILITY_CREATED_BY_ADMIN",
    MODIFIED: "UNAVAILABILITY_MODIFIED_BY_ADMIN",
    DELETED: "UNAVAILABILITY_DELETED_BY_ADMIN",
  };
  const type = typeMap[action];
  if (!(await isNotificationTypeActive(type))) return;
  const priority = await getPriorityForType(type);

  const messages = {
    CREATED: count === 1 ? "Un amministratore ha inserito un'indisponibilità per te." : `Hai ricevuto ${count} indisponibilità inserite da un amministratore.`,
    MODIFIED: count === 1 ? "Un amministratore ha modificato un'indisponibilità." : `Un amministratore ha modificato ${count} indisponibilità.`,
    DELETED: count === 1 ? "Un amministratore ha eliminato un'indisponibilità." : `Un amministratore ha eliminato ${count} indisponibilità.`,
  };

  if (entityKey) {
    const existingList = await findEntityNotifications(userId, entityKey, UNAV_TYPES);
    const firstType = existingList[0]?.type;
    const isFirstCreated = firstType === "UNAVAILABILITY_CREATED_BY_ADMIN";

    if (action === "DELETED" && isFirstCreated) {
      const toUpdate = existingList[0];
      const meta = (toUpdate.metadata as { entityKey?: string; entityKeys?: string[]; count?: number; details?: string[] }) || {};
      const entityKeys = getEntityKeys(meta);
      const existingDetails = meta.details || (toUpdate.message.includes("Periodo:") ? toUpdate.message.split("\n\n").slice(1) : []);
      const idx = entityKeys.indexOf(entityKey);
      if (idx >= 0 && entityKeys.length > 1) {
        const newEntityKeys = entityKeys.filter((_, i) => i !== idx);
        const newDetails = existingDetails.filter((_, i) => i !== idx);
        const baseMsg = newDetails.length === 1 ? "Un amministratore ha inserito un'indisponibilità per te." : `Hai ricevuto ${newDetails.length} indisponibilità inserite da un amministratore.`;
        const msg = newDetails.length > 0 ? `${baseMsg}\n\n${newDetails.join("\n\n")}` : baseMsg;
        const delMeta: Record<string, unknown> = { ...meta, entityKeys: newEntityKeys, count: newDetails.length, details: newDetails };
        delete delMeta.entityKey;
        await prisma.notification.update({
          where: { id: toUpdate.id },
          data: {
            message: msg,
            metadata: delMeta as Prisma.InputJsonValue,
            createdAt: new Date(),
          },
        });
        for (let i = 1; i < existingList.length; i++) {
          await prisma.notification.delete({ where: { id: existingList[i].id } });
        }
      } else {
        for (const n of existingList) {
          await prisma.notification.delete({ where: { id: n.id } });
        }
      }
      return;
    }

    if (action === "MODIFIED" && existingList.length > 0) {
      const toUpdate = existingList[0];
      const meta = (toUpdate.metadata as { entityKey?: string; entityKeys?: string[]; count?: number; details?: string[] }) || {};
      const entityKeys = getEntityKeys(meta);
      const existingDetails = meta.details || (toUpdate.message.includes("Periodo:") ? toUpdate.message.split("\n\n").slice(1) : []);
      const idx = entityKeys.indexOf(entityKey);
      let newDetails: string[];
      if (idx >= 0 && detail) {
        const displayDetail = isFirstCreated ? stripStrikethroughFromDetail(detail) : detail;
        newDetails = [...existingDetails];
        newDetails[idx] = displayDetail;
      } else {
        newDetails = detail ? (isFirstCreated ? [stripStrikethroughFromDetail(detail)] : [detail]) : [];
      }
      const baseMsg = isFirstCreated
        ? (newDetails.length === 1 ? "Un amministratore ha inserito un'indisponibilità per te." : `Hai ricevuto ${newDetails.length} indisponibilità inserite da un amministratore.`)
        : (newDetails.length === 1 ? "Un amministratore ha modificato un'indisponibilità." : `Un amministratore ha modificato ${newDetails.length} indisponibilità.`);
      const msg = newDetails.length > 0 ? `${baseMsg}\n\n${newDetails.join("\n\n")}` : baseMsg;
      const newType = isFirstCreated ? "UNAVAILABILITY_CREATED_BY_ADMIN" : type;
      const updateMeta = { ...meta, entityKeys, count: newDetails.length, details: newDetails };
      delete (updateMeta as Record<string, unknown>).entityKey;
      await prisma.notification.update({
        where: { id: toUpdate.id },
        data: {
          type: newType,
          title: isFirstCreated ? "Indisponibilità inserita" : "Indisponibilità modificata",
          message: msg,
          metadata: updateMeta as Prisma.InputJsonValue,
          priority,
          createdAt: new Date(),
        },
      });
      for (let i = 1; i < existingList.length; i++) {
        await prisma.notification.delete({ where: { id: existingList[i].id } });
      }
      return;
    }

    if (action === "CREATED" && existingList.length > 0) {
      const toUpdate = existingList[0];
      const meta = (toUpdate.metadata as { entityKey?: string; entityKeys?: string[]; count?: number; details?: string[] }) || {};
      const existingEntityKeys = getEntityKeys(meta);
      const newEntityKeys = [...existingEntityKeys, ...Array(count).fill(entityKey)];
      const newCount = (meta.count || 1) + count;
      const baseMsg = newCount === 1 ? "Un amministratore ha inserito un'indisponibilità per te." : `Hai ricevuto ${newCount} indisponibilità inserite da un amministratore.`;
      const existingDetails = meta.details || (toUpdate.message.includes("Periodo:") ? toUpdate.message.split("\n\n").slice(1) : []);
      const allDetails = detail ? [...existingDetails, detail] : existingDetails;
      const msg = allDetails.length > 0 ? `${baseMsg}\n\n${allDetails.join("\n\n")}` : baseMsg;
      const updateMeta: Record<string, unknown> = { ...meta, entityKeys: newEntityKeys, count: newCount, details: allDetails };
      delete updateMeta.entityKey;
      await prisma.notification.update({
        where: { id: toUpdate.id },
        data: { message: msg, metadata: updateMeta as Prisma.InputJsonValue, priority, createdAt: new Date() },
      });
      for (let i = 1; i < existingList.length; i++) {
        await prisma.notification.delete({ where: { id: existingList[i].id } });
      }
      return;
    }
  }

  const existing = await findGroupableNotification(userId, type);
  if (existing) {
    const meta = (existing.metadata as { entityKey?: string; entityKeys?: string[]; count?: number; details?: string[] }) || {};
    const newCount = (meta.count || 1) + count;
    const baseMsg = action === "CREATED"
      ? (newCount === 1 ? "Un amministratore ha inserito un'indisponibilità per te." : `Hai ricevuto ${newCount} indisponibilità inserite da un amministratore.`)
      : action === "MODIFIED"
      ? (newCount === 1 ? "Un amministratore ha modificato un'indisponibilità." : `Un amministratore ha modificato ${newCount} indisponibilità.`)
      : (newCount === 1 ? "Un amministratore ha eliminato un'indisponibilità." : `Un amministratore ha eliminato ${newCount} indisponibilità.`);
    const existingDetails =
      meta.details ||
      (existing.message.includes("Periodo:")
        ? existing.message.split("\n\n").slice(1)
        : []);
    const allDetails = detail ? [...existingDetails, detail] : existingDetails;
    const msg = allDetails.length > 0 ? `${baseMsg}\n\n${allDetails.join("\n\n")}` : baseMsg;
    const updateMeta: Record<string, unknown> = { ...meta, count: newCount, details: allDetails };
    if (entityKey) {
      const existingKeys = getEntityKeys(meta);
      updateMeta.entityKeys = [...existingKeys, ...Array(count).fill(entityKey)];
      delete updateMeta.entityKey;
    }
    await prisma.notification.update({
      where: { id: existing.id },
      data: { message: msg, metadata: updateMeta as Prisma.InputJsonValue, priority, createdAt: new Date() },
    });
  } else {
    const details = detail ? [detail] : [];
    const baseMsg = messages[action];
    const msg = detail ? `${baseMsg}\n\n${detail}` : baseMsg;
    const meta: Record<string, unknown> = { count, details };
    if (entityKey) meta.entityKeys = Array(count).fill(entityKey);
    const titleMap = { CREATED: "Indisponibilità inserita", MODIFIED: "Indisponibilità modificata", DELETED: "Indisponibilità eliminata" };
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: titleMap[action],
        message: msg,
        metadata: meta as Prisma.InputJsonValue,
        priority,
        read: false,
      },
    });
  }
}

/** Costruisce dettaglio turno per notifiche ore (Data, Orario, Evento, Località, Tipo turno) */
export function buildShiftDetailForNotification(assignment: {
  startTime?: string | null;
  endTime?: string | null;
  workday?: { date: Date | string; event?: { title?: string } | null; location?: { name?: string } | null } | null;
  taskType?: { name?: string } | null;
}): { detail: string; dateFrom?: string } {
  const wd = assignment.workday;
  const wdDate = wd?.date ? (wd.date instanceof Date ? wd.date : new Date(wd.date)) : null;
  const dateStr = wdDate
    ? wdDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const dateFrom = wdDate
    ? wdDate.toLocaleDateString("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    : undefined;
  const timeRange =
    assignment.startTime && assignment.endTime
      ? `${assignment.startTime} - ${assignment.endTime}`
      : assignment.startTime
        ? `dalle ${assignment.startTime}`
        : assignment.endTime
          ? `fino alle ${assignment.endTime}`
          : "Tutto il giorno";
  const parts = [`Data: ${dateStr}`, `Orario: ${timeRange}`];
  const eventTitle = wd?.event?.title;
  if (eventTitle) parts.push(`Evento: ${eventTitle}`);
  const locName = wd?.location?.name;
  if (locName) parts.push(`Località: ${locName}`);
  const taskName = assignment.taskType?.name;
  if (taskName) parts.push(`Tipo turno: ${taskName}`);
  return { detail: parts.join("\n"), dateFrom };
}

/** Formato orario per time entry (ore effettive) */
function formatTimeEntryRange(start: string | null, end: string | null): string {
  if (start && end) return `${start} - ${end}`;
  if (start) return `dalle ${start}`;
  if (end) return `fino alle ${end}`;
  return "Tutto il giorno";
}

/** Dettaglio per ORE_MODIFICATE_DA_ADMIN: ore originali barrate (~~...~~) e ore attuali */
export function buildShiftDetailForModifiedNotification(
  assignment: {
    workday?: { date: Date | string; event?: { title?: string } | null; location?: { name?: string } | null } | null;
    taskType?: { name?: string } | null;
  },
  oldStartTime: string | null,
  oldEndTime: string | null,
  newStartTime: string | null,
  newEndTime: string | null
): { detail: string; dateFrom?: string } {
  const wd = assignment.workday;
  const wdDate = wd?.date ? (wd.date instanceof Date ? wd.date : new Date(wd.date)) : null;
  const dateStr = wdDate
    ? wdDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const dateFrom = wdDate
    ? wdDate.toLocaleDateString("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    : undefined;
  const oldRange = formatTimeEntryRange(oldStartTime, oldEndTime);
  const newRange = formatTimeEntryRange(newStartTime, newEndTime);
  const orarioLine = `Orario: ~~${oldRange}~~ ${newRange}`;
  const parts = [`Data: ${dateStr}`, orarioLine];
  const eventTitle = wd?.event?.title;
  if (eventTitle) parts.push(`Evento: ${eventTitle}`);
  const locName = wd?.location?.name;
  if (locName) parts.push(`Località: ${locName}`);
  const taskName = assignment.taskType?.name;
  if (taskName) parts.push(`Tipo turno: ${taskName}`);
  return { detail: parts.join("\n"), dateFrom };
}

/** Crea o aggiorna notifica per lavoratore (ore) con raggruppamento 15 min.
 * detail: dettagli del turno (es. "Data: 22/02/2026\nOrario: 09:00 - 18:00\nEvento: ...").
 * metadata può includere dateFrom, dateTo (YYYY-MM-DD) per il link Visualizza.
 * entityKey: se fornito (es. ore:${assignmentId}:${userId}), applica merge/suppressione: Inserisci→Elimina = nessuna notifica; Inserisci→Modifica = una sola con dati finali. */
export async function notifyWorkerHours(
  userId: string,
  action: "INSERTED" | "MODIFIED" | "DELETED",
  count: number,
  detail?: string,
  metadataExtra?: { dateFrom?: string; dateTo?: string },
  entityKey?: string
): Promise<void> {
  if (!(await shouldNotifyWorker(userId))) return;
  const typeMap = {
    INSERTED: "ORE_INSERITE_DA_ADMIN",
    MODIFIED: "ORE_MODIFICATE_DA_ADMIN",
    DELETED: "ORE_ELIMINATE_DA_ADMIN",
  };
  const type = typeMap[action];
  if (!(await isNotificationTypeActive(type))) return;
  const priority = await getPriorityForType(type);

  const messages = {
    INSERTED: count === 1 ? "Un amministratore ha inserito le ore per un turno al posto tuo." : `Un amministratore ha inserito le ore per ${count} turni al posto tuo.`,
    MODIFIED: count === 1 ? "Un amministratore ha modificato le ore che avevi inserito." : `Un amministratore ha modificato le ore per ${count} turni.`,
    DELETED: count === 1 ? "Un amministratore ha eliminato le ore che avevi inserito." : `Un amministratore ha eliminato le ore per ${count} turni.`,
  };

  if (entityKey) {
    const existingList = await findEntityNotifications(userId, entityKey, ORE_TYPES);
    const firstType = existingList[0]?.type;
    const isFirstInserted = firstType === "ORE_INSERITE_DA_ADMIN";

    if (action === "DELETED" && isFirstInserted) {
      const toUpdate = existingList[0];
      const meta = (toUpdate.metadata as { entityKey?: string; entityKeys?: string[]; details?: string[] }) || {};
      const entityKeys = getEntityKeys(meta);
      const existingDetails = meta.details || (toUpdate.message.includes("Data:") ? toUpdate.message.split("\n\n").slice(1) : []);
      const idx = entityKeys.indexOf(entityKey);
      if (idx >= 0 && entityKeys.length > 1) {
        const newEntityKeys = entityKeys.filter((_, i) => i !== idx);
        const newDetails = existingDetails.filter((_, i) => i !== idx);
        const baseMsg = newDetails.length === 1 ? "Un amministratore ha inserito le ore per un turno al posto tuo." : `Un amministratore ha inserito le ore per ${newDetails.length} turni al posto tuo.`;
        const msg = newDetails.length > 0 ? `${baseMsg}\n\n${newDetails.join("\n\n")}` : baseMsg;
        const mergedMeta: Record<string, unknown> = { ...meta, entityKeys: newEntityKeys, count: newDetails.length, details: newDetails };
        delete mergedMeta.entityKey;
        if (metadataExtra?.dateFrom) mergedMeta.dateFrom = metadataExtra.dateFrom;
        if (metadataExtra?.dateTo) mergedMeta.dateTo = metadataExtra.dateTo;
        await prisma.notification.update({
          where: { id: toUpdate.id },
          data: { message: msg, metadata: mergedMeta as Prisma.InputJsonValue, createdAt: new Date() },
        });
        for (let i = 1; i < existingList.length; i++) {
          await prisma.notification.delete({ where: { id: existingList[i].id } });
        }
      } else {
        for (const n of existingList) {
          await prisma.notification.delete({ where: { id: n.id } });
        }
      }
      return;
    }

    if (action === "MODIFIED" && existingList.length > 0) {
      const toUpdate = existingList[0];
      const meta = (toUpdate.metadata as { entityKey?: string; entityKeys?: string[]; details?: string[]; dateFrom?: string; dateTo?: string }) || {};
      const entityKeys = getEntityKeys(meta);
      const existingDetails = meta.details || (toUpdate.message.includes("Data:") ? toUpdate.message.split("\n\n").slice(1) : []);
      const idx = entityKeys.indexOf(entityKey);
      let newDetails: string[];
      if (idx >= 0 && detail) {
        const displayDetail = isFirstInserted ? stripStrikethroughFromDetail(detail) : detail;
        newDetails = [...existingDetails];
        newDetails[idx] = displayDetail;
      } else {
        newDetails = detail ? (isFirstInserted ? [stripStrikethroughFromDetail(detail)] : [detail]) : [];
      }
      const baseMsg = isFirstInserted
        ? (newDetails.length === 1 ? "Un amministratore ha inserito le ore per un turno al posto tuo." : `Un amministratore ha inserito le ore per ${newDetails.length} turni al posto tuo.`)
        : (newDetails.length === 1 ? "Un amministratore ha modificato le ore che avevi inserito." : `Un amministratore ha modificato le ore per ${newDetails.length} turni.`);
      const msg = newDetails.length > 0 ? `${baseMsg}\n\n${newDetails.join("\n\n")}` : baseMsg;
      const newType = isFirstInserted ? "ORE_INSERITE_DA_ADMIN" : type;
      const mergedMeta: Record<string, unknown> = { ...meta, entityKeys, count: newDetails.length, details: newDetails };
      delete mergedMeta.entityKey;
      if (metadataExtra?.dateFrom) mergedMeta.dateFrom = metadataExtra.dateFrom;
      if (metadataExtra?.dateTo) mergedMeta.dateTo = metadataExtra.dateTo;
      await prisma.notification.update({
        where: { id: toUpdate.id },
        data: {
          type: newType,
          title: isFirstInserted ? "Ore lavorate inserite" : "Ore lavorate modificate",
          message: msg,
          metadata: mergedMeta as Prisma.InputJsonValue,
          priority,
          createdAt: new Date(),
        },
      });
      for (let i = 1; i < existingList.length; i++) {
        await prisma.notification.delete({ where: { id: existingList[i].id } });
      }
      return;
    }

    if (action === "INSERTED" && existingList.length > 0) {
      const toUpdate = existingList[0];
      const meta = (toUpdate.metadata as { entityKey?: string; entityKeys?: string[]; count?: number; details?: string[]; dateFrom?: string; dateTo?: string }) || {};
      const existingEntityKeys = getEntityKeys(meta);
      const newEntityKeys = [...existingEntityKeys, ...Array(count).fill(entityKey)];
      const newCount = (meta.count || 1) + count;
      const baseMsg = newCount === 1 ? "Un amministratore ha inserito le ore per un turno al posto tuo." : `Un amministratore ha inserito le ore per ${newCount} turni al posto tuo.`;
      const existingDetails = meta.details || (toUpdate.message.includes("Data:") ? toUpdate.message.split("\n\n").slice(1) : []);
      const allDetails = detail ? [...existingDetails, detail] : existingDetails;
      const msg = allDetails.length > 0 ? `${baseMsg}\n\n${allDetails.join("\n\n")}` : baseMsg;
      const mergedMeta: Record<string, unknown> = { ...meta, entityKeys: newEntityKeys, count: newCount, details: allDetails };
      delete mergedMeta.entityKey;
      if (metadataExtra?.dateFrom) mergedMeta.dateFrom = metadataExtra.dateFrom;
      if (metadataExtra?.dateTo) mergedMeta.dateTo = metadataExtra.dateTo;
      await prisma.notification.update({
        where: { id: toUpdate.id },
        data: { message: msg, metadata: mergedMeta as Prisma.InputJsonValue, priority, createdAt: new Date() },
      });
      for (let i = 1; i < existingList.length; i++) {
        await prisma.notification.delete({ where: { id: existingList[i].id } });
      }
      return;
    }
  }

  const existing = await findGroupableNotification(userId, type);
  if (existing) {
    const meta = (existing.metadata as { entityKey?: string; entityKeys?: string[]; count?: number; details?: string[]; dateFrom?: string; dateTo?: string }) || {};
    const newCount = (meta.count || 1) + count;
    const existingDetails =
      meta.details ||
      (existing.message.includes("Data:") ? existing.message.split("\n\n").slice(1) : []);
    const allDetails = detail ? [...existingDetails, detail] : existingDetails;
    const baseMsg = action === "INSERTED"
      ? (newCount === 1 ? "Un amministratore ha inserito le ore per un turno al posto tuo." : `Un amministratore ha inserito le ore per ${newCount} turni al posto tuo.`)
      : action === "MODIFIED"
      ? (newCount === 1 ? "Un amministratore ha modificato le ore che avevi inserito." : `Un amministratore ha modificato le ore per ${newCount} turni.`)
      : (newCount === 1 ? "Un amministratore ha eliminato le ore che avevi inserito." : `Un amministratore ha eliminato le ore per ${newCount} turni.`);
    const msg = allDetails.length > 0 ? `${baseMsg}\n\n${allDetails.join("\n\n")}` : baseMsg;
    const mergedMeta: Record<string, unknown> = { ...meta, count: newCount, details: allDetails };
    if (entityKey) {
      const existingKeys = getEntityKeys(meta);
      mergedMeta.entityKeys = [...existingKeys, ...Array(count).fill(entityKey)];
      delete mergedMeta.entityKey;
    }
    if (metadataExtra?.dateFrom) mergedMeta.dateFrom = metadataExtra.dateFrom;
    if (metadataExtra?.dateTo) mergedMeta.dateTo = metadataExtra.dateTo;
    await prisma.notification.update({
      where: { id: existing.id },
      data: { message: msg, metadata: mergedMeta as Prisma.InputJsonValue, createdAt: new Date() },
    });
  } else {
    const details = detail ? [detail] : [];
    const baseMsg = messages[action];
    const msg = detail ? `${baseMsg}\n\n${detail}` : baseMsg;
    const meta: Record<string, unknown> = count > 1 ? { count } : {};
    if (details.length) meta.details = details;
    if (entityKey) meta.entityKeys = Array(count).fill(entityKey);
    if (metadataExtra?.dateFrom) meta.dateFrom = metadataExtra.dateFrom;
    if (metadataExtra?.dateTo) meta.dateTo = metadataExtra.dateTo;
    const titleMap = { INSERTED: "Ore lavorate inserite", MODIFIED: "Ore lavorate modificate", DELETED: "Ore lavorate eliminate" };
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: titleMap[action],
        message: msg,
        metadata: Object.keys(meta).length > 0 ? (meta as Prisma.InputJsonValue) : undefined,
        priority,
        read: false,
      },
    });
  }
}

/** Notifica lavoratore: indisponibilità approvata. Include data/periodo, raggruppa entro 15 min. */
export async function notifyWorkerUnavailabilityApproved(userId: string, detail?: string): Promise<void> {
  const type = "UNAVAILABILITY_APPROVED";
  if (!(await isNotificationTypeActive(type))) return;
  const priority = await getPriorityForType(type);
  const baseMsg = "La tua indisponibilità è stata approvata.";
  const fullMsg = detail ? `${baseMsg}\n\n${detail}` : baseMsg;

  const existing = await findGroupableNotification(userId, type);
  if (existing) {
    const meta = (existing.metadata as { count?: number; details?: string[] }) || {};
    const newCount = (meta.count || 1) + 1;
    const existingDetails =
      meta.details ||
      (existing.message.includes("Periodo:") || existing.message.includes("Data:")
        ? existing.message.split("\n\n").slice(1)
        : []);
    const allDetails = detail ? [...existingDetails, detail] : existingDetails;
    const msg =
      newCount === 1
        ? fullMsg
        : allDetails.length > 0
          ? `${newCount} indisponibilità approvate.\n\n${allDetails.join("\n\n")}`
          : `${newCount} indisponibilità approvate.`;
    await prisma.notification.update({
      where: { id: existing.id },
      data: { message: msg, metadata: { ...meta, count: newCount, details: allDetails }, priority, createdAt: new Date() },
    });
  } else {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: "Indisponibilità approvata",
        message: fullMsg,
        metadata: detail ? { count: 1, details: [detail] } : undefined,
        priority,
        read: false,
      },
    });
  }
}

/** Notifica lavoratore: indisponibilità rifiutata. Include data/periodo, raggruppa entro 15 min. */
export async function notifyWorkerUnavailabilityRejected(userId: string, detail?: string): Promise<void> {
  const type = "UNAVAILABILITY_REJECTED";
  if (!(await isNotificationTypeActive(type))) return;
  const priority = await getPriorityForType(type);
  const baseMsg = "La tua indisponibilità non è stata approvata.";
  const fullMsg = detail ? `${baseMsg}\n\n${detail}` : baseMsg;

  const existing = await findGroupableNotification(userId, type);
  if (existing) {
    const meta = (existing.metadata as { count?: number; details?: string[] }) || {};
    const newCount = (meta.count || 1) + 1;
    const existingDetails =
      meta.details ||
      (existing.message.includes("Periodo:") || existing.message.includes("Data:")
        ? existing.message.split("\n\n").slice(1)
        : []);
    const allDetails = detail ? [...existingDetails, detail] : existingDetails;
    const msg =
      newCount === 1
        ? fullMsg
        : allDetails.length > 0
          ? `${newCount} indisponibilità non approvate.\n\n${allDetails.join("\n\n")}`
          : `${newCount} indisponibilità non approvate.`;
    await prisma.notification.update({
      where: { id: existing.id },
      data: { message: msg, metadata: { ...meta, count: newCount, details: allDetails }, priority, createdAt: new Date() },
    });
  } else {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: "Indisponibilità non approvata",
        message: fullMsg,
        metadata: detail ? { count: 1, details: [detail] } : undefined,
        priority,
        read: false,
      },
    });
  }
}

function adminShouldReceiveUnavailabilityNotification(
  pref: { companyIds: string | null } | null,
  workerCompanyId?: string | null
): boolean {
  if (!workerCompanyId) return true;
  const companyIds = pref?.companyIds ? (JSON.parse(pref.companyIds) as string[]) : [];
  if (companyIds.length === 0) return true;
  return companyIds.includes(workerCompanyId);
}

/** Notifica admin: indisponibilità in conflitto (worker comunica). RESPONSABILE solo se stessa azienda. Filtra per preferenze companyIds.
 * Mostra dettagli (periodo, orario, eventi). Se più di una in 15 min, raggruppa in una sola notifica. */
export async function notifyAdminsUnavailabilityPending(
  workerName: string,
  detail?: string,
  workerCompanyId?: string | null
): Promise<void> {
  const type = "UNAVAILABILITY_PENDING_APPROVAL";
  if (!(await isNotificationTypeActive(type))) return;
  const priority = await getPriorityForType(type);
  const responsabileFilter = workerCompanyId
    ? { isResponsabile: true, companyId: workerCompanyId }
    : { isResponsabile: true };
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      isArchived: false,
      OR: [{ isSuperAdmin: true }, { isAdmin: true }, responsabileFilter],
    },
    select: { id: true },
  });

  const prefs = await prisma.adminNotificationPreference.findMany({
    where: { userId: { in: admins.map((a) => a.id) } },
    select: { userId: true, companyIds: true },
  });
  const prefByUserId = new Map(prefs.map((p) => [p.userId, p]));

  const baseMsg = `${workerName} ha comunicato un'indisponibilità in conflitto con turni assegnati. Approva dalla sezione Indisponibilità.`;
  const itemBlock = detail ? `[${workerName}]\n${detail}` : workerName;
  const singleMessage = detail ? `${baseMsg}\n\n${detail}` : baseMsg;

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  for (const admin of admins) {
    if (!adminShouldReceiveUnavailabilityNotification(prefByUserId.get(admin.id) ?? null, workerCompanyId)) {
      continue;
    }
    const existing = await prisma.notification.findFirst({
      where: {
        userId: admin.id,
        type: "UNAVAILABILITY_PENDING_APPROVAL",
        read: false,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });
    if (existing) {
      const meta = (existing.metadata as { count?: number; details?: string[] }) || {};
      const prevCount = meta.count ?? 1;
      const prevDetails = meta.details ?? (existing.message.includes("\n\n") ? [existing.message.split("\n\n").slice(1).join("\n\n")] : []);
      const newCount = prevCount + 1;
      const allDetails = [...prevDetails, itemBlock].filter(Boolean);
      const msg = newCount === 1
        ? singleMessage
        : `${newCount} indisponibilità in attesa di approvazione.\n\n${allDetails.join("\n\n---\n\n")}`;
      await prisma.notification.update({
        where: { id: existing.id },
        data: {
          message: msg,
          metadata: { count: newCount, details: allDetails },
          createdAt: new Date(),
        },
      });
      await prisma.notification.deleteMany({
        where: {
          userId: admin.id,
          type: "UNAVAILABILITY_PENDING_APPROVAL",
          read: false,
          id: { not: existing.id },
          createdAt: { gte: fifteenMinutesAgo },
        },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "UNAVAILABILITY_PENDING_APPROVAL",
          title: "Indisponibilità in attesa",
          message: singleMessage,
          metadata: { count: 1, details: [itemBlock] },
          priority,
          read: false,
        },
      });
    }
  }
}

/** Notifica admin: dipendente ha modificato/eliminato la propria indisponibilità in giornate con eventi attivi. Filtra per preferenze companyIds.
 * Raggruppa con notifiche esistenti non lette dello stesso tipo create entro 15 minuti. */
export async function notifyAdminsUnavailabilityChangedByWorker(
  workerName: string,
  action: "MODIFIED" | "DELETED",
  detail: string,
  workerCompanyId?: string | null
): Promise<void> {
  const responsabileFilter = workerCompanyId
    ? { isResponsabile: true, companyId: workerCompanyId }
    : { isResponsabile: true };
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      isArchived: false,
      OR: [{ isSuperAdmin: true }, { isAdmin: true }, responsabileFilter],
    },
    select: { id: true },
  });

  const prefs = await prisma.adminNotificationPreference.findMany({
    where: { userId: { in: admins.map((a) => a.id) } },
    select: { userId: true, companyIds: true },
  });
  const prefByUserId = new Map(prefs.map((p) => [p.userId, p]));

  const type = action === "MODIFIED" ? "UNAVAILABILITY_MODIFIED_BY_WORKER" : "UNAVAILABILITY_DELETED_BY_WORKER";
  if (!(await isNotificationTypeActive(type))) return;
  const priority = await getPriorityForType(type);
  const title = action === "MODIFIED" ? "Indisponibilità modificata da dipendente" : "Indisponibilità eliminata da dipendente";
  const baseMsg = action === "MODIFIED"
    ? `${workerName} ha modificato la propria indisponibilità in giornate con eventi attivi.`
    : `${workerName} ha eliminato la propria indisponibilità in giornate con eventi attivi.`;
  const singleMessage = detail ? `${baseMsg}\n\n${detail}` : baseMsg;

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  for (const admin of admins) {
    if (!adminShouldReceiveUnavailabilityNotification(prefByUserId.get(admin.id) ?? null, workerCompanyId)) {
      continue;
    }
    const existing = await prisma.notification.findFirst({
      where: {
        userId: admin.id,
        type,
        read: false,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });
    if (existing) {
      const meta = (existing.metadata as { count?: number; details?: string[] }) || {};
      const prevCount = meta.count ?? 1;
      const prevDetails = meta.details ?? (existing.message.includes("\n\n") ? [existing.message.split("\n\n").slice(1).join("\n\n")] : []);
      const newCount = prevCount + 1;
      const allDetails = [...prevDetails, detail].filter(Boolean);
      const msg = `${baseMsg} (${newCount} modifiche)\n\n${allDetails.join("\n\n---\n\n")}`;
      await prisma.notification.update({
        where: { id: existing.id },
        data: {
          message: msg,
          metadata: { count: newCount, details: allDetails },
          createdAt: new Date(),
        },
      });
      await prisma.notification.deleteMany({
        where: {
          userId: admin.id,
          type,
          read: false,
          id: { not: existing.id },
          createdAt: { gte: fifteenMinutesAgo },
        },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type,
          title,
          message: singleMessage,
          metadata: detail ? { count: 1, details: [detail] } : undefined,
          priority,
          read: false,
        },
      });
    }
  }
}

/** Verifica se esistono workday (con eventi) nel periodo indicato. Basta che l'evento esista, non serve che il dipendente sia assegnato. */
export async function hasWorkdaysInDateRange(dateStart: Date, dateEnd: Date): Promise<boolean> {
  const dStart = new Date(dateStart);
  const dEnd = new Date(dateEnd);
  dStart.setUTCHours(0, 0, 0, 0);
  dEnd.setUTCHours(23, 59, 59, 999);

  const count = await prisma.workday.count({
    where: {
      date: { gte: dStart, lte: dEnd },
    },
  });
  return count > 0;
}

/** Notifica SuperAdmin quando ci sono account bloccati. */
export async function notifySuperAdminsLockedAccounts(): Promise<void> {
  const type = "ADMIN_LOCKED_ACCOUNTS";
  if (!(await isNotificationTypeActive(type))) return;
  const priority = await getPriorityForType(type);
  const superAdmins = await prisma.user.findMany({
    where: { isSuperAdmin: true, isActive: true, isArchived: false },
    select: { id: true },
  });

  const lockedUsers = await prisma.user.findMany({
    where: {
      lockedUntil: { gt: new Date() },
    },
    select: { name: true, cognome: true, email: true },
  });

  if (lockedUsers.length === 0) {
    await prisma.notification.deleteMany({
      where: { type: "ADMIN_LOCKED_ACCOUNTS" },
    });
    return;
  }

  const lines = lockedUsers.map((u) => {
    const nomeCognome = [u.name, u.cognome].filter(Boolean).join(" ") || "—";
    return `${nomeCognome} - ${u.email}`;
  });
  const message =
    lockedUsers.length === 1
      ? `1 account bloccato:\n${lines[0]}`
      : `${lockedUsers.length} account bloccati:\n${lines.join("\n")}`;

  for (const sa of superAdmins) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: sa.id,
        type: "ADMIN_LOCKED_ACCOUNTS",
        read: false,
      },
    });

    if (existing) {
      await prisma.notification.update({
        where: { id: existing.id },
        data: { title: "Account bloccati", message, priority, createdAt: new Date() },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: sa.id,
          type: "ADMIN_LOCKED_ACCOUNTS",
          title: "Account bloccati",
          message,
          priority,
          read: false,
        },
      });
    }
  }
}
