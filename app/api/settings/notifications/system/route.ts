import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSystemSetting, setSystemSetting } from "@/lib/settings";
import {
  WORKER_NOTIFICATION_TYPES,
  ADMIN_NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITY,
} from "@/lib/notifications";

const KEY_REQUIRE_MODAL_ACTION = "notifications_require_modal_action_to_mark_read";

const LABELS: Record<string, string> = {
  MISSING_HOURS_REMINDER: "Orari da inserire",
  DAILY_SHIFT_REMINDER: "Promemoria turni di oggi",
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

const TYPES_WITH_PARAMS = ["WORKDAY_ISSUES", "MISSING_HOURS_REMINDER", "DAILY_SHIFT_REMINDER"];

/** Impostazioni di default per ogni tipo (priorità, modal, metadata) */
function getDefaultSettings(): Array<{
  type: string;
  isActive: boolean;
  priority: string;
  showInDashboardModal: boolean;
  metadata: Record<string, unknown> | null;
}> {
  const allTypes = [...WORKER_NOTIFICATION_TYPES, ...ADMIN_NOTIFICATION_TYPES];
  const defaults: Record<string, { priority: string; showInDashboardModal: boolean }> = {
    MISSING_HOURS_REMINDER: { priority: "HIGH", showInDashboardModal: true },
    DAILY_SHIFT_REMINDER: { priority: "MEDIUM", showInDashboardModal: false },
    UNAVAILABILITY_CREATED_BY_ADMIN: { priority: "MEDIUM", showInDashboardModal: false },
    UNAVAILABILITY_MODIFIED_BY_ADMIN: { priority: "MEDIUM", showInDashboardModal: true },
    UNAVAILABILITY_DELETED_BY_ADMIN: { priority: "MEDIUM", showInDashboardModal: true },
    UNAVAILABILITY_APPROVED: { priority: "LOW", showInDashboardModal: true },
    UNAVAILABILITY_REJECTED: { priority: "HIGH", showInDashboardModal: true },
    ORE_INSERITE_DA_ADMIN: { priority: "LOW", showInDashboardModal: false },
    ORE_MODIFICATE_DA_ADMIN: { priority: "MEDIUM", showInDashboardModal: false },
    ORE_ELIMINATE_DA_ADMIN: { priority: "MEDIUM", showInDashboardModal: false },
    ADMIN_LOCKED_ACCOUNTS: { priority: "HIGH", showInDashboardModal: true },
    UNAVAILABILITY_PENDING_APPROVAL: { priority: "HIGH", showInDashboardModal: true },
    UNAVAILABILITY_MODIFIED_BY_WORKER: { priority: "MEDIUM", showInDashboardModal: true },
    UNAVAILABILITY_DELETED_BY_WORKER: { priority: "MEDIUM", showInDashboardModal: true },
    WORKDAY_ISSUES: { priority: "HIGH", showInDashboardModal: false },
  };
  return allTypes.map((type) => {
    const d = defaults[type] ?? {
      priority: NOTIFICATION_PRIORITY[type] || "MEDIUM",
      showInDashboardModal: true,
    };
    const metadata: Record<string, unknown> = {};
    if (type === "WORKDAY_ISSUES") metadata.workdayIssuesDaysAhead = 7;
    if (type === "MISSING_HOURS_REMINDER") {
      metadata.cronHour = 7;
      metadata.giorniIndietro = 60;
      metadata.giorniEsclusi = 1;
    }
    if (type === "DAILY_SHIFT_REMINDER") {
      metadata.cronHour = 7;
    }
    return {
      type,
      isActive: true,
      priority: d.priority,
      showInDashboardModal: d.showInDashboardModal,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    };
  });
}

async function ensureSettingsExist() {
  const defaults = getDefaultSettings();
  const existing = await prisma.notificationTypeSetting.findMany({
    select: { type: true },
  });
  const existingTypes = new Set(existing.map((e) => e.type));
  const toCreate = defaults.filter((d) => !existingTypes.has(d.type));

  const now = new Date();
  for (const d of toCreate) {
    await prisma.notificationTypeSetting.create({
      data: {
        type: d.type,
        isActive: d.isActive,
        priority: d.priority,
        showInDashboardModal: d.showInDashboardModal,
        metadata: d.metadata ? (d.metadata as Prisma.InputJsonValue) : undefined,
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

    const requireModalActionToMarkRead =
      (await getSystemSetting(KEY_REQUIRE_MODAL_ACTION)) === "true";

    return NextResponse.json({
      worker,
      admin,
      requireModalActionToMarkRead,
    });
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

    if (typeof body.requireModalActionToMarkRead === "boolean") {
      await setSystemSetting(
        KEY_REQUIRE_MODAL_ACTION,
        body.requireModalActionToMarkRead ? "true" : "false"
      );
    }

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
        const createData = {
          type,
          isActive: data.isActive ?? true,
          priority: data.priority ?? "MEDIUM",
          showInDashboardModal: data.showInDashboardModal ?? true,
          metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
        };
        const updateData = {
          ...data,
          metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
          updatedAt: new Date(),
        };
        await prisma.notificationTypeSetting.upsert({
          where: { type },
          create: createData,
          update: updateData,
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

/** POST: reset impostazioni a default (solo SuperAdmin) */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any)?.isSuperAdmin !== true) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.resetToDefault !== true) {
      return NextResponse.json({ error: "Parametro resetToDefault richiesto" }, { status: 400 });
    }

    const defaults = getDefaultSettings();
    const now = new Date();

    for (const d of defaults) {
      await prisma.notificationTypeSetting.upsert({
        where: { type: d.type },
        create: {
          type: d.type,
          isActive: d.isActive,
          priority: d.priority,
          showInDashboardModal: d.showInDashboardModal,
          metadata: d.metadata ? (d.metadata as Prisma.InputJsonValue) : undefined,
          updatedAt: now,
        },
        update: {
          isActive: d.isActive,
          priority: d.priority,
          showInDashboardModal: d.showInDashboardModal,
          metadata: d.metadata ? (d.metadata as Prisma.InputJsonValue) : undefined,
          updatedAt: now,
        },
      });
    }

    await setSystemSetting(KEY_REQUIRE_MODAL_ACTION, "true");

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/settings/notifications/system reset error", error);
    return NextResponse.json(
      { error: "Errore nel reset delle impostazioni" },
      { status: 500 }
    );
  }
}
