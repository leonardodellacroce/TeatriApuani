import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cf = searchParams.get('cf');
  const excludeId = searchParams.get('excludeId');

  if (!cf) {
    return NextResponse.json({ error: 'Codice Fiscale is required' }, { status: 400 });
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        codiceFiscale: cf,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    return NextResponse.json({ available: !existingUser });
  } catch (error) {
    console.error('Error checking codice fiscale availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

