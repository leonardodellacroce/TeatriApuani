import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isEventPast } from "@/lib/validation";
import { isMonthClosed } from "@/lib/closedMonth";
import { getWorkModeFromRequest } from "@/lib/workMode";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isNonStandardWorker = (session.user as any).isWorker === true;
    if (isNonStandardWorker && getWorkModeFromRequest(request) === "worker") {
      return NextResponse.json(
        { error: "Forbidden - Passa in modalità amministratore per spostare eventi" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const newStartDateStr = body.newStartDate as string | undefined;

    if (!newStartDateStr || typeof newStartDateStr !== "string") {
      return NextResponse.json(
        { error: "newStartDate è obbligatorio (formato YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const match = newStartDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return NextResponse.json(
        { error: "newStartDate deve essere nel formato YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const [, yearStr, monthStr, dayStr] = match;
    const newStartDate = new Date(
      Date.UTC(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, parseInt(dayStr, 10), 0, 0, 0)
    );

    const existingEvent = await prisma.event.findUnique({
      where: { id },
      include: {
        workdays: { select: { id: true, date: true } },
      },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (isEventPast(existingEvent.endDate)) {
      const isSuperAdmin = (session.user as any).isSuperAdmin === true;
      if (!isSuperAdmin) {
        return NextResponse.json(
          { error: "Gli eventi passati possono essere spostati solo dal Super Admin" },
          { status: 403 }
        );
      }
    }

    const isSuperAdminForMonth =
      (session.user as any).isSuperAdmin === true || session.user.role === "SUPER_ADMIN";

    const oldStartDate = new Date(existingEvent.startDate);
    const oldEndDate = new Date(existingEvent.endDate);
    const deltaMs = newStartDate.getTime() - oldStartDate.getTime();
    const deltaDays = Math.round(deltaMs / (1000 * 60 * 60 * 24));
    const newEndDate = new Date(oldEndDate.getTime() + deltaMs);

    // Verifica che nessuna giornata traslata finisca in un mese chiuso (Super Admin può bypassare)
    if (!isSuperAdminForMonth && existingEvent.workdays.length > 0) {
      for (const wd of existingEvent.workdays) {
        const newWdDate = new Date(new Date(wd.date).getTime() + deltaMs);
        const closed = await isMonthClosed(
          newWdDate.getFullYear(),
          newWdDate.getMonth() + 1
        );
        if (closed) {
          return NextResponse.json(
            {
              error:
                "Impossibile spostare: una giornata finirebbe in un mese chiuso.",
            },
            { status: 403 }
          );
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id },
        data: {
          startDate: newStartDate,
          endDate: newEndDate,
        },
      });

      for (const wd of existingEvent.workdays) {
        const oldWdDate = new Date(wd.date);
        const newWdDate = new Date(oldWdDate.getTime() + deltaMs);
        await tx.workday.update({
          where: { id: wd.id },
          data: { date: newWdDate },
        });
      }
    });

    return NextResponse.json({
      success: true,
      deltaDays,
      newStartDate: newStartDate.toISOString(),
      newEndDate: newEndDate.toISOString(),
    });
  } catch (error) {
    console.error("Error moving event:", error);
    return NextResponse.json(
      { error: "Failed to move event" },
      { status: 500 }
    );
  }
}
