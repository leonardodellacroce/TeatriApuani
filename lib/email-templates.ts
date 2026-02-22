/**
 * Template HTML per le email dell'app.
 * Usa stili inline per compatibilità con i client email.
 */

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
  max-width: 600px;
  margin: 0 auto;
`;

function getLoginUrl(): string {
  const base =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    (process.env.NODE_ENV === "production" ? "https://teatri-apuani.vercel.app" : "http://localhost:3000");
  return base.endsWith("/") ? `${base}login` : `${base}/login`;
}

export function passwordResetEmail(params: {
  userName: string;
  tempPassword: string;
  appName?: string;
  isNewUser?: boolean;
}): { subject: string; html: string; text: string } {
  const appName = params.appName || "Teatri Apuani";
  const subject = params.isNewUser
    ? `${appName} - Accesso alla piattaforma`
    : `${appName} - Password reimpostata`;
  const loginUrl = getLoginUrl();

  const intro = params.isNewUser
    ? "Sei stato registrato sulla piattaforma. Ecco le credenziali per accedere:"
    : "La tua password è stata reimpostata dall'amministratore. Ecco la nuova password temporanea:";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="${BASE_STYLES}">
  <div style="padding: 24px; background: #f9fafb; border-radius: 8px;">
    <h2 style="color: #111; margin-bottom: 16px;">${params.isNewUser ? "Benvenuto" : "Password reimpostata"}</h2>
    <p>Ciao ${params.userName},</p>
    <p>${intro}</p>
    <p style="background: #fff; padding: 16px; border-radius: 6px; font-family: monospace; font-size: 18px; letter-spacing: 2px; border: 1px solid #e5e7eb;">
      ${params.tempPassword}
    </p>
    <p><a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Accedi alla piattaforma</a></p>
    <p><strong>Ti consigliamo di cambiarla al primo accesso.</strong></p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
      Questa è una email automatica, non rispondere.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = params.isNewUser
    ? `Ciao ${params.userName},\n\nSei stato registrato sulla piattaforma. Password temporanea: ${params.tempPassword}\n\nAccedi qui: ${loginUrl}\n\nTi consigliamo di cambiarla al primo accesso.\n\nQuesta è una email automatica.`
    : `Ciao ${params.userName},\n\nLa tua password è stata reimpostata. Nuova password temporanea: ${params.tempPassword}\n\nAccedi qui: ${loginUrl}\n\nTi consigliamo di cambiarla al primo accesso.\n\nQuesta è una email automatica.`;

  return { subject, html, text };
}

export function notificationEmail(params: {
  userName: string;
  title: string;
  message: string;
  appName?: string;
}): { subject: string; html: string; text: string } {
  const appName = params.appName || "Teatri Apuani";
  const subject = `${appName} - ${params.title}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="${BASE_STYLES}">
  <div style="padding: 24px; background: #f9fafb; border-radius: 8px;">
    <h2 style="color: #111; margin-bottom: 16px;">${params.title}</h2>
    <p>Ciao ${params.userName},</p>
    <p>${params.message.replace(/\n/g, "<br>")}</p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
      Questa è una email automatica, non rispondere.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `Ciao ${params.userName},\n\n${params.title}\n\n${params.message}\n\nQuesta è una email automatica.`;

  return { subject, html, text };
}
