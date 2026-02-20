import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo admin possono archiviare
    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Verifica che l'istanza esista
    const instance = await prisma.docInstance.findUnique({
      where: { id },
    });

    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    // Verifica che sia firmata
    if (instance.status !== "SIGNED") {
      return NextResponse.json(
        { error: "Can only archive SIGNED instances", currentStatus: instance.status },
        { status: 400 }
      );
    }

    // Archivia
    const updatedInstance = await prisma.docInstance.update({
      where: { id },
      data: {
        status: "ARCHIVED",
      },
    });

    return NextResponse.json({
      ok: true,
      instance: updatedInstance,
    });
  } catch (error) {
    console.error("Error archiving instance:", error);
    return NextResponse.json(
      { error: "Error archiving instance", details: String(error) },
      { status: 500 }
    );
  }
}

