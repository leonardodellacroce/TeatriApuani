# Ottimizzazioni performance – AppTeatri online

Da quando l'app è stata pubblicata su Vercel, le pagine e i dati caricano lentamente. Di seguito le **cause principali** e le **soluzioni** (ordinate per impatto).

---

## 1. Connection pooling Neon (impatto: ALTO)

**Problema:** Su Vercel ogni richiesta API è gestita da una funzione serverless. Senza connection pooling, ogni richiesta apre una **nuova connessione** al database Neon. L'apertura di una connessione Postgres costa ~8 round-trip di rete e tempo di handshake.

**Soluzione:** Usare la **connection string con pooler** di Neon invece di quella diretta.

- **Connection string diretta** (lenta su serverless):
  ```
  postgresql://user:pass@ep-xxx-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
  ```
- **Connection string con pooler** (consigliata):
  ```
  postgresql://user:pass@ep-xxx-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
  ```

Nota: nel nome host aggiungi `-pooler` subito prima di `.aws.neon.tech`.

**Come fare:**
1. Vai su [Neon Console](https://console.neon.tech) → progetto **appteatri-prod**
2. Clicca **Connect** → attiva **Connection pooling**
3. Copia la connection string con pooler
4. In **Vercel** → Settings → Environment Variables → aggiorna `DATABASE_URL` con questa stringa
5. Esegui un **Redeploy** del progetto

---

## 2. Cold start database Neon (impatto: MEDIO)

**Problema:** Dopo circa 5 minuti di inattività, Neon mette il database in stato di sospensione. Il primo accesso dopo la sospensione può richiedere fino a ~5 secondi per “risvegliare” il database.

**Soluzione implementata: Cron "keep-warm"**

È stato configurato un cron job Vercel che chiama `/api/cron/keep-warm` ogni 4 minuti. L'endpoint esegue una query leggera (`SELECT 1`) sul database, mantenendolo attivo e evitando la sospensione.

**Configurazione richiesta:**
1. In **Vercel** → Settings → Environment Variables, aggiungi:
   - `CRON_SECRET`: genera con `openssl rand -hex 32` (serve a proteggere l'endpoint da chiamate esterne)
2. Esegui un **Redeploy** per attivare il cron

**File coinvolti:**
- `app/api/cron/keep-warm/route.ts` – endpoint che esegue il ping al DB
- `vercel.json` – schedule `*/4 * * * *` (ogni 4 minuti)

**Alternative (piano Neon a pagamento):**
- Configurare "Auto-suspend delay" fino a 7 giorni o disabilitarlo
- Neon Console → progetto → Settings → Compute

---

## 3. Fetch sequenziali invece che paralleli (impatto: MEDIO–ALTO)

**Problema:** Alcune pagine eseguono molte chiamate API in sequenza invece che in parallelo, aumentando il tempo totale di caricamento.

**Esempi:**
- **Pagina Eventi** (`/dashboard/events`): `fetchEvents`, `fetch('/api/areas')`, `fetch('/api/duties')` in useEffect separati
- **Pagina Evento** (`/dashboard/events/[id]`): dopo aver caricato l’evento, un altro `useEffect` carica ogni workday con `fetch(\`/api/workdays/${wd.id}\`)` – con 10 giornate = 10 richieste aggiuntive
- **Pagina Report** (`/dashboard/reports`): 6 fetch (clients, events, duties, locations, users, companies) – attualmente in parallelo, ma ognuno è una richiesta HTTP separata

**Soluzione:** Dove possibile, raggruppare i dati in API unificate o usare `Promise.all` per eseguire le chiamate in parallelo invece che in sequenza.

---

## 4. N+1 nella modale “Assegna utenti” (impatto: MOLTO ALTO)

**Problema:** Nella pagina della giornata (`/dashboard/events/[id]/workdays/[workdayId]`), aprendo la modale “Assegna utenti” viene chiamato `checkAllUsersForConflicts`, che per **ogni utente** fa una richiesta a `/api/assignments?userId=...`. Con 50 utenti = 50+ richieste HTTP.

**Soluzione:** Creare un endpoint API che restituisca tutti gli assegnamenti per una data (o per un intervallo) in una sola chiamata, e filtrare lato client per userId.

---

## 5. Caricamento solo client-side (impatto: MEDIO)

**Problema:** Quasi tutte le pagine sono client components che caricano i dati in `useEffect` dopo il primo render. Il flusso è: HTML → JS → React → useEffect → fetch → render con dati. L’utente vede prima una pagina vuota o uno spinner.

**Soluzione (più avanzata):** Usare Server Components e `fetch` lato server dove ha senso, così i dati arrivano già nel primo HTML e il tempo percepito migliora.

---

## 6. Regione Vercel vs Neon (impatto: BASSO–MEDIO)

**Problema:** Se Vercel e Neon sono in regioni diverse (es. Vercel in US, Neon in Frankfurt), ogni richiesta al DB ha latenza di rete aggiuntiva.

**Soluzione implementata:** In `vercel.json` è impostato `"regions": ["fra1"]` (Frankfurt), allineato al database Neon. Dopo un redeploy, le funzioni Vercel girano nella stessa regione del DB.

---

## Riepilogo azioni immediate

| Priorità | Azione | Difficoltà |
|----------|--------|------------|
| 1 | Usare DATABASE_URL con connection pooling Neon | Facile |
| 2 | Regione Vercel su Frankfurt (fra1) – già in vercel.json | Fatto |
| 3 | Parallelizzare fetch dove sono ancora sequenziali | Media |
| 4 | Creare API unificata per conflitti assegnamenti (N+1) | Fatto |
| 5 | Connection string: aggiungere connect_timeout=15 | Facile |
| 6 | Indici database (Workday.date, TaskType.type, Event.startDate) | Fatto |

---

## Connection string – connect_timeout

Aggiungi `connect_timeout=15` alla DATABASE_URL per dare più tempo alla connessione durante i cold start:

```
postgresql://user:pass@host/dbname?sslmode=require&connect_timeout=15
```

In Vercel: Settings → Environment Variables → modifica `DATABASE_URL` aggiungendo `&connect_timeout=15` alla fine.
