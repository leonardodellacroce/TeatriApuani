import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Conta le indisponibilità in attesa di approvazione del lavoratore corrente. */
export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? session?.user?.id;
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await prisma.unavailability.count({
      where: {
        userId,
        status: "PENDING_APPROVAL",
      },
    });

    return NextResponse.json({ count });
  } catch (e) {
    console.error("GET /api/unavailabilities/my-pending-count error", e);
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
