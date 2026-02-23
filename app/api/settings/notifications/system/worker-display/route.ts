import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WORKER_NOTIFICATION_TYPES } from "@/lib/notifications";

/** GET: impostazioni display per notifiche lavoratore (showInDashboardModal).
 * Chiamabile da qualsiasi utente autenticato per sapere se mostrare il modal dashboard. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.notificationTypeSetting.findMany({
      where: { type: { in: [...WORKER_NOTIFICATION_TYPES] } },
      select: { type: true, showInDashboardModal: true },
    });
    const byType = new Map(settings.map((s) => [s.type, s.showInDashboardModal]));

    const worker: { type: string; showInDashboardModal: boolean }[] = WORKER_NOTIFICATION_TYPES.map((type) => ({
      type,
      showInDashboardModal: byType.get(type) ?? true,
    }));

    return NextResponse.json({ worker });
  } catch (error) {
    console.error("Worker display settings error:", error);
    return NextResponse.json({ error: "Errore" }, { status: 500 });
  }
}
