import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeWorkdayIssuesBadge } from "@/lib/workdayIssuesBadge";
import { computeAdminMissingHoursCount } from "@/lib/adminMissingHoursCount";

/** Conteggi problemi reali (non notifiche) per badge sui box.
 * - indisponibilita: count PENDING_APPROVAL
 * - impostazioniTecniche: count account bloccati (solo SuperAdmin)
 * - workdayIssues: { badge, count } problemi programmazione (solo Eventi)
 * - turniOreMissingHours: count date con ore non inserite (solo Turni e Ore)
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isSuperAdmin = (session?.user as any)?.isSuperAdmin === true;
    const isAdminRole =
      isSuperAdmin ||
      (session?.user as any)?.isAdmin === true ||
      (session?.user as any)?.role === "RESPONSABILE";

    if (!isAdminRole) {
      return NextResponse.json({
        indisponibilita: 0,
        impostazioniTecniche: 0,
        workdayIssues: { badge: null, count: 0 },
        turniOreMissingHours: 0,
      });
    }

    const userId = (session?.user as { id?: string })?.id;
    const [indisponibilita, lockedCount, workdayResult, turniOreMissingHours] = await Promise.all([
      prisma.unavailability.count({
        where: { status: "PENDING_APPROVAL" },
      }),
      isSuperAdmin
        ? prisma.user.count({
            where: { lockedUntil: { gt: new Date() } },
          })
        : 0,
      computeWorkdayIssuesBadge(userId),
      computeAdminMissingHoursCount(),
    ]);

    return NextResponse.json({
      indisponibilita,
      impostazioniTecniche: isSuperAdmin ? lockedCount : 0,
      workdayIssues: {
        badge: workdayResult.badge,
        count: workdayResult.count,
      },
      turniOreMissingHours,
    });
  } catch (error) {
    console.error("GET /api/notifications/admin-high-priority-counts error", error);
    return NextResponse.json(
      {
        indisponibilita: 0,
        impostazioniTecniche: 0,
        workdayIssues: { badge: null, count: 0 },
        turniOreMissingHours: 0,
      },
      { status: 200 }
    );
  }
}
