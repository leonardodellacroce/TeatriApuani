import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
import { getWorkModeFromRequest } from "@/lib/workMode";
import { ADMIN_NOTIFICATION_TYPES, ADMIN_SUPERADMIN_ONLY_TYPES, WORKER_NOTIFICATION_TYPES } from "@/lib/notifications";
import { userHasMissingShiftsForDates } from "@/lib/missingHoursNotification";

// GET /api/notifications?unreadOnly=true&type=worker|admin
// Ritorna le notifiche dell'utente.
// - type=worker: solo notifiche lavoratore (ore mancanti) - usato da /dashboard/notifications
// - type=admin: solo notifiche admin - usato da /dashboard/admin-notifications
// - Se type non specificato: usa workMode per retrocompatibilità (Navbar count)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type");

    let notificationTypes: readonly string[];
    const isSuperAdmin = (session?.user as any)?.isSuperAdmin === true;
    const isAdminRole =
      isSuperAdmin ||
      (session?.user as any)?.isAdmin === true ||
      (session?.user as any)?.role === "RESPONSABILE";
    if (typeParam === "admin") {
      // Admin notifications: Responsabile, Admin, SuperAdmin. ADMIN_LOCKED_ACCOUNTS solo SuperAdmin.
      if (!isAdminRole) {
        notificationTypes = WORKER_NOTIFICATION_TYPES;
      } else if (isSuperAdmin) {
        notificationTypes = ADMIN_NOTIFICATION_TYPES;
      } else {
        notificationTypes = ADMIN_NOTIFICATION_TYPES.filter(
          (t) => !(ADMIN_SUPERADMIN_ONLY_TYPES as readonly string[]).includes(t)
        );
      }
    } else if (typeParam === "worker") {
      notificationTypes = WORKER_NOTIFICATION_TYPES;
    } else {
      const isWorker = (session?.user as any)?.isWorker === true;
      const workMode = getWorkModeFromRequest(req);
      const useWorkerNotifications =
        workMode === "worker" && isWorker ? true : !isAdminRole;
      if (useWorkerNotifications) {
        notificationTypes = WORKER_NOTIFICATION_TYPES;
      } else if (isSuperAdmin) {
        notificationTypes = ADMIN_NOTIFICATION_TYPES;
      } else {
        notificationTypes = ADMIN_NOTIFICATION_TYPES.filter(
          (t) => !(ADMIN_SUPERADMIN_ONLY_TYPES as readonly string[]).includes(t)
        );
      }
    }
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    if (notificationTypes.length === 0) {
      return NextResponse.json([]);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const where: any = {
      userId,
      type: { in: [...notificationTypes] },
      createdAt: { gte: sevenDaysAgo },
    };
    if (unreadOnly) {
      where.read = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Filtra notifiche MISSING_HOURS_REMINDER obsolete (utente non ha più turni per quelle date)
    if (notificationTypes.includes("MISSING_HOURS_REMINDER")) {
      const filtered: typeof notifications = [];
      for (const n of notifications) {
        if (n.type !== "MISSING_HOURS_REMINDER") {
          filtered.push(n);
          continue;
        }
        const meta = n.metadata as { dates?: string[] } | null;
        let dates = meta?.dates;
        if (!dates || !Array.isArray(dates) || dates.length === 0) {
          // Fallback: estrai date dal messaggio (formato "del 21/02/2026, 22/02/2026")
          const match = n.message.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
          dates = match
            ? match.map((d) => {
                const [day, month, year] = d.split("/");
                return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
              })
            : [];
        }
        if (dates.length === 0) {
          filtered.push(n); // impossibile validare: mostrala
          continue;
        }
        const stillHasMissing = await userHasMissingShiftsForDates(n.userId, dates);
        if (stillHasMissing) {
          filtered.push(n);
        } else {
          // Segna come letta se obsoleta (evita che ricompaia)
          await prisma.notification.update({
            where: { id: n.id },
            data: { read: true },
          });
        }
      }
      return NextResponse.json(filtered);
    }

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const isPrismaTableMissing = /relation.*does not exist|Table.*doesn't exist|Unknown field|does not exist/i.test(msg);
    return NextResponse.json(
      {
        error: "Failed to fetch notifications",
        details: msg,
        ...(process.env.NODE_ENV === "development" && stack && { stack }),
        hint: isPrismaTableMissing
          ? "Esegui 'npx prisma db push' per creare la tabella Notification"
          : undefined,
      },
      { status: 500 }
    );
  }
}
