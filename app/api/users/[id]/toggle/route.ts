import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/users/[id]/toggle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // SUPER_ADMIN, ADMIN e RESPONSABILE possono attivare/disattivare utenti
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    console.log("Toggle user - ID:", id);

    // Non è consentito auto-disattivarsi
    if (id === session.user.id) {
      return NextResponse.json({ error: "Non puoi disattivare il tuo stesso utente" }, { status: 400 });
    }

    // Recupera l'utente per vedere lo stato attuale
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      console.log("User not found for ID:", id);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Nessuno tranne un SUPER_ADMIN può toccare un SUPER_ADMIN
    if (user.isSuperAdmin && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo un Super Admin può modificare un Super Admin" }, { status: 403 });
    }

    // Se è RESPONSABILE, verifica che l'utente appartenga alla sua azienda
    if (session.user.role === "RESPONSABILE") {
      const loggedInUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      if (loggedInUser?.companyId !== user.companyId) {
        return NextResponse.json({ error: "Forbidden - Puoi modificare solo gli utenti della tua azienda" }, { status: 403 });
      }
    }

    console.log("Current user state - isActive:", user.isActive);

    // Toggle dello stato
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      include: { company: true },
    });

    console.log("Updated user - isActive:", updatedUser.isActive);

    const { password, ...userWithoutPassword } = updatedUser;
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    console.error("Error toggling user:", error);
    return NextResponse.json({ error: "Error toggling user" }, { status: 500 });
  }
}

