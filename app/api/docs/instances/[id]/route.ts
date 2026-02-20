import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/docs/instances/[id]
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

    const instance = await prisma.docInstance.findUnique({
      where: { id },
      include: {
        signEvents: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    return NextResponse.json(instance);
  } catch (error) {
    console.error("Error fetching instance:", error);
    return NextResponse.json(
      { error: "Error fetching instance", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/docs/instances/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verifica che l'istanza esista
    const existingInstance = await prisma.docInstance.findUnique({
      where: { id },
    });

    if (!existingInstance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    // Se è già firmata o archiviata, non permettere modifiche ai dati
    if (existingInstance.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Cannot modify instance in " + existingInstance.status + " status" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { title, dataJson } = body;

    const instance = await prisma.docInstance.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        dataJson: dataJson !== undefined ? JSON.stringify(dataJson) : undefined,
      },
    });

    return NextResponse.json(instance);
  } catch (error) {
    console.error("Error updating instance:", error);
    return NextResponse.json(
      { error: "Error updating instance", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/docs/instances/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.docInstance.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting instance:", error);
    return NextResponse.json(
      { error: "Error deleting instance", details: String(error) },
      { status: 500 }
    );
  }
}

