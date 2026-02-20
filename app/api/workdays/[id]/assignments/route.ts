import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/workdays/[id]/assignments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: workdayId } = await params;

    const assignments = await prisma.assignment.findMany({
      where: { workdayId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        taskType: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return NextResponse.json(
      { error: "Error fetching assignments" },
      { status: 500 }
    );
  }
}

