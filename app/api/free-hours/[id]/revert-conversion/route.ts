import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** POST /api/free-hours/[id]/revert-conversion - Annulla la conversione: elimina l'evento creato e riporta le ore libere in PENDING. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role || "";
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: freeHoursId } = await params;

    const entry = await prisma.freeHoursEntry.findUnique({
      where: { id: freeHoursId },
      include: {
        user: { select: { name: true, cognome: true } },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Ore libere non trovate" }, { status: 404 });
    }
    if (entry.status !== "CONVERTED") {
      return NextResponse.json(
        { error: "Queste ore libere non sono state convertite" },
        { status: 400 }
      );
    }
    if (!entry.convertedToAssignmentId) {
      return NextResponse.json(
        { error: "Assegnazione di conversione non trovata" },
        { status: 400 }
      );
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: entry.convertedToAssignmentId },
      include: { workday: { select: { eventId: true } } },
    });

    if (!assignment?.workday?.eventId) {
      return NextResponse.json(
        { error: "Evento associato non trovato" },
        { status: 404 }
      );
    }

    const eventId = assignment.workday.eventId;

    await prisma.$transaction(async (tx) => {
      await tx.freeHoursEntry.update({
        where: { id: freeHoursId },
        data: {
          status: "PENDING",
          convertedToAssignmentId: null,
        },
      });
      await tx.event.delete({
        where: { id: eventId },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/free-hours/[id]/revert-conversion error:", error);
    return NextResponse.json(
      { error: "Errore nell'annullamento della conversione", details: String(error) },
      { status: 500 }
    );
  }
}
