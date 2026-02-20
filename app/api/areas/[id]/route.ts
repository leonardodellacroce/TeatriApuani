import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/areas/[id]
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

    const area = await prisma.area.findUnique({
      where: { id },
    });

    if (!area) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(area);
  } catch (error) {
    console.error("Error fetching area:", error);
    return NextResponse.json(
      { error: "Error fetching area", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/areas/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN può modificare aree
    const user = session.user as any;
    const isSuperAdmin = user?.isSuperAdmin || (session.user.role === "SUPER_ADMIN");
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, prefix, enabledInWorkdayPlanning } = body;
    
    console.log("PATCH /api/areas/[id] - Body received:", { name, prefix, enabledInWorkdayPlanning, body });

    // Se viene fornito un nuovo prefisso, verifica che non sia già in uso
    if (prefix) {
      const existingAreaWithPrefix = await prisma.area.findFirst({
        where: { 
          prefix,
          NOT: { id } // Escludi l'area corrente
        },
      });

      if (existingAreaWithPrefix) {
        return NextResponse.json(
          { error: "This prefix is already in use" },
          { status: 400 }
        );
      }
    }

    // Trova l'area corrente per confrontare il vecchio e nuovo prefisso
    const currentArea = await prisma.area.findUnique({
      where: { id },
    });

    if (!currentArea) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    // Prepara i dati per l'aggiornamento
    // Usa il tipo direttamente da Prisma per assicurarsi che sia corretto
    const updateData: {
      name?: string;
      prefix?: string | null;
      enabledInWorkdayPlanning?: boolean;
    } = {};
    
    // Sempre includi il nome se fornito
    if (name !== undefined && name !== null) {
      updateData.name = name.trim();
    }
    
    // Includi il prefisso se fornito (può essere null per rimuoverlo)
    if (prefix !== undefined) {
      updateData.prefix = prefix && prefix.trim() ? prefix.trim() : null;
    }
    
    // Includi enabledInWorkdayPlanning se fornito
    if (enabledInWorkdayPlanning !== undefined) {
      updateData.enabledInWorkdayPlanning = enabledInWorkdayPlanning === true || enabledInWorkdayPlanning === "true";
    }
    
    console.log("Updating area with data:", updateData);
    console.log("updateData keys:", Object.keys(updateData));
    
    // Aggiorna l'area
    const updatedArea = await prisma.area.update({
      where: { id },
      data: updateData,
    });
    
    console.log("Area updated successfully:", updatedArea);
    
    // Se il prefisso è cambiato, aggiorna tutti i codici delle mansioni di quest'area
    if (prefix && currentArea.prefix && prefix !== currentArea.prefix) {
      const oldPrefix = currentArea.prefix;
      const newPrefix = prefix;
      
      console.log(`Updating prefix from ${oldPrefix} to ${newPrefix} for area ${currentArea.name}`);
      
      // Trova tutte le mansioni di quest'area
      const dutiesToUpdate = await prisma.duty.findMany({
        where: {
          area: currentArea.name,
        },
      });

      console.log(`Found ${dutiesToUpdate.length} duties to update`);

      // Aggiorna ogni mansione sostituendo il prefisso nel codice
      for (const duty of dutiesToUpdate) {
        // Estrai il numero dal codice (es. da "B-001" estrai "001")
        const codeMatch = duty.code.match(/^[A-Z]-(\d{3})$/);
        if (codeMatch && codeMatch[1]) {
          const codeNumber = codeMatch[1];
          const newCode = `${newPrefix}-${codeNumber}`;
          
          console.log(`Updating duty ${duty.code} to ${newCode}`);
          
          await prisma.duty.update({
            where: { id: duty.id },
            data: { code: newCode },
          });
        }
      }
      
      console.log(`Completed updating duty codes for area ${currentArea.name}`);
    }

    return NextResponse.json(updatedArea);
  } catch (error: any) {
    console.error("Error updating area:", error);
    const errorMessage = error?.message || String(error);
    console.error("Error details:", {
      message: errorMessage,
      stack: error?.stack,
      code: error?.code,
      meta: error?.meta,
    });
    return NextResponse.json(
      { error: "Error updating area", details: errorMessage },
      { status: 500 }
    );
  }
}

// DELETE /api/areas/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN può eliminare aree
    const user = session.user as any;
    const isSuperAdmin = user?.isSuperAdmin || (session.user.role === "SUPER_ADMIN");
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    await prisma.area.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting area:", error);
    return NextResponse.json(
      { error: "Error deleting area", details: String(error) },
      { status: 500 }
    );
  }
}

