import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/locations
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const archived = searchParams.get("archived");
    const name = searchParams.get("name");
    const city = searchParams.get("city");
    const excludeId = searchParams.get("excludeId");
    
    console.log("GET /api/locations - Session:", session);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fast-path: uniqueness check (name+city)
    if (name) {
      const whereClause: any = {
        name: name.trim(),
      };
      if (city && city.trim() !== "") {
        whereClause.city = city.trim();
      }
      // by default consider only non-archived
      whereClause.isArchived = false;
      if (excludeId) {
        whereClause.NOT = { id: excludeId };
      }

      const existing = await prisma.location.findFirst({ where: whereClause });
      return NextResponse.json({ exists: !!existing });
    }

    console.log("Fetching locations from database...");
    
    let whereClause: any = {};
    if (archived === "true") {
      whereClause.isArchived = true;
    } else if (archived === "false") {
      whereClause.isArchived = false;
    } else {
      // Di default mostra solo elementi non archiviati
      whereClause.isArchived = false;
    }
    
    const locations = await prisma.location.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json(
      { error: "Error fetching locations", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/locations
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    console.log("POST /api/locations - Session:", session);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    console.log("Body received:", body);
    const { name, address, city, province, postalCode, color } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    console.log("Creating location in database...");
    
    // Calcola il prossimo codice progressivo
    const count = await prisma.location.count();
    const code = String(count + 1).padStart(3, '0');
    
    const location = await prisma.location.create({
      data: {
        code,
        name,
        address,
        city,
        province,
        postalCode,
        color,
      },
    });

    console.log("Location created:", location);
    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    console.error("Error creating location:", error);
    return NextResponse.json(
      { error: "Error creating location", details: String(error) },
      { status: 500 }
    );
  }
}

