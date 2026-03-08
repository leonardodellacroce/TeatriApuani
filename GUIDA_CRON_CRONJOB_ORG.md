# Guida Cron – cron-job.org

I cron non usano Vercel (il piano non supporta cron ogni ora). Si usa **cron-job.org** per chiamare l’endpoint orario.

---

## 1. Crea account su cron-job.org

1. Vai su [cron-job.org](https://cron-job.org)
2. Registrati (gratuito)

---

## 2. Crea il job orario

1. Dopo il login, clicca **Create cronjob**
2. Compila:

> **Importante:** usa l’URL del dominio custom `app.teatriapuani.it`, **non** `teatri-apuani.vercel.app` (che reindirizza e può causare problemi).

| Campo | Valore |
|-------|--------|
| **Title** | `TeatriApuani Hourly` |
| **URL** | `https://app.teatriapuani.it/api/cron/hourly?secret=TUO_CRON_SECRET` |
| **Schedule** | Ogni ora (es. `0 * * * *` o seleziona "Every hour") |

### Passare il secret

**Opzione A – Query string (consigliata):**
- URL: `https://app.teatriapuani.it/api/cron/hourly?secret=TUO_CRON_SECRET`
- Sostituisci `TUO_CRON_SECRET` con il valore di `CRON_SECRET` nelle variabili Vercel

**Opzione B – Header Authorization:**
- Se cron-job.org supporta header personalizzati: aggiungi `Authorization: Bearer TUO_CRON_SECRET`
- URL senza query: `https://app.teatriapuani.it/api/cron/hourly`

3. Salva il job

---

## 3. Variabili su Vercel

1. Vercel → **Settings** → **Environment Variables**
2. Verifica che esistano: `CRON_SECRET` e `APP_URL` = `https://app.teatriapuani.it` (per le chiamate interne, evita 401 nelle fetch)
3. Se non c’è, generane uno con `openssl rand -hex 32` e aggiungilo

---

## 4. Test manuale

Puoi invocare l’endpoint manualmente per verificare:

```
https://app.teatriapuani.it/api/cron/hourly?secret=TUO_CRON_SECRET
```

Apri l’URL nel browser (o con `curl`). La risposta dovrebbe essere JSON con `ok: true` e `results` con lo stato di ogni notifica.

---

## 5. Cosa fa il cron orario

L’endpoint `/api/cron/hourly` viene chiamato ogni ora e:

- Controlla l’ora corrente (UTC)
- Se coincide con gli orari configurati in Impostazioni → Notifiche, invoca:
  - `notify-missing-hours` (ore da inserire)
  - `notify-daily-shift-reminder` (promemoria turni)
  - `notify-workday-issues` (problemi programmazione)
  - `notify-shift-changes` (modifiche turni)

---

## Riferimenti

- [cron-job.org](https://cron-job.org)
- [GUIDA_DEPLOY.md](./GUIDA_DEPLOY.md) – variabili d’ambiente
- [GUIDA_TEST_NOTIFICHE.md](./GUIDA_TEST_NOTIFICHE.md) – test notifiche
