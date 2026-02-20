import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo ADMIN e SUPER_ADMIN possono archiviare location
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    
    // Verifica che la location esista
    const location = await prisma.location.findUnique({
      where: { id },
    });

    if (!location) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    // Toggle isArchived - gestisce anche il caso in cui sia null
    const currentArchived = location.isArchived ?? false;
    const updated = await prisma.location.update({
      where: { id },
      data: {
        isArchived: !currentArchived,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Error archiving location:", error);
    return NextResponse.json(
      { error: "Failed to archive location", details: error.message },
      { status: 500 }
    );
  }
}

