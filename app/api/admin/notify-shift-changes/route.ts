import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runNotifyShiftChanges } from "@/lib/notifyShiftChanges";

// POST /api/admin/notify-shift-changes
// Invio manuale delle notifiche modifiche turni ai lavoratori.
// Solo ADMIN, SUPER_ADMIN, RESPONSABILE.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole =
      (session.user as { role?: string }).role ||
      ((session.user as { isSuperAdmin?: boolean }).isSuperAdmin
        ? "SUPER_ADMIN"
        : (session.user as { isAdmin?: boolean }).isAdmin
          ? "ADMIN"
          : (session.user as { isResponsabile?: boolean }).isResponsabile
            ? "RESPONSABILE"
            : "");
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await runNotifyShiftChanges();

    return NextResponse.json({
      ok: true,
      created: result.created,
      updated: result.updated,
      usersNotified: result.created + result.updated,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Admin notify-shift-changes error:", err.message, err.stack);
    return NextResponse.json(
      {
        error: "Operazione fallita",
        details: err.message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
      },
      { status: 500 }
    );
  }
}
