import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/notifications/debug - Solo per debug, rimuovere in produzione
export async function GET() {
  const steps: string[] = [];
  try {
    steps.push("1. auth()...");
    const session = await auth();
    steps.push(`2. session: ${session ? "ok" : "null"}`);
    if (!session?.user?.id) {
      return NextResponse.json({ steps, error: "No session or user.id" }, { status: 401 });
    }
    steps.push(`3. userId: ${session.user.id}`);

    steps.push("4. prisma.notification.findMany...");
    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      take: 1,
    });
    steps.push(`5. found ${notifications.length} notifications`);
    return NextResponse.json({ steps, ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    steps.push(`ERROR: ${msg}`);
    return NextResponse.json(
      { steps, error: msg, stack: process.env.NODE_ENV === "development" ? stack : undefined },
      { status: 500 }
    );
  }
}
