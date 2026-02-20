import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/doc-templates
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await prisma.docTemplate.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Error fetching templates", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/doc-templates
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, category, pageSettings, pages, locationId } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const template = await prisma.docTemplate.create({
      data: {
        title,
        description: description || null,
        category: category || null,
        pageSettings: JSON.stringify(pageSettings),
        blocksJson: JSON.stringify(pages || []),
        locationId: locationId || null,
        createdBy: session.user.email || null,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json(
      { error: "Error creating template", details: String(error) },
      { status: 500 }
    );
  }
}

