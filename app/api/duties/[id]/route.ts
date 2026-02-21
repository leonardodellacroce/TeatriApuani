import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/duties/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const duty = await prisma.duty.findUnique({
      where: { id },
    });

    if (!duty) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(duty);
  } catch (error) {
    console.error("Error fetching duty:", error);
    return NextResponse.json(
      { error: "Error fetching duty", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/duties/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN può modificare mansioni
    const user = session.user as any;
    const isSuperAdmin = user?.isSuperAdmin || (session.user.role === "SUPER_ADMIN");
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, area, code } = body as { name?: string; area?: string; code?: string };

    if (!name || !area) {
      return NextResponse.json({ error: "Name and area are required" }, { status: 400 });
    }

    // Se viene fornito un codice, validalo: prefisso coerente con area + 3 cifre
    let updateData: any = { name, area };
    if (code) {
    const prefixMap: Record<string, string> = {
      "Area di Biglietteria": "B",
      "Area di Sala": "S",
      "Area Tecnica": "T",
    };
      const expectedPrefix = prefixMap[area] || "";

      const match = code.match(/^([A-Z])-?(\d{3})$/);
      if (!match) {
        return NextResponse.json(
          { error: "Formato codice non valido. Atteso PREFISSO-XXX" },
          { status: 400 }
        );
      }
      const providedPrefix = match[1];
      const numeric = match[2];

      if (providedPrefix !== expectedPrefix) {
        return NextResponse.json(
          { error: "Prefisso del codice non coerente con l'area" },
          { status: 400 }
        );
      }

      if (numeric.length !== 3) {
        return NextResponse.json(
          { error: "Il codice deve essere esattamente di 3 cifre" },
          { status: 400 }
        );
      }

      const fullCode = `${expectedPrefix}-${numeric}`;

      // Verifica unicità escludendo l'ID corrente
      const existing = await prisma.duty.findFirst({
        where: {
          code: fullCode,
          NOT: { id },
        },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Codice già esistente" },
          { status: 400 }
        );
      }

      updateData.code = fullCode;
    }

    const duty = await prisma.duty.update({
      where: { id },
      data: updateData,
    });

    revalidateTag("duties", "max");

    return NextResponse.json(duty);
  } catch (error) {
    console.error("Error updating duty:", error);
    return NextResponse.json(
      { error: "Error updating duty", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/duties/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN può eliminare mansioni
    const user = session.user as any;
    const isSuperAdmin = user?.isSuperAdmin || (session.user.role === "SUPER_ADMIN");
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    await prisma.duty.delete({
      where: { id },
    });

    revalidateTag("duties", "max");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting duty:", error);
    return NextResponse.json(
      { error: "Error deleting duty", details: String(error) },
      { status: 500 }
    );
  }
}

