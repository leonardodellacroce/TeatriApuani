import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

function getUserRole(session: { user?: unknown } | null): string {
  const u = session?.user as { role?: string; isSuperAdmin?: boolean; isAdmin?: boolean; isResponsabile?: boolean } | undefined;
  if (!u) return "";
  return (
    u.role ||
    (u.isSuperAdmin ? "SUPER_ADMIN" : u.isAdmin ? "ADMIN" : u.isResponsabile ? "RESPONSABILE" : "")
  );
}

/** GET: restituisce le preferenze dell'admin corrente. Crea record con default se non esiste. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = getUserRole(session);
    if (!ADMIN_ROLES.includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = (session.user as { id?: string })?.id;
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    let pref = await prisma.adminNotificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      // Default: azienda dell'admin, tutte le aree, 7 giorni
      const now = new Date();
      pref = await prisma.adminNotificationPreference.create({
        data: {
          userId,
          companyIds: user?.companyId ? JSON.stringify([user.companyId]) : null,
          areaIds: null, // null = tutte
          workdayIssuesDaysAhead: 7,
          updatedAt: now,
        },
      });
    }

    const parseIds = (val: string | null): string[] => {
      if (!val || val.trim() === "") return [];
      try {
        const arr = JSON.parse(val);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };

    return NextResponse.json({
      companyIds: parseIds(pref.companyIds),
      areaIds: parseIds(pref.areaIds),
      workdayIssuesDaysAhead: pref.workdayIssuesDaysAhead,
    });
  } catch (error) {
    console.error("GET /api/settings/notifications error", error);
    return NextResponse.json(
      { error: "Errore nel recupero delle preferenze" },
      { status: 500 }
    );
  }
}

/** PATCH: aggiorna le preferenze. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = getUserRole(session);
    if (!ADMIN_ROLES.includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = (session.user as { id?: string })?.id;
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const body = await req.json();
    const companyIds = Array.isArray(body.companyIds) ? body.companyIds : undefined;
    const areaIds = Array.isArray(body.areaIds) ? body.areaIds : undefined;
    const rawDays = body.workdayIssuesDaysAhead;
    const workdayIssuesDaysAhead =
      rawDays !== undefined && rawDays !== null
        ? Math.max(1, Math.min(90, parseInt(String(rawDays), 10) || 1))
        : undefined;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    // Responsabile: può impostare solo la propria azienda
    if (userRole === "RESPONSABILE" && user?.companyId && companyIds !== undefined) {
      const allowed = companyIds.length === 0 || (companyIds.length === 1 && companyIds[0] === user.companyId);
      if (!allowed) {
        return NextResponse.json(
          { error: "Il responsabile può selezionare solo la propria azienda" },
          { status: 400 }
        );
      }
    }

    const updateData: {
      companyIds?: string | null;
      areaIds?: string | null;
      workdayIssuesDaysAhead?: number;
    } = {};

    if (companyIds !== undefined) {
      updateData.companyIds = companyIds.length === 0 ? null : JSON.stringify(companyIds);
    }
    if (areaIds !== undefined) {
      updateData.areaIds = areaIds.length === 0 ? null : JSON.stringify(areaIds);
    }
    if (workdayIssuesDaysAhead !== undefined) {
      updateData.workdayIssuesDaysAhead = workdayIssuesDaysAhead;
    }

    const now = new Date();
    const pref = await prisma.adminNotificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        companyIds: updateData.companyIds ?? (user?.companyId ? JSON.stringify([user.companyId]) : null),
        areaIds: updateData.areaIds ?? null,
        workdayIssuesDaysAhead: updateData.workdayIssuesDaysAhead ?? 7,
        updatedAt: now,
      },
      update: { ...updateData, updatedAt: now },
    });

    const parseIds = (val: string | null): string[] => {
      if (!val || val.trim() === "") return [];
      try {
        const arr = JSON.parse(val);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };

    return NextResponse.json({
      companyIds: parseIds(pref.companyIds),
      areaIds: parseIds(pref.areaIds),
      workdayIssuesDaysAhead: pref.workdayIssuesDaysAhead,
    });
  } catch (error) {
    console.error("PATCH /api/settings/notifications error", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Errore nell'aggiornamento delle preferenze", details: message },
      { status: 500 }
    );
  }
}
