import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const now = new Date();
  const locked = await prisma.user.findMany({
    where: {
      lockedUntil: { gt: now },
    },
    select: {
      id: true,
      email: true,
      name: true,
      cognome: true,
      code: true,
      lockedUntil: true,
      failedLoginAttempts: true,
    },
    orderBy: { lockedUntil: "asc" },
  });
  return NextResponse.json(
    locked.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      cognome: u.cognome,
      code: u.code,
      lockedUntil: u.lockedUntil?.toISOString() ?? null,
      failedLoginAttempts: u.failedLoginAttempts ?? 0,
    }))
  );
}
