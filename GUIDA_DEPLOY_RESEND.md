# Guida Deploy – Dominio Resend per email

Configurazione del dominio per inviare email da `no-reply@mail.teatriapuani.it` tramite Resend.

**Cosa fare:** 1) Aggiungi il dominio in Resend → 2) Aggiungi i record DNS su Aruba (TXT dal menu standard; MX da una sezione separata "Record MX") → 3) Verifica in Resend → 4) Imposta EMAIL_FROM su Vercel.

---

## 1. Aggiungere il dominio in Resend

1. Vai su [resend.com](https://resend.com) → **Domains** → **Add Domain**
2. Inserisci: `mail.teatriapuani.it`
3. Clicca **Add**
4. Resend mostrerà la pagina **Fill in your DNS Records** con i record da copiare

---

## 2. Configurare i DNS su Aruba

Accedi al **Pannello Aruba** → **Gestione DNS** / **Zone DNS** e aggiungi i record nell’ordine indicato.

### Record 1 – SPF (TXT)

> Se hai già questo record, passa al successivo.

| Campo | Valore |
|-------|--------|
| **Tipologia** | TXT (DMARC, DKIM, SPF) |
| **Nome host** | `mail` |
| **Valore** | `v=spf1 include:_spf.resend.com ~all` |
| **TTL** | 1 Ora |

---

### Record 2 – DKIM (TXT)

| Campo | Valore |
|-------|--------|
| **Tipologia** | TXT (DMARC, DKIM, SPF) |
| **Nome host** | `resend._domainkey.mail` |
| **Valore** | *Copia da Resend* (Dashboard → Domains → mail.teatriapuani.it → sezione "Domain Verification (DKIM)" → pulsante copia accanto a Content) |
| **TTL** | 1 Ora |

---

### Record 3 – MX (Enable Sending)

> **Su Aruba il record MX non è nel menu "Aggiungi nuovo record"** (dove vedi A, AAAA, CNAME, TXT, ecc.). Cercalo in una sezione separata:
>
> - **Gestione DNS** → cerca **"Record MX"** o **"Record di posta"** / **"Posta"**
> - Oppure: **Dominio** → **Gestione DNS** → sezione **MX**
> - Se usi "Record MX Aruba" di default, devi passare a **"Record MX personalizzati"** / **"Usa altri Mail Server"** per poter aggiungere record MX propri
>
> Se non trovi dove aggiungere MX, prova prima i record 1, 2 e 4: a volte Resend verifica il dominio anche senza MX (l’MX serve per ricevere i bounce). Se Resend segnala ancora errori, contatta l’assistenza Aruba.

| Campo | Valore |
|-------|--------|
| **Tipologia** | MX |
| **Nome host** | `send.mail` |
| **Valore** | *Copia da Resend* (sezione "Enable Sending" → record MX → Content, es. `feedback-smtp.eu-west-1.amazonses.com`) |
| **Priorità** | `10` |
| **TTL** | 1 Ora |

---

### Record 4 – SPF Return Path (TXT)

| Campo | Valore |
|-------|--------|
| **Tipologia** | TXT (DMARC, DKIM, SPF) |
| **Nome host** | `send.mail` |
| **Valore** | *Copia da Resend* (sezione "Enable Sending" → record TXT → Content, es. `v=spf1 include:amazonses.com ~all`) |
| **TTL** | 1 Ora |

---

### Record 5 – DMARC (opzionale)

| Campo | Valore |
|-------|--------|
| **Tipologia** | TXT (DMARC, DKIM, SPF) |
| **Nome host** | `_dmarc` |
| **Valore** | `v=DMARC1; p=none;` |
| **TTL** | 1 Ora |

---

## 3. Verificare il dominio in Resend

1. Torna su Resend → **Domains** → seleziona `mail.teatriapuani.it`
2. Clicca **Verify DNS Records**
3. Attendi la propagazione (da pochi minuti fino a 24–48 ore)
4. Quando lo stato diventa **Verified**, il dominio è pronto

---

## 4. Aggiornare le variabili su Vercel

1. Vercel → **Settings** → **Environment Variables**
2. Modifica `EMAIL_FROM`:
   ```
   Teatri Apuani <no-reply@mail.teatriapuani.it>
   ```
3. Salva e fai **Redeploy** (Deployments → ⋮ → Redeploy)

---

## 5. Test

**In locale** (con `npm run dev`):
- Apri nel browser: `http://localhost:3000/api/test-email?to=tua@email.com`
- L’endpoint funziona **solo in development** (su Vercel risponde 403)

**In produzione:** l’endpoint è disabilitato. Per testare, usa il flusso **Reset password** (Dashboard → Utenti → Modifica → Reset Password → spunta "Invia via email") oppure controlla Resend → **Emails** per vedere gli invii e eventuali errori.

---

## Riferimenti

- [Resend Domains](https://resend.com/domains)
- [EMAIL_SETUP.md](./EMAIL_SETUP.md) – configurazione generale email nell'app
