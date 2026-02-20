import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/users/me
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Recupera i dati completi dell'utente corrente
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        cognome: true,
        email: true,
        role: true,
        companyId: true,
        areas: true,
        company: {
          select: {
            id: true,
            ragioneSociale: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching current user:", error);
    return NextResponse.json(
      { error: "Error fetching current user", details: String(error) },
      { status: 500 }
    );
  }
}

