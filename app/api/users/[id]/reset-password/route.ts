import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';
import { sendEmail } from '@/lib/email';
import { passwordResetEmail } from '@/lib/email-templates';
import crypto from 'crypto';

function generateTempPassword(length = 12): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

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

    // Sempre: genera password temporanea e invia via email
    const tempPassword = generateTempPassword();
    const hashedPassword = await hash(tempPassword, 10);

    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        mustChangePassword: true,
      },
    });

    const userName = [user.name, user.cognome].filter(Boolean).join(' ') || user.email || 'Utente';
    const { subject, html, text } = passwordResetEmail({
      userName,
      tempPassword,
    });
    const sent = await sendEmail({
      to: user.email,
      subject,
      html,
      text,
    });
    if (!sent) {
      console.warn('[reset-password] Email non inviata, ma password aggiornata');
    }

    const message = "Password resettata con successo. L'utente riceverà la nuova password via email e dovrà cambiarla al primo accesso.";

    return NextResponse.json(
      { message },
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
        const tempPw = generateTempPassword();
        const hashedPassword = await hash(tempPw, 10);
        const user = await prisma.user.findUnique({ where: { id } });
        if (user) {
          await prisma.user.update({ where: { id }, data: { password: hashedPassword } });
          const { subject, html, text } = passwordResetEmail({
            userName: [user.name, user.cognome].filter(Boolean).join(' ') || user.email || 'Utente',
            tempPassword: tempPw,
          });
          await sendEmail({ to: user.email, subject, html, text });
        }
        return NextResponse.json(
          { message: "Password resettata con successo. L'utente riceverà la nuova password via email." },
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

