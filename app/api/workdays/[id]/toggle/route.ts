import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo ADMIN e SUPER_ADMIN possono aprire/chiudere giornate
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isOpen } = body;

    if (typeof isOpen !== "boolean") {
      return NextResponse.json(
        { error: "isOpen must be a boolean" },
        { status: 400 }
      );
    }

    // Verifica che la giornata esista
    const workday = await prisma.workday.findUnique({
      where: { id },
    });

    if (!workday) {
      return NextResponse.json({ error: "Workday not found" }, { status: 404 });
    }

    // Vincolo: una giornata può essere aperta/chiusa una volta
    if (isOpen && !workday.isOpen) {
      // Prima di aprire la giornata, verifica se l'evento è chiuso
      const event = await prisma.event.findUnique({
        where: { id: workday.eventId },
      });

      // Se l'evento è chiuso, sarà riaperto automaticamente
      if (event?.isClosed) {
        await prisma.event.update({
          where: { id: workday.eventId },
          data: { isClosed: false },
        });
      }

      // Apre la giornata
      const updated = await prisma.workday.update({
        where: { id },
        data: {
          isOpen: true,
          openedByUserId: session.user?.id,
        },
      });
      return NextResponse.json(updated);
    } else if (!isOpen && workday.isOpen) {
      // Chiude la giornata
      const updated = await prisma.workday.update({
        where: { id },
        data: {
          isOpen: false,
          closedByUserId: session.user?.id,
        },
      });
      return NextResponse.json(updated);
    } else {
      // Stato già quello richiesto
      return NextResponse.json(workday);
    }
  } catch (error) {
    console.error("Error toggling workday:", error);
    return NextResponse.json(
      { error: "Failed to toggle workday" },
      { status: 500 }
    );
  }
}

