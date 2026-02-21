import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const getCachedAreas = unstable_cache(
  async () => {
    return prisma.area.findMany({
      orderBy: { createdAt: "desc" },
    });
  },
  ["areas-list"],
  { revalidate: 120, tags: ["areas"] }
);

// GET /api/areas
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const areas = await getCachedAreas();

    return NextResponse.json(areas);
  } catch (error) {
    console.error("Error fetching areas:", error);
    return NextResponse.json(
      { error: "Error fetching areas", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/areas
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN può creare aree
    const user = session.user as any;
    const isSuperAdmin = user?.isSuperAdmin || (session.user.role === "SUPER_ADMIN");
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, prefix, enabledInWorkdayPlanning } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!prefix || typeof prefix !== "string") {
      return NextResponse.json(
        { error: "Prefix is required" },
        { status: 400 }
      );
    }

    // Verifica che il prefisso non sia già in uso
    const existingAreaWithPrefix = await prisma.area.findFirst({
      where: { prefix },
    });

    if (existingAreaWithPrefix) {
      return NextResponse.json(
        { error: "This prefix is already in use" },
        { status: 400 }
      );
    }

    // Calcola il prossimo codice progressivo LIBERO (gestisce cancellazioni)
    const existingAreas = await prisma.area.findMany({
      select: { code: true },
      orderBy: { code: "asc" },
    });
    const used = new Set(existingAreas.map((a) => parseInt(a.code, 10)).filter((n) => !Number.isNaN(n)));
    let nextNum = 1;
    while (used.has(nextNum)) nextNum += 1; // primo slot libero
    const code = String(nextNum).padStart(3, '0');

    const area = await prisma.area.create({
      data: {
        code,
        name,
        prefix,
        enabledInWorkdayPlanning: enabledInWorkdayPlanning === true,
      },
    });

    revalidateTag("areas", "max");

    return NextResponse.json(area, { status: 201 });
  } catch (error) {
    console.error("Error creating area:", error);
    return NextResponse.json(
      { error: "Error creating area", details: String(error) },
      { status: 500 }
    );
  }
}

