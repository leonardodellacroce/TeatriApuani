import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMonthClosed } from "@/lib/closedMonth";

export const dynamic = "force-dynamic";

/** GET /api/months/[year]/[month] - Ritorna se il mese è chiuso */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ year: string; month: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { year, month } = await params;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: "Parametri year/month non validi" }, { status: 400 });
    }

    const closed = await isMonthClosed(y, m);
    return NextResponse.json({ year: y, month: m, isClosed: closed });
  } catch (error) {
    console.error("GET /api/months/[year]/[month] error:", error);
    return NextResponse.json(
      { error: "Errore nel recupero dello stato del mese" },
      { status: 500 }
    );
  }
}
