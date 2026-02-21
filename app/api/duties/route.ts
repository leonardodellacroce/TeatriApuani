import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

function getCachedDuties(area: string | null) {
  return unstable_cache(
    async () => {
      const where = area ? { area } : {};
      return prisma.duty.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
    },
    ["duties-list", area ?? "all"],
    { revalidate: 120, tags: ["duties"] }
  )();
}

// GET /api/duties
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");
    const code = searchParams.get("code");
    const excludeId = searchParams.get("excludeId");

    // If validating a code, return existence boolean (no cache - validation)
    if (code) {
      const existing = await prisma.duty.findFirst({
        where: {
          code,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      });
      return NextResponse.json({ exists: Boolean(existing) });
    }

    const duties = await getCachedDuties(area);

    return NextResponse.json(duties);
  } catch (error) {
    console.error("Error fetching duties:", error);
    return NextResponse.json(
      { error: "Error fetching duties", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/duties
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN può creare mansioni
    const user = session.user as any;
    const isSuperAdmin = user?.isSuperAdmin || (session.user.role === "SUPER_ADMIN");
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, area, code } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!area || typeof area !== "string") {
      return NextResponse.json(
        { error: "Area is required" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Code is required" },
        { status: 400 }
      );
    }

    // Verifica che il codice non esista già
    const existing = await prisma.duty.findFirst({
      where: { code },
    });
    
    if (existing) {
      return NextResponse.json(
        { error: "Codice già esistente" },
        { status: 400 }
      );
    }

    const duty = await prisma.duty.create({
      data: {
        code,
        name,
        area,
      },
    });

    revalidateTag("duties", "max");

    return NextResponse.json(duty, { status: 201 });
  } catch (error) {
    console.error("Error creating duty:", error);
    return NextResponse.json(
      { error: "Error creating duty", details: String(error) },
      { status: 500 }
    );
  }
}

