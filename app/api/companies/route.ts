import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/companies
export async function GET() {
  try {
    const session = await auth();
    console.log("GET /api/companies - Session:", session);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Fetching companies from database...");
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    return NextResponse.json(companies);
  } catch (error) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { error: "Error fetching companies", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/companies
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    console.log("POST /api/companies - Session:", session);

    if (!session || !session.user) {
      console.log("Unauthorized - No session or user");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("User role:", session.user.role);
    
    if (!isAdmin(session.user)) {
      console.log("Forbidden - Not admin");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    console.log("Body received:", body);
    
    const {
      ragioneSociale,
      address,
      city,
      province,
      postalCode,
      partitaIva,
      codiceFiscale,
      codiceSDI,
      email,
      pec,
    } = body;

    if (!ragioneSociale || typeof ragioneSociale !== "string") {
      return NextResponse.json(
        { error: "Ragione sociale is required" },
        { status: 400 }
      );
    }

            console.log("Creating company in database...");
            
            // Calcola il prossimo codice progressivo
            const count = await prisma.company.count();
            const code = String(count + 1).padStart(3, '0');
            
            const company = await prisma.company.create({
              data: {
                code,
                ragioneSociale,
                address,
                city,
                province,
                postalCode,
                partitaIva,
                codiceFiscale,
                codiceSDI,
                email,
                pec,
              },
            });

    console.log("Company created:", company);
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "Errore durante la creazione", details: String(error) },
      { status: 500 }
    );
  }
}

