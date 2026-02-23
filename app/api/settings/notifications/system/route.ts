import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  WORKER_NOTIFICATION_TYPES,
  ADMIN_NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITY,
} from "@/lib/notifications";

const LABELS: Record<string, string> = {
  MISSING_HOURS_REMINDER: "Orari da inserire",
  UNAVAILABILITY_CREATED_BY_ADMIN: "Indisponibilità inserita",
  UNAVAILABILITY_MODIFIED_BY_ADMIN: "Indisponibilità modificata",
  UNAVAILABILITY_DELETED_BY_ADMIN: "Indisponibilità eliminata",
  UNAVAILABILITY_APPROVED: "Indisponibilità approvata",
  UNAVAILABILITY_REJECTED: "Indisponibilità non approvata",
  ORE_INSERITE_DA_ADMIN: "Ore lavorate inserite",
  ORE_MODIFICATE_DA_ADMIN: "Ore lavorate modificate",
  ORE_ELIMINATE_DA_ADMIN: "Ore lavorate eliminate",
  ADMIN_LOCKED_ACCOUNTS: "Account bloccati",
  UNAVAILABILITY_PENDING_APPROVAL: "Indisponibilità in attesa",
  UNAVAILABILITY_MODIFIED_BY_WORKER: "Indisponibilità modificata da dipendente",
  UNAVAILABILITY_DELETED_BY_WORKER: "Indisponibilità eliminata da dipendente",
  WORKDAY_ISSUES: "Problemi programmazione",
};

const TYPES_WITH_PARAMS = ["WORKDAY_ISSUES", "MISSING_HOURS_REMINDER"];

async function ensureSettingsExist() {
  const allTypes = [...WORKER_NOTIFICATION_TYPES, ...ADMIN_NOTIFICATION_TYPES];
  const existing = await prisma.notificationTypeSetting.findMany({
    select: { type: true },
  });
  const existingTypes = new Set(existing.map((e) => e.type));
  const toCreate = allTypes.filter((t) => !existingTypes.has(t));

  const now = new Date();
  for (const type of toCreate) {
    const defaultPriority = NOTIFICATION_PRIORITY[type] || "MEDIUM";
    const metadata: Record<string, unknown> = {};
    if (type === "WORKDAY_ISSUES") metadata.workdayIssuesDaysAhead = 7;
    if (type === "MISSING_HOURS_REMINDER") {
      metadata.cronHour = 8;
      metadata.giorniIndietro = 60;
      metadata.giorniEsclusi = 1;
    }

    await prisma.notificationTypeSetting.create({
      data: {
        type,
        isActive: true,
        priority: defaultPriority,
        showInDashboardModal: defaultPriority === "HIGH" || defaultPriority === "MEDIUM",
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        updatedAt: now,
      },
    });
  }
}

/** GET: elenco impostazioni notifiche di sistema. SuperAdmin: modifica, Admin/Responsabile: sola lettura per priorità e modal. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdminRole =
      (session.user as any)?.isSuperAdmin === true ||
      (session.user as any)?.isAdmin === true ||
      (session.user as any)?.role === "RESPONSABILE";
    if (!isAdminRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureSettingsExist();

    const settings = await prisma.notificationTypeSetting.findMany({
      orderBy: { type: "asc" },
    });

    const workerTypes = [...WORKER_NOTIFICATION_TYPES];
    const adminTypes = [...ADMIN_NOTIFICATION_TYPES];

    const byType = new Map(settings.map((s) => [s.type, s]));

    const worker = workerTypes.map((type) => {
      const s = byType.get(type);
      return {
        type,
        label: LABELS[type] || type,
        isActive: s?.isActive ?? true,
        priority: s?.priority ?? "MEDIUM",
        showInDashboardModal: s?.showInDashboardModal ?? true,
        metadata: s?.metadata ?? null,
        hasParams: TYPES_WITH_PARAMS.includes(type),
      };
    });

    const admin = adminTypes.map((type) => {
      const s = byType.get(type);
      return {
        type,
        label: LABELS[type] || type,
        isActive: s?.isActive ?? true,
        priority: s?.priority ?? "MEDIUM",
        showInDashboardModal: s?.showInDashboardModal ?? true,
        metadata: s?.metadata ?? null,
        hasParams: TYPES_WITH_PARAMS.includes(type),
      };
    });

    return NextResponse.json({ worker, admin });
  } catch (error) {
    console.error("GET /api/settings/notifications/system error", error);
    return NextResponse.json(
      { error: "Errore nel recupero delle impostazioni" },
      { status: 500 }
    );
  }
}

/** PATCH: aggiorna impostazioni (solo SuperAdmin) */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any)?.isSuperAdmin !== true) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const updates = Array.isArray(body.updates) ? body.updates : [body];

    for (const u of updates) {
      const type = u.type;
      if (!type || typeof type !== "string") continue;

      const data: {
        isActive?: boolean;
        priority?: string;
        showInDashboardModal?: boolean;
        metadata?: Record<string, unknown>;
      } = {};

      if (typeof u.isActive === "boolean") data.isActive = u.isActive;
      if (["HIGH", "MEDIUM", "LOW"].includes(u.priority)) data.priority = u.priority;
      if (typeof u.showInDashboardModal === "boolean") data.showInDashboardModal = u.showInDashboardModal;
      if (u.metadata && typeof u.metadata === "object") data.metadata = u.metadata;

      if (Object.keys(data).length > 0) {
        await prisma.notificationTypeSetting.upsert({
          where: { type },
          create: {
            type,
            isActive: data.isActive ?? true,
            priority: data.priority ?? "MEDIUM",
            showInDashboardModal: data.showInDashboardModal ?? true,
            metadata: data.metadata ?? undefined,
          },
          update: { ...data, updatedAt: new Date() },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/settings/notifications/system error", error);
    return NextResponse.json(
      { error: "Errore nell'aggiornamento" },
      { status: 500 }
    );
  }
}
