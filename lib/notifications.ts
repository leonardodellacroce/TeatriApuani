import { prisma } from "@/lib/prisma";

export const ADMIN_NOTIFICATION_TYPES = ["ADMIN_LOCKED_ACCOUNTS"] as const;
/** Tipi visibili solo ai SuperAdmin (es. account bloccati) */
export const ADMIN_SUPERADMIN_ONLY_TYPES = ["ADMIN_LOCKED_ACCOUNTS"] as const;
export const WORKER_NOTIFICATION_TYPES = ["MISSING_HOURS_REMINDER"] as const;

export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];
export type WorkerNotificationType = (typeof WORKER_NOTIFICATION_TYPES)[number];

/** Notifica SuperAdmin quando ci sono account bloccati. Una notifica riepilogativa con nome, cognome e email di ogni account. */
export async function notifySuperAdminsLockedAccounts(): Promise<void> {
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
        data: { title: "Account bloccati", message, createdAt: new Date() },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: sa.id,
          type: "ADMIN_LOCKED_ACCOUNTS",
          title: "Account bloccati",
          message,
        },
      });
    }
  }
}
