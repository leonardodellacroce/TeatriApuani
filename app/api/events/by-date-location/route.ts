import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** GET /api/events/by-date-location?date=YYYY-MM-DD&locationId=xxx
 * Eventi compatibili per data e location (non chiusi).
 * Usato per associare ore libere a un evento esistente. */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role || "";
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const locationId = searchParams.get("locationId");

    if (!dateStr || !locationId) {
      return NextResponse.json(
        { error: "Parametri date e locationId obbligatori" },
        { status: 400 }
      );
    }

    const date = new Date(dateStr + "T00:00:00.000Z");
    const dateStart = new Date(date);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setUTCHours(23, 59, 59, 999);

    const events = await prisma.event.findMany({
      where: {
        isClosed: false,
        locationId,
        startDate: { lte: dateEnd },
        endDate: { gte: dateStart },
      },
      include: {
        location: { select: { id: true, name: true } },
      },
      orderBy: { title: "asc" },
    });

    // Arricchisci con nomi clienti per la UI
    const clientIdsSet = new Set<string>();
    events.forEach((e) => {
      if (e.clientIds) {
        try {
          const arr = JSON.parse(e.clientIds) as string[];
          if (Array.isArray(arr)) arr.forEach((id) => clientIdsSet.add(id));
        } catch {}
      }
    });

    const clientsMap = new Map<string, { ragioneSociale: string | null; nome: string | null; cognome: string | null }>();
    if (clientIdsSet.size > 0) {
      const clients = await prisma.client.findMany({
        where: { id: { in: Array.from(clientIdsSet) } },
        select: { id: true, ragioneSociale: true, nome: true, cognome: true },
      });
      clients.forEach((c) => clientsMap.set(c.id, { ragioneSociale: c.ragioneSociale, nome: c.nome, cognome: c.cognome }));
    }

    const result = events.map((e) => {
      let clientNames: string[] = [];
      if (e.clientIds) {
        try {
          const arr = JSON.parse(e.clientIds) as string[];
          if (Array.isArray(arr)) {
            clientNames = arr
              .map((id) => {
                const c = clientsMap.get(id);
                if (!c) return null;
                if (c.ragioneSociale) return c.ragioneSociale;
                if (c.nome && c.cognome) return `${c.nome} ${c.cognome}`;
                return null;
              })
              .filter((n): n is string => n != null);
          }
        } catch {}
      }
      return {
        id: e.id,
        title: e.title,
        location: e.location,
        clientNames,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/events/by-date-location error:", error);
    return NextResponse.json(
      { error: "Errore nel recupero eventi" },
      { status: 500 }
    );
  }
}
