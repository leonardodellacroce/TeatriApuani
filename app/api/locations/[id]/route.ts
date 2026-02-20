import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/locations/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const location = await prisma.location.findUnique({
    where: { id },
  });

  if (!location) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(location);
}

// PATCH /api/locations/[id]
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
    const { name, address, city, province, postalCode, color } = body;

    const location = await prisma.location.update({
      where: { id },
      data: {
        name,
        address,
        city,
        province,
        postalCode,
        color,
      },
    });

    return NextResponse.json(location);
  } catch (error) {
    console.error("Error updating location:", error);
    return NextResponse.json(
      { error: "Error updating location", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/locations/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  await prisma.location.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}

