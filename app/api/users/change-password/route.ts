import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Password attuale e nuova password sono obbligatorie' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'La nuova password deve essere di almeno 8 caratteri' },
        { status: 400 }
      );
    }

    // Recupera l'utente dal database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Utente non trovato' },
        { status: 404 }
      );
    }

    // Verifica la password attuale
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Password attuale non corretta' },
        { status: 400 }
      );
    }

    // Verifica che la nuova password sia diversa dalla vecchia
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'La nuova password deve essere diversa dalla password attuale' },
        { status: 400 }
      );
    }

    // Hash della nuova password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Aggiorna la password e rimuovi il flag mustChangePassword
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    });

    return NextResponse.json({ message: 'Password cambiata con successo' }, { status: 200 });
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json(
      { error: 'Errore durante il cambio password' },
      { status: 500 }
    );
  }
}

