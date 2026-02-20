import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";

// GET /api/companies/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      users: true,
      _count: {
        select: { users: true },
      },
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(company);
}

// PATCH /api/companies/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
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

  const company = await prisma.company.update({
    where: { id },
    data: {
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

  return NextResponse.json(company);
}

// DELETE /api/companies/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Impedisci l'eliminazione se esistono utenti associati
  const userCount = await prisma.user.count({ where: { companyId: id } });
  if (userCount > 0) {
    return NextResponse.json(
      { error: "Impossibile eliminare: sono presenti utenti associati all'azienda" },
      { status: 400 }
    );
  }

  await prisma.company.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

