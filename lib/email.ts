/**
 * Servizio di invio email (no-reply).
 * Utilizza Resend se RESEND_API_KEY è configurato.
 *
 * Setup:
 * 1. Crea account su https://resend.com
 * 2. Verifica il dominio (o usa onboarding@resend.dev per test)
 * 3. Aggiungi in .env.local:
 *    RESEND_API_KEY=re_xxxx
 *    EMAIL_FROM="Teatri Apuani <no-reply@tuodominio.com>"
 */

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Teatri Apuani <onboarding@resend.dev>";

  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[email] RESEND_API_KEY non configurato. Email non inviata:",
        options.subject,
        "->",
        options.to
      );
      return false;
    }
    console.error("[email] RESEND_API_KEY mancante. Impossibile inviare email.");
    return false;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    let to = Array.isArray(options.to) ? options.to : [options.to];
    // In development: se EMAIL_TEST_OVERRIDE è impostato, invia lì invece che al destinatario reale
    const testOverride = process.env.EMAIL_TEST_OVERRIDE;
    if (process.env.NODE_ENV === "development" && testOverride) {
      console.log("[email] DEV: override destinatario", to, "->", testOverride);
      to = [testOverride];
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[email] Invio a", to, "da", from, "oggetto:", options.subject);
    }

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error("[email] Errore Resend:", JSON.stringify(error, null, 2));
      return false;
    }
    if (process.env.NODE_ENV === "development" && data) {
      console.log("[email] Inviata con successo, id:", data.id);
    }
    return true;
  } catch (err) {
    console.error("[email] Errore invio:", err);
    return false;
  }
}
