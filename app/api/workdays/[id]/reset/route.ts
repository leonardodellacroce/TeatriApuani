import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkEventStatus } from "@/lib/validation";
import { getWorkModeFromRequest } from "@/lib/workMode";
import { isMonthClosed } from "@/lib/closedMonth";

/** POST /api/workdays/[id]/reset - Resetta la giornata: elimina personale, tipologie, turni e attività. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isNonStandardWorker = (session.user as any).isWorker === true;
    if (isNonStandardWorker && getWorkModeFromRequest(req) === "worker") {
      return NextResponse.json(
        { error: "Passa in modalità amministratore per gestire le giornate" },
        { status: 403 }
      );
    }

    const userRole = (session.user as any).role || "";
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const workday = await prisma.workday.findUnique({
      where: { id },
      select: { eventId: true, date: true },
    });

    if (!workday) {
      return NextResponse.json({ error: "Giornata non trovata" }, { status: 404 });
    }

    // Blocca reset se il mese è chiuso (Super Admin può bypassare)
    const isSuperAdmin = (session.user as any).isSuperAdmin === true || session.user.role === "SUPER_ADMIN";
    const wdDate = new Date(workday.date);
    const monthClosed = await isMonthClosed(wdDate.getFullYear(), wdDate.getMonth() + 1);
    if (monthClosed && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Impossibile resettare: il mese è chiuso" },
        { status: 403 }
      );
    }

    const eventStatus = await checkEventStatus(workday.eventId);
    if (!eventStatus.exists) {
      return NextResponse.json(
        { error: "Evento associato non trovato" },
        { status: 404 }
      );
    }

    if (eventStatus.isPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Non è possibile resettare giornate per eventi passati (solo Super Admin)" },
        { status: 403 }
      );
    }

    const [deleteResult] = await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { workdayId: id } }),
      prisma.workday.update({
        where: { id },
        data: {
          areaEnabledStates: null,
          areaShiftPreferences: null,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    console.error("POST /api/workdays/[id]/reset error:", error);
    return NextResponse.json(
      { error: "Errore nel reset della giornata" },
      { status: 500 }
    );
  }
}
