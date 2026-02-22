/**
 * Endpoint di test per verificare la configurazione email.
 * GET /api/test-email?to=tua@email.com
 * Solo in development.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Solo in development" }, { status: 403 });
  }

  const to = req.nextUrl.searchParams.get("to") || "delivered@resend.dev";
  const hasKey = !!process.env.RESEND_API_KEY;

  const result = await sendEmail({
    to,
    subject: "Test Teatri Apuani",
    html: "<p>Se ricevi questa email, Resend è configurato correttamente.</p>",
    text: "Se ricevi questa email, Resend è configurato correttamente.",
  });

  return NextResponse.json({
    sent: result,
    hasApiKey: hasKey,
    to,
    message: result
      ? "Email inviata. Controlla la casella (e spam)."
      : "Invio fallito. Controlla i log del server.",
  });
}
