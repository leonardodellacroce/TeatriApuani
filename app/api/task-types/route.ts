import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/task-types
export async function GET() {
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
    const taskTypes = await prisma.taskType.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json(taskTypes);
  } catch (error) {
    console.error("Error fetching task types:", error);
    return NextResponse.json(
      { error: "Error fetching task types" },
      { status: 500 }
    );
  }
}

// POST /api/task-types
export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Solo ADMIN e SUPER_ADMIN possono creare tipologie di attività
  const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, description, type, color, areas, isHourlyService, shiftHours } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Il nome è obbligatorio" },
        { status: 400 }
      );
    }

    if (!type || !["ACTIVITY", "SHIFT"].includes(type)) {
      return NextResponse.json(
        { error: "Il tipo deve essere ACTIVITY o SHIFT" },
        { status: 400 }
      );
    }

    // Verifica che il nome non esista già per questo tipo
    const existingTaskType = await prisma.taskType.findFirst({
      where: { 
        name: name.trim(),
        type: type,
      },
    });

    if (existingTaskType) {
      return NextResponse.json(
        { error: "Una tipologia con questo nome esiste già per questo tipo" },
        { status: 400 }
      );
    }

    // Prepara i dati per la creazione
    const createData: {
      name: string;
      description: string | null;
      type: string;
      color: string | null;
      areas: string | null;
      isHourlyService?: boolean;
      shiftHours?: number | null;
    } = {
      name: name.trim(),
      description: description?.trim() || null,
      type: type,
      color: color || null,
      areas: (areas && Array.isArray(areas) && areas.length > 0) ? JSON.stringify(areas) : null,
    };

    // Aggiungi i campi per i turni (SHIFT)
    if (type === "SHIFT") {
      createData.isHourlyService = isHourlyService ?? true;
      createData.shiftHours = (!createData.isHourlyService && shiftHours != null) ? parseFloat(String(shiftHours)) : null;
    }

    try {
      const taskType = await prisma.taskType.create({
        data: createData,
      });

      return NextResponse.json(taskType, { status: 201 });
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
          const safeCreateData = { ...createData };
          delete safeCreateData.isHourlyService;
          delete safeCreateData.shiftHours;

          const taskType = await prisma.taskType.create({
            data: safeCreateData,
          });

          return NextResponse.json(taskType, { status: 201 });
        }
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error("Error creating task type:", error);
    const errorMessage = error?.message || String(error);
    return NextResponse.json(
      { error: "Error creating task type", details: errorMessage },
      { status: 500 }
    );
  }
}

