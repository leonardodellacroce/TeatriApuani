import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ADMIN_ROLES.includes(session?.user?.role || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isNonStandardWorker = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "") && (session?.user as any)?.isWorker === true;
  const workMode = getWorkModeFromRequest(req as any);
  if (isNonStandardWorker && workMode === "worker") {
    return NextResponse.json({ count: 0 });
  }

  try {
    const count = await prisma.unavailability.count({
      where: { status: "PENDING_APPROVAL" },
    });
    return NextResponse.json({ count });
  } catch (e) {
    console.error("GET /api/unavailabilities/pending-count error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
