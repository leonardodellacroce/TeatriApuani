import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMonthClosed } from "@/lib/closedMonth";
import { isPreviousMonth } from "@/lib/previousMonth";

export const dynamic = "force-dynamic";

/** Genera tutti i (year, month) da (yearStart, monthStart) fino a (yearEnd, monthEnd) inclusi */
function* monthsRange(
  yearStart: number,
  monthStart: number,
  yearEnd: number,
  monthEnd: number
): Generator<[number, number]> {
  let y = yearStart;
  let m = monthStart;
  while (y < yearEnd || (y === yearEnd && m <= monthEnd)) {
    yield [y, m];
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

/** PATCH /api/months/[year]/[month]/toggle - Apri o chiudi un mese */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ year: string; month: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo ADMIN e SUPER_ADMIN possono aprire/chiudere mesi
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { year, month } = await params;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: "Parametri year/month non validi" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { isClosed } = body;

    if (typeof isClosed !== "boolean") {
      return NextResponse.json(
        { error: "isClosed deve essere un boolean" },
        { status: 400 }
      );
    }

    const currentlyClosed = await isMonthClosed(y, m);

    if (isClosed && !currentlyClosed) {
      // Il mese può essere chiuso solo se è già terminato
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-12
      if (y > currentYear || (y === currentYear && m >= currentMonth)) {
        return NextResponse.json(
          { error: "Il mese può essere chiuso solo dopo che è terminato" },
          { status: 400 }
        );
      }

      // CHIUDERE il mese
      // 1. Chiudi tutti i mesi precedenti (da 2020-01 fino a year-month incluso)
      const startYear = 2020;
      const startMonth = 1;
      const monthsToClose: [number, number][] = [];
      for (const [yy, mm] of monthsRange(startYear, startMonth, y, m)) {
        monthsToClose.push([yy, mm]);
      }

      const userId = session.user?.id ?? null;
      const rangeStart = new Date(startYear, startMonth - 1, 1);
      const rangeEnd = new Date(y, m, 0, 23, 59, 59, 999);

      // Timeout 60s per transazioni lunghe (es. chiusura da 2020 a 2026 con Neon)
      await prisma.$transaction(
        async (tx) => {
          // 1. Inserisci tutti i ClosedMonth in una sola query (skipDuplicates = ignora già esistenti)
          await tx.closedMonth.createMany({
            data: monthsToClose.map(([yy, mm]) => ({ year: yy, month: mm, closedByUserId: userId })),
            skipDuplicates: true,
          });

          // 2. Chiudi tutte le giornate nel range con una sola query
          await tx.workday.updateMany({
            where: {
              date: { gte: rangeStart, lte: rangeEnd },
              isOpen: true,
            },
            data: {
              isOpen: false,
              closedByUserId: userId,
            },
          });

          // 3. Trova eventi da chiudere con una sola query
          const workdays = await tx.workday.findMany({
            where: { date: { gte: rangeStart, lte: rangeEnd } },
            select: { eventId: true },
          });
          const eventIdsToClose = [...new Set(workdays.map((w) => w.eventId))];

          if (eventIdsToClose.length > 0) {
            await tx.event.updateMany({
              where: { id: { in: eventIdsToClose } },
              data: { isClosed: true },
            });
          }
        },
        { timeout: 60000, maxWait: 10000 }
      );

      return NextResponse.json({ year: y, month: m, isClosed: true });
    }

    if (!isClosed && currentlyClosed) {
      // APRIRE il mese: ADMIN può riaprire solo il mese precedente (SUPER_ADMIN senza limiti)
      const isSuperAdmin = (session.user as any).isSuperAdmin === true || session.user.role === "SUPER_ADMIN";
      if (!isSuperAdmin && !isPreviousMonth(y, m)) {
        return NextResponse.json(
          { error: "È possibile riaprire solamente il mese precedente a quello in corso" },
          { status: 403 }
        );
      }
      await prisma.closedMonth.deleteMany({
        where: { year: y, month: m },
      });
      return NextResponse.json({ year: y, month: m, isClosed: false });
    }

    return NextResponse.json({ year: y, month: m, isClosed: currentlyClosed });
  } catch (error) {
    console.error("PATCH /api/months/[year]/[month]/toggle error:", error);
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json(
      {
        error: "Errore nel toggle del mese",
        ...(process.env.NODE_ENV === "development" && { detail: message }),
      },
      { status: 500 }
    );
  }
}
