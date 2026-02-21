import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/cron/keep-warm
// Chiamato da Vercel Cron ogni 4 minuti per mantenere il database Neon attivo
// (evita cold start dopo 5 min di inattività)
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verifica che la richiesta sia da Vercel Cron (Authorization: Bearer CRON_SECRET)
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, status: "warm" });
  } catch (error) {
    console.error("[keep-warm] DB ping failed:", error);
    return NextResponse.json({ error: "DB ping failed" }, { status: 500 });
  }
}
