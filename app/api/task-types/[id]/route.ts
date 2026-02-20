import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/task-types/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Solo ADMIN e SUPER_ADMIN possono vedere le tipologie di attività
  const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const taskType = await prisma.taskType.findUnique({
      where: { id },
    });

    if (!taskType) {
      return NextResponse.json(
        { error: "Tipologia non trovata" },
        { status: 404 }
      );
    }

    return NextResponse.json(taskType);
  } catch (error) {
    console.error("Error fetching task type:", error);
    return NextResponse.json(
      { error: "Error fetching task type" },
      { status: 500 }
    );
  }
}

// PATCH /api/task-types/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Solo ADMIN e SUPER_ADMIN possono modificare le tipologie di attività
  const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, type, color, areas, isHourlyService, shiftHours } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Il nome è obbligatorio" },
        { status: 400 }
      );
    }

    if (type && !["ACTIVITY", "SHIFT"].includes(type)) {
      return NextResponse.json(
        { error: "Il tipo deve essere ACTIVITY o SHIFT" },
        { status: 400 }
      );
    }

    // Recupera la tipologia corrente per ottenere il tipo se non viene fornito
    const currentTaskType = await prisma.taskType.findUnique({
      where: { id },
      select: { type: true },
    });

    if (!currentTaskType) {
      return NextResponse.json(
        { error: "Tipologia non trovata" },
        { status: 404 }
      );
    }

    // Usa il tipo dal body se fornito, altrimenti usa quello corrente
    const taskTypeToCheck = type || currentTaskType.type;

    // Verifica che il nome non esista già per questo tipo (escludendo l'id corrente)
    const existingTaskType = await prisma.taskType.findFirst({
      where: {
        name: name.trim(),
        type: taskTypeToCheck,
        NOT: { id },
      },
    });

    if (existingTaskType) {
      return NextResponse.json(
        { error: "Una tipologia con questo nome esiste già per questo tipo" },
        { status: 400 }
      );
    }

    const updateData: any = {
      name: name.trim(),
      description: description?.trim() || null,
    };

    if (type) {
      updateData.type = type;
    }

    // Per i turni (SHIFT), aggiorna il colore, isHourlyService e shiftHours
    // Per le attività (ACTIVITY), il colore deve sempre essere null
    if (currentTaskType.type === "SHIFT") {
      if (color !== undefined) {
        updateData.color = color || null;
      }
      if (areas !== undefined) {
        updateData.areas = (areas && Array.isArray(areas) && areas.length > 0) ? JSON.stringify(areas) : null;
      }
      // Aggiorna isHourlyService se fornito (incluso false)
      // IMPORTANTE: controlliamo !== undefined per includere anche false
      if (isHourlyService !== undefined) {
        updateData.isHourlyService = Boolean(isHourlyService);
      }
      if (shiftHours !== undefined) {
        const shouldSaveHours = isHourlyService === false && shiftHours !== null && shiftHours !== undefined && !isNaN(parseFloat(shiftHours));
        updateData.shiftHours = shouldSaveHours ? parseFloat(shiftHours) : null;
      }
    } else {
      if (color !== undefined) {
        updateData.color = null;
      }
      if (areas !== undefined) {
        updateData.areas = null;
      }
    }

    try {
      console.log("updateData before save:", JSON.stringify(updateData, null, 2));
      const taskType = await prisma.taskType.update({
        where: { id },
        data: updateData as any,
      });
      console.log("taskType after save:", {
        id: taskType.id,
        name: taskType.name,
        isHourlyService: taskType.isHourlyService,
        shiftHours: taskType.shiftHours,
      });

      return NextResponse.json(taskType);
    } catch (dbError: any) {
      // Se l'errore è dovuto a campi che non esistono ancora (migrazione non eseguita),
      // rimuovili e riprova
      if (dbError?.message?.includes("Unknown argument") || 
          dbError?.message?.includes("Unknown field") ||
          dbError?.code === "P2009") {
        const fieldsToRemove = ['isHourlyService', 'shiftHours'];
        const hasUnknownFields = fieldsToRemove.some(field => 
          dbError?.message?.includes(field)
        );

        if (hasUnknownFields) {
          // Rimuovi i campi problematici e riprova
          const safeUpdateData = { ...updateData };
          delete safeUpdateData.isHourlyService;
          delete safeUpdateData.shiftHours;

          const taskType = await prisma.taskType.update({
            where: { id },
            data: safeUpdateData as any,
          });

          return NextResponse.json(taskType);
        }
      }
      throw dbError;
    }
  } catch (error) {
    console.error("Error updating task type:", error);
    return NextResponse.json(
      { error: "Error updating task type", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/task-types/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Solo ADMIN e SUPER_ADMIN possono eliminare le tipologie di attività
  const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await prisma.taskType.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task type:", error);
    return NextResponse.json(
      { error: "Error deleting task type" },
      { status: 500 }
    );
  }
}

