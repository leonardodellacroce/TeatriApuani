import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// PATCH /api/clients/[id]/archive
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Recupera il cliente per vedere lo stato attuale
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Toggle dello stato archivio
    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        isArchived: !client.isArchived,
      },
    });

    return NextResponse.json(updatedClient);
  } catch (error) {
    console.error("Error archiving client:", error);
    return NextResponse.json(
      { error: "Error archiving client", details: String(error) },
      { status: 500 }
    );
  }
}


