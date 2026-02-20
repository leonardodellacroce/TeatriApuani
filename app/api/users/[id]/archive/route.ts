import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN e ADMIN possono archiviare utenti
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    
    // Verifica che l'utente esista
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Non permettere ad un utente di archiviare se stesso
    if (session.user.id === user.id) {
      return NextResponse.json({ error: "Non puoi archiviare il tuo stesso utente" }, { status: 400 });
    }

    // Non permettere ad un admin di archiviare un superadmin
    if (session.user.role === "ADMIN" && user.isSuperAdmin) {
      return NextResponse.json({ error: "Non puoi archiviare un super amministratore" }, { status: 403 });
    }

    // Toggle isArchived - gestisce anche il caso in cui sia null
    const currentArchived = user.isArchived ?? false;
    const updated = await prisma.user.update({
      where: { id },
      data: {
        isArchived: !currentArchived,
      },
    });

    // Rimuovi la password dalla risposta
    const { password, ...userWithoutPassword } = updated;

    return NextResponse.json(userWithoutPassword);
  } catch (error: any) {
    console.error("Error archiving user:", error);
    return NextResponse.json(
      { error: "Failed to archive user", details: error.message },
      { status: 500 }
    );
  }
}
