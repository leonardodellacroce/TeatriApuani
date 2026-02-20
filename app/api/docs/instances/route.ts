import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/docs/instances
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const instances = await prisma.docInstance.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(instances);
  } catch (error) {
    console.error("Error fetching instances:", error);
    return NextResponse.json(
      { error: "Error fetching instances", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/docs/instances
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { templateId, title, dataJson } = body;

    if (!templateId || !title) {
      return NextResponse.json(
        { error: "Template ID and title are required" },
        { status: 400 }
      );
    }

    const instance = await prisma.docInstance.create({
      data: {
        templateId,
        title,
        dataJson: JSON.stringify(dataJson || {}),
        createdById: session.user.id!,
        status: "DRAFT",
      },
    });

    return NextResponse.json(instance, { status: 201 });
  } catch (error) {
    console.error("Error creating instance:", error);
    return NextResponse.json(
      { error: "Error creating instance", details: String(error) },
      { status: 500 }
    );
  }
}

