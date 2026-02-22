import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import crypto from "crypto";

function generateTempPassword(length = 12): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email) {
      return NextResponse.json(
        { error: "Email richiesta" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Risposta generica per non rivelare se l'account esiste
    const genericSuccess = {
      message: "Se l'indirizzo email è registrato, riceverai una mail con la nuova password provvisoria. Controlla anche la cartella spam.",
    };

    if (!user) {
      return NextResponse.json(genericSuccess, { status: 200 });
    }

    if (!user.isActive || user.isArchived) {
      return NextResponse.json(genericSuccess, { status: 200 });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await hash(tempPassword, 10);

    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          mustChangePassword: true,
        },
      });
    } catch (err: any) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("mustchangepassword") || msg.includes("unknown field") || msg.includes("unknown column")) {
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
      } else {
        throw err;
      }
    }

    const userName = [user.name, user.cognome].filter(Boolean).join(" ") || user.email || "Utente";
    const { subject, html, text } = passwordResetEmail({
      userName,
      tempPassword,
    });
    const sent = await sendEmail({ to: user.email, subject, html, text });
    if (!sent) {
      console.warn("[forgot-password] Email non inviata, ma password aggiornata");
    }

    return NextResponse.json(genericSuccess, { status: 200 });
  } catch (error) {
    console.error("Error in forgot-password:", error);
    return NextResponse.json(
      { message: "Se l'indirizzo email è registrato, riceverai una mail con la nuova password provvisoria. Controlla anche la cartella spam." },
      { status: 200 }
    );
  }
}
