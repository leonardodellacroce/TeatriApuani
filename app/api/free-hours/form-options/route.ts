import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** GET /api/free-hours/form-options - Opzioni per il form ore libere (task types SHIFT, duties). Accessibile ai lavoratori. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isWorker = (session.user as any).isWorker === true;
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes((session.user as any).role || "");
    if (!isWorker && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [areas, taskTypes, duties, locations] = await Promise.all([
      prisma.area.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.taskType.findMany({
        where: { type: "SHIFT" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, areas: true },
      }),
      prisma.duty.findMany({
        orderBy: [{ area: "asc" }, { name: "asc" }],
        select: { id: true, name: true, code: true, area: true },
      }),
      prisma.location.findMany({
        where: { isArchived: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    return NextResponse.json({ areas, taskTypes, duties, locations });
  } catch (error) {
    console.error("GET /api/free-hours/form-options error:", error);
    return NextResponse.json({ error: "Errore nel recupero" }, { status: 500 });
  }
}
