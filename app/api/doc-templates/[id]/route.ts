import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/doc-templates/[id]
export async function GET(
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

    const template = await prisma.docTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("Error fetching template:", error);
    return NextResponse.json(
      { error: "Error fetching template", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/doc-templates/[id]
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
    const body = await req.json();
    const { title, description, category, pageSettings, pages, locationId } = body;

    console.log("[PATCH /api/doc-templates/[id]] Received body:", { title, description, category, pageSettings: !!pageSettings, pages: !!pages, locationId });

    // Costruisci l'oggetto data solo con i campi definiti
    const updateData: any = {};
    
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;
    if (category !== undefined) updateData.category = category || null;
    if (pageSettings !== undefined) updateData.pageSettings = JSON.stringify(pageSettings);
    if (pages !== undefined) updateData.blocksJson = JSON.stringify(pages);
    if (locationId !== undefined) updateData.locationId = locationId || null;

    console.log("[PATCH /api/doc-templates/[id]] Update data:", updateData);

    const template = await prisma.docTemplate.update({
      where: { id },
      data: updateData,
    });

    console.log("[PATCH /api/doc-templates/[id]] Updated template:", template.id);

    return NextResponse.json(template);
  } catch (error) {
    console.error("[PATCH /api/doc-templates/[id]] Error updating template:", error);
    return NextResponse.json(
      { error: "Error updating template", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/doc-templates/[id]
export async function DELETE(
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

    await prisma.docTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting template:", error);
    return NextResponse.json(
      { error: "Error deleting template", details: String(error) },
      { status: 500 }
    );
  }
}

