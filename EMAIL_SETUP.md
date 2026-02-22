# Setup invio email (no-reply)

L'app può inviare email per:
- **Reset password**: quando un admin resetta la password e seleziona "Invia via email", l'utente riceve la nuova password
- **Notifiche**: template disponibili in `lib/email-templates.ts` per future integrazioni

## Provider: Resend

È stato integrato [Resend](https://resend.com), semplice da configurare e con piano gratuito (3000 email/mese).

### 1. Crea account

1. Vai su [resend.com](https://resend.com) e registrati
2. Verifica la tua email

### 2. Ottieni la API Key

1. Dashboard Resend → **API Keys** → **Create API Key**
2. Copia la chiave (inizia con `re_`)

### 3. Verifica il dominio (produzione)

Per inviare da `no-reply@tuodominio.com`:

1. Dashboard → **Domains** → **Add Domain**
2. Inserisci il tuo dominio (es. `tuodominio.com`)
3. Aggiungi i record DNS indicati (MX, TXT, ecc.)
4. Attendi la verifica

**Importante**: Resend richiede la **verifica di un dominio** per inviare a indirizzi email reali. Senza dominio verificato, l'invio può fallire.

**Per test senza dominio**: invia a `delivered@resend.dev` (indirizzo di test Resend). Esempio: `GET /api/test-email?to=delivered@resend.dev`

### 4. Configura le variabili d'ambiente

**Per test senza dominio verificato** (sviluppo):

```
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="Teatri Apuani <onboarding@resend.dev>"
EMAIL_TEST_OVERRIDE="delivered@resend.dev"
```

- `onboarding@resend.dev` = mittente di test Resend (nessuna verifica dominio)
- `EMAIL_TEST_OVERRIDE` = in development, tutte le email vanno qui invece che al destinatario reale. Controlla la dashboard Resend (Emails) per vedere i messaggi inviati.

**Per produzione** (con dominio verificato):

```
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="Teatri Apuani <no-reply@mail.tuodominio.com>"
```

(Non usare EMAIL_TEST_OVERRIDE in produzione)

### 5. Vercel

Aggiungi `RESEND_API_KEY` e `EMAIL_FROM` nelle **Environment Variables** del progetto Vercel.

## Utilizzo

### Reset password con email

1. Modifica utente → sezione Password → **Reset Password**
2. Nel dialog, spunta **"Invia la nuova password via email all'utente"**
3. Conferma

L'utente riceverà un'email con una password temporanea generata automaticamente. Dovrà cambiarla al primo accesso.

### Invio programmatico

```ts
import { sendEmail } from "@/lib/email";
import { notificationEmail } from "@/lib/email-templates";

const { subject, html, text } = notificationEmail({
  userName: "Mario",
  title: "Orari da inserire",
  message: "Hai ore non ancora inserite per i turni del 15/01/2025.",
});

await sendEmail({
  to: "mario@example.com",
  subject,
  html,
  text,
});
```

## Alternative a Resend

Se preferisci un altro provider (SendGrid, Postmark, SMTP), modifica `lib/email.ts` per usare la relativa SDK o Nodemailer.
