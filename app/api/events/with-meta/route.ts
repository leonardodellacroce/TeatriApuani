import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/events/with-meta
// Restituisce eventi + aree + mansioni in una sola chiamata (riduce 3 round-trip a 1)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [events, areas, duties] = await Promise.all([
      prisma.event.findMany({
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
          },
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.area.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.duty.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    const allAssignedUserIds = new Set<string>();
    events.forEach((event) => {
      event.workdays?.forEach((wd: any) => {
        wd.assignments?.forEach((a: any) => {
          if (a.assignedUsers) {
            try {
              const parsed = JSON.parse(a.assignedUsers);
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  const uid = typeof item === "string" ? item : item?.userId;
                  if (uid) allAssignedUserIds.add(uid);
                });
              }
            } catch {}
          }
        });
      });
    });

    const usersMap = new Map<string, { name: string; cognome: string; code: string }>();
    if (allAssignedUserIds.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(allAssignedUserIds) } },
        select: { id: true, name: true, cognome: true, code: true },
      });
      users.forEach((u) => {
        usersMap.set(u.id, {
          name: u.name || "",
          cognome: u.cognome || "",
          code: u.code || "",
        });
      });
    }

    events.forEach((event) => {
      event.workdays?.forEach((wd: any) => {
        wd.assignments?.forEach((a: any) => {
          if (a.assignedUsers) {
            try {
              const parsed = JSON.parse(a.assignedUsers);
              if (Array.isArray(parsed)) {
                (a as any).assignedUsersResolved = parsed
                  .map((item: any) => {
                    const uid = typeof item === "string" ? item : item?.userId;
                    if (!uid) return null;
                    const u = usersMap.get(uid);
                    if (!u) return null;
                    return { userId: uid, ...u };
                  })
                  .filter(Boolean);
              }
            } catch {}
          }
        });
      });
    });

    const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "");
    if (!isAdmin) {
      events.forEach((event) => {
        event.clientName = null;
      });
    }

    return NextResponse.json({ events, areas, duties });
  } catch (error) {
    console.error("Error fetching events with meta:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
