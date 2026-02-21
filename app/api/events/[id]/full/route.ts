import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildDutyIdToNameForWorkdays } from "@/lib/workdayDutyMap";

// GET /api/events/[id]/full
// Restituisce evento + workdays con dutyIdToName + aree + mansioni in una sola chiamata
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const [event, areas, duties] = await Promise.all([
      prisma.event.findUnique({
        where: { id },
        include: {
          location: true,
          workdays: {
            include: {
              location: true,
              assignments: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      cognome: true,
                      code: true,
                    },
                  },
                  taskType: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      color: true,
                    },
                  },
                },
              },
            },
            orderBy: { date: "asc" },
          },
        },
      }),
      prisma.area.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.duty.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const dutyIdToNameByWorkday = await buildDutyIdToNameForWorkdays(
      event.workdays.map((wd) => ({
        id: wd.id,
        assignments: wd.assignments,
      }))
    );

    (event as any).workdays = event.workdays.map((wd) => ({
      ...wd,
      dutyIdToName: dutyIdToNameByWorkday[wd.id] || {},
    }));

    const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "");
    let eventClientsNames: string[] = [];
    if (isAdmin && event.clientIds) {
      try {
        const clientIds = JSON.parse(event.clientIds) as string[];
        if (Array.isArray(clientIds) && clientIds.length > 0) {
          const clients = await prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, ragioneSociale: true, nome: true, cognome: true },
          });
          eventClientsNames = clientIds
            .map((cid) => {
              const c = clients.find((x) => x.id === cid);
              if (!c) return null;
              const name = c.ragioneSociale || `${c.nome || ""} ${c.cognome || ""}`.trim();
              return name || null;
            })
            .filter(Boolean) as string[];
        }
      } catch {}
    }
    if (!isAdmin) {
      (event as any).clientName = null;
    }

    return NextResponse.json({ event, areas, duties, eventClientsNames });
  } catch (error) {
    console.error("Error fetching event full:", error);
    return NextResponse.json(
      { error: "Failed to fetch event" },
      { status: 500 }
    );
  }
}
