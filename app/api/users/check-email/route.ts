import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const excludeId = searchParams.get('excludeId');

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    return NextResponse.json({ available: !existingUser });
  } catch (error) {
    console.error('Error checking email availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

