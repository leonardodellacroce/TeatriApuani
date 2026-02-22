import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifySuperAdminsLockedAccounts } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";
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
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const email = body?.email?.trim();
  const userId = body?.userId;
  const sendEmailToUser = body?.sendEmail === true;
  const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim() : null;

  if (!email && !userId) {
    return NextResponse.json({ error: "Email o ID utente obbligatorio" }, { status: 400 });
  }
  const user = await prisma.user.findFirst({
    where: email ? { email } : { id: userId },
  });
  if (!user) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  const targetEmail = newEmail || user.email;
  const updateData: Record<string, unknown> = {
    lockedUntil: null,
    failedLoginAttempts: 0,
  };

  if (newEmail && newEmail !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: newEmail.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Email già in uso da un altro utente" }, { status: 400 });
    }
    updateData.email = newEmail.toLowerCase();
  }

  if (sendEmailToUser) {
    const tempPassword = generateTempPassword();
    updateData.password = await hash(tempPassword, 10);
    updateData.mustChangePassword = true;

    try {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData as any,
      });
    } catch (err: any) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("mustchangepassword") || msg.includes("unknown field") || msg.includes("unknown column")) {
        delete (updateData as any).mustChangePassword;
        await prisma.user.update({
          where: { id: user.id },
          data: updateData as any,
        });
      } else {
        throw err;
      }
    }

    const userName = [user.name, user.cognome].filter(Boolean).join(" ") || targetEmail || "Utente";
    const { subject, html, text } = passwordResetEmail({ userName, tempPassword });
    const sent = await sendEmail({ to: targetEmail, subject, html, text });
    if (!sent) {
      console.warn("[unlock-account] Email non inviata, ma account sbloccato");
    }
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
  }

  await notifySuperAdminsLockedAccounts();
  return NextResponse.json({
    message: sendEmailToUser
      ? "Account sbloccato. Email con password provvisoria inviata."
      : "Account sbloccato con successo",
  });
}
