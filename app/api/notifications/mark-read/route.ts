import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/notifications/mark-read - Segna come lette le notifiche specificate
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids è obbligatorio (array di stringhe)" }, { status: 400 });
    }

    const validIds = ids.filter((id: unknown) => typeof id === "string" && id.trim() !== "");

    const updated = await prisma.notification.updateMany({
      where: {
        id: { in: validIds },
        userId: session.user.id,
      },
      data: { read: true },
    });

    return NextResponse.json({ ok: true, count: updated.count });
  } catch (error) {
    console.error("Error marking notifications read:", error);
    return NextResponse.json(
      { error: "Failed to update notifications", details: String(error) },
      { status: 500 }
    );
  }
}
