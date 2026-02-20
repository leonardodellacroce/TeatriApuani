import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';

const DEFAULT_PASSWORD = 'password123';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Solo SUPER_ADMIN, ADMIN e RESPONSABILE possono resettare le password
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Se è RESPONSABILE, verifica che l'utente appartenga alla sua azienda
    if (session.user.role === "RESPONSABILE") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      
      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { companyId: true },
      });
      
      if (currentUser?.companyId !== targetUser?.companyId) {
        return NextResponse.json(
          { error: 'Forbidden - Puoi resettare la password solo degli utenti della tua azienda' },
          { status: 403 }
        );
      }
    }

    // Verifica che l'utente esista
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
    }

    // Hash della password di default
    const hashedPassword = await hash(DEFAULT_PASSWORD, 10);

    // Aggiorna la password e imposta mustChangePassword a true
    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        mustChangePassword: true,
      },
    });

    return NextResponse.json(
      { message: 'Password resettata con successo. L\'utente dovrà cambiare la password al prossimo accesso.' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error resetting password:', error);
    
    // Gestisci il caso in cui mustChangePassword non esista nel database
    const errorMessage = String(error?.message || '').toLowerCase();
    if (errorMessage.includes('mustchangepassword') || 
        errorMessage.includes('unknown field') ||
        errorMessage.includes('unknown column')) {
      // Se il campo non esiste, aggiorna solo la password
      try {
        const { id } = await params;
        const hashedPassword = await hash(DEFAULT_PASSWORD, 10);
        await prisma.user.update({
          where: { id },
          data: {
            password: hashedPassword,
          },
        });
        return NextResponse.json(
          { message: 'Password resettata con successo.' },
          { status: 200 }
        );
      } catch (retryError) {
        console.error('Error resetting password (retry):', retryError);
        throw retryError;
      }
    }
    
    return NextResponse.json(
      { error: 'Errore durante il reset della password' },
      { status: 500 }
    );
  }
}

