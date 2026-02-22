import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/notifications/mark-all-read?type=MISSING_HOURS_REMINDER
// Segna come lette tutte le notifiche non lette dell'utente (opzionalmente filtrate per tipo)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const where: any = {
      userId: session.user.id,
      read: false,
    };
    if (type) {
      where.type = type;
    }

    await prisma.notification.updateMany({
      where,
      data: { read: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    return NextResponse.json(
      { error: "Failed to mark as read", details: String(error) },
      { status: 500 }
    );
  }
}
