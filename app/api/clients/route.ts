import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/clients
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo SUPER_ADMIN, ADMIN e RESPONSABILE possono vedere i clienti
    if (!["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Per default mostra solo i clienti attivi (non archiviati)
    // La query per gli archiviati viene passata dal frontend
    const showArchived = new URL(req.url).searchParams.get("archived") === "true";

    const clients = await prisma.client.findMany({
      where: {
        isArchived: showArchived,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "Error fetching clients", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/clients
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
    const { type, ragioneSociale, nome, cognome, address, city, province, postalCode, partitaIva, codiceFiscale, codiceSDI, codicePA, email, pec } = body;

    if (!type) {
      return NextResponse.json(
        { error: "Il tipo cliente è obbligatorio" },
        { status: 400 }
      );
    }

    // Calcola il prossimo codice progressivo
    const count = await prisma.client.count({
      where: { isArchived: false },
    });
    const code = String(count + 1).padStart(3, '0');

    const client = await prisma.client.create({
      data: {
        code,
        type,
        ragioneSociale,
        nome,
        cognome,
        address,
        city,
        province,
        postalCode,
        partitaIva,
        codiceFiscale,
        codiceSDI,
        codicePA,
        email,
        pec,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Error creating client", details: String(error) },
      { status: 500 }
    );
  }
}

