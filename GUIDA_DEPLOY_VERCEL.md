# Guida per pubblicare AppTeatri online (linguaggio semplice)

Questa guida ti spiega **cosa fare** e **perché**, passo dopo passo, senza termini tecnici inutili.

---

## Prima di iniziare: cosa succede in pratica

Oggi la tua app funziona così:
- **Il codice** è sul tuo computer (in Cursor)
- **I dati** (utenti, turni, eventi…) sono in un file sul tuo computer: `prisma/dev.db`

Per metterla online serve:
1. Un **database su internet** (al posto del file sul tuo computer)
2. Un **sito su internet** (Vercel) che esegue il tuo codice
3. Un **posto dove tenere il codice** (GitHub) da cui Vercel lo prende

**Non devi copiare il database su Cursor.** Cursor resta dove lavori. Creerai un database nuovo su internet e il sito online userà quello.

---

## Cosa succede passando da SQLite a PostgreSQL (leggi prima di procedere)

### Perdi i dati?

**Sì, in automatico.** Quando cambi a PostgreSQL:
- Il file `prisma/dev.db` **resta sul disco** ma l’app **non lo userà più**
- Il nuovo database Neon parte **vuoto** (tabelle create, ma senza dati)
- I dati vecchi (utenti, turni, eventi…) restano solo in `dev.db` e non vengono copiati

**Se vuoi conservare i dati:** prima di cambiare, fai una copia di `prisma/dev.db` (es. `dev-backup.db`). Per spostare i dati da SQLite a PostgreSQL servono strumenti esterni; spesso è più semplice ricreare gli utenti dall’app o usare `npm run seed` per dati di prova.

### Cursor smette di funzionare?

**No.** Cursor continua a funzionare come prima. Cambia solo **da dove** l’app legge i dati:
- **Prima:** legge da `prisma/dev.db` (file sul tuo computer)
- **Dopo:** legge dal database Neon (su internet) tramite la connection string in `.env.local`

Quando lanci `npm run dev` in Cursor, l’app si collega al database indicato in `DATABASE_URL`. Se in `.env.local` metti la connection string di Neon, userà Neon. Cursor non cambia.

### Cosa cambia in concreto?

| Cosa | Prima (SQLite) | Dopo (PostgreSQL) |
|------|----------------|-------------------|
| **File modificato** | — | `prisma/schema.prisma` (provider e url) |
| **File nuovo** | — | `.env.local` con `DATABASE_URL` |
| **Database usato in locale** | `prisma/dev.db` | Database Neon (es. appteatri-dev) |
| **Database usato online** | — | Database Neon (es. appteatri-prod) |
| **Cursor** | Funziona | Funziona uguale |
| **`npm run dev`** | Funziona | Funziona (si collega a Neon) |

---

## PARTE 1: Creare i database su internet

Ti servono **due database Neon**: uno per sviluppare in locale (test) e uno per il sito online (produzione). Così puoi provare senza toccare i dati reali.

### Passo 1.1 – Aprire Neon e registrarti

1. Apri il browser e vai su: **https://neon.tech**
2. Clicca su **"Sign Up"** (Registrati)
3. Scegli **"Continue with GitHub"** (è il più semplice se hai un account GitHub)
4. Autorizza Neon ad accedere a GitHub se richiesto

### Passo 1.2 – Creare il primo database (per il sito online – produzione)

1. Dopo il login vedrai la dashboard di Neon
2. Clicca sul pulsante **"New Project"** (Nuovo progetto)
3. Nel campo **"Project name"** scrivi: `appteatri-prod`
4. In **"Region"** scegli: **Europe (Frankfurt)** (o la regione più vicina a te)
5. Clicca **"Create Project"**
6. Nella schermata successiva cerca **"Connection string"** e **copiala** (salvala in un file di testo)
7. Questa connection string la userai **in Vercel** (per il sito online)

### Passo 1.3 – Creare il secondo database (per sviluppare in Cursor – sviluppo)

1. Torna alla dashboard di Neon e clicca di nuovo **"New Project"**
2. Nel campo **"Project name"** scrivi: `appteatri-dev`
3. Stessa regione di prima
4. Clicca **"Create Project"**
5. Copia anche questa **"Connection string"**
6. Questa connection string la userai in **`.env.local`** (per lavorare in Cursor)

Esempio di connection string (i tuoi valori saranno diversi):
```
postgresql://mario_rossi:AbCd1234@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

---

## PARTE 2: Far usare al progetto il database su internet

Ora devi dire al progetto di usare il database Neon invece del file `dev.db`.

### Passo 2.1 – Modificare il file di configurazione del database

1. In Cursor apri il file: **`prisma/schema.prisma`**
2. Trova la parte che dice:
   ```
   datasource db {
     provider = "sqlite"
     url      = "file:./dev.db"
   }
   ```
3. **Sostituiscila** con:
   ```
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Salva il file (Cmd+S)

Questo significa: "da ora in poi usa PostgreSQL e leggi l’indirizzo dalla variabile DATABASE_URL".

### Passo 2.2 – Configurare le variabili d’ambiente

1. Nella cartella del progetto (dove c’è `package.json`) apri il file **`.env.local`** (se non esiste, crealo)
2. Assicurati che contenga queste righe (sostituendo con i tuoi valori):

```
DATABASE_URL="INCOLLA_QUI_LA_CONNECTION_STRING_COPIATA_DA_NEON"
NEXTAUTH_SECRET="una_stringa_casuale_lunga"
NEXTAUTH_URL="http://localhost:3000"
```

**Dove trovare i valori:**
- **DATABASE_URL**: incolla la connection string di **appteatri-dev** (quella per lo sviluppo in Cursor)
- **NEXTAUTH_SECRET**: apri il **Terminale** in Cursor (menu Terminal → New Terminal), scrivi `openssl rand -base64 32` e premi Invio. Copia il risultato e incollalo tra le virgolette
- **NEXTAUTH_URL**: lascialo così `http://localhost:3000` per ora

3. Salva il file

**Nota:** Prisma (per i comandi come `db push`) legge da **`.env`**, non da `.env.local`. Se `npx prisma db push` dà errore "Environment variable not found: DATABASE_URL", crea anche un file **`.env`** con la riga `DATABASE_URL="..."` (stesso valore di `.env.local`).

### Passo 2.3 – Creare le tabelle in entrambi i database Neon

Le tabelle (utenti, turni, eventi…) vanno create sia in **appteatri-dev** che in **appteatri-prod**.

**Database di sviluppo (appteatri-dev):**
1. Controlla che in `.env.local` ci sia la connection string di **appteatri-dev**
2. Apri il **Terminale** in Cursor
3. Scrivi: `npx prisma db push` e premi Invio
4. Attendi il messaggio tipo "Your database is now in sync with your schema"

**Database di produzione (appteatri-prod):**
1. Apri `.env.local` e **sostituisci temporaneamente** `DATABASE_URL` con la connection string di **appteatri-prod**
2. Nel Terminale scrivi di nuovo: `npx prisma db push` e premi Invio
3. **Rimetti** in `DATABASE_URL` la connection string di **appteatri-dev** (per continuare a lavorare in locale con il database di sviluppo)

### Passo 2.4 – Mettere i dati nei database (opzionale)

**Database di sviluppo (per testare in Cursor):**
- Con `DATABASE_URL` che punta a **appteatri-dev**, nel Terminale scrivi: `npm run seed`
- Così hai dati di prova quando lanci `npm run dev`

**Database di produzione (per il sito online):**
- Cambia temporaneamente `DATABASE_URL` in `.env.local` con la connection string di **appteatri-prod`
- Esegui: `npm run seed`
- Rimetti la connection string di **appteatri-dev**

Oppure parti da zero e crea gli utenti dall’app dopo che sarà online.

---

## PARTE 3: Mettere il codice su GitHub

Vercel prende il codice da GitHub. Quindi devi prima mettere il progetto su GitHub.

### Passo 3.1 – Creare un repository su GitHub

1. Vai su **https://github.com** e accedi
2. Clicca sul pulsante **"+"** in alto a destra → **"New repository"**
3. In **"Repository name"** scrivi: `AppTeatri` (o un altro nome)
4. Lascia tutto il resto com’è (non spuntare "Add a README")
5. Clicca **"Create repository"**

### Passo 3.2 – Collegare il progetto a GitHub e caricare il codice

1. In Cursor apri il **Terminale**
2. Nella cartella del progetto esegui questi comandi **uno alla volta** (sostituisci `TUO_USERNAME` con il tuo username GitHub e `AppTeatri` con il nome del repository se diverso):

```
git init
```

```
git add .
```

```
git commit -m "Preparazione per pubblicazione online"
```

```
git branch -M main
```

```
git remote add origin https://github.com/TUO_USERNAME/AppTeatri.git
```

```
git push -u origin main
```

3. Se ti chiede username e password, usa le tue credenziali GitHub (o un token se hai l’autenticazione a due fattori)

---

## PARTE 4: Pubblicare su Vercel

### Passo 4.1 – Creare un account Vercel

1. Vai su **https://vercel.com**
2. Clicca **"Sign Up"**
3. Scegli **"Continue with GitHub"**
4. Autorizza Vercel ad accedere a GitHub

### Passo 4.2 – Importare il progetto

1. Dopo il login clicca **"Add New..."** → **"Project"**
2. Nella lista vedrai i tuoi repository GitHub. Clicca su **"Import"** accanto a **AppTeatri**
3. Nella schermata successiva **non cliccare ancora Deploy**

### Passo 4.3 – Inserire le variabili d’ambiente

Le "variabili d’ambiente" sono dati che il sito deve conoscere (es. dove trovare il database).

1. Nella pagina di import cerca la sezione **"Environment Variables"**
2. Clicca per espanderla
3. Aggiungi queste tre variabili (una alla volta):

| Nome (Name) | Valore (Value) |
|-------------|----------------|
| `DATABASE_URL` | Incolla la connection string di **appteatri-prod** con **Connection pooling** attivato (vedi sotto) |
| `NEXTAUTH_SECRET` | La stessa stringa che hai messo in `.env.local` (quella generata con `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Per ora lascia vuoto o scrivi `https://appteatri.vercel.app` – lo sistemeremo dopo |

4. **Importante per le performance:** usa la connection string con **Connection pooling**. In Neon Console, quando copi la connection string, clicca su **"Connection pooling"** (o aggiungi `-pooler` al nome host, es. `ep-xxx-123456-pooler.eu-central-1.aws.neon.tech`). Senza pooling il sito sarà molto lento online.

5. Clicca **"Deploy"**

### Passo 4.4 – Attendere il deploy

1. Vercel mostrerà i log della build. Attendi 2–5 minuti
2. Quando finisce vedrai un messaggio tipo "Congratulations!" e un link al tuo sito (es. `https://appteatri-xyz123.vercel.app`)
3. **Clicca sul link** per aprire il sito

### Passo 4.5 – Sistemare NEXTAUTH_URL (se il login non funziona)

1. In Vercel vai nel tuo progetto
2. Clicca su **"Settings"** (Impostazioni)
3. Nel menu a sinistra clicca **"Environment Variables"**
4. Trova `NEXTAUTH_URL` e modificala: metti **esattamente** l’URL del tuo sito (es. `https://appteatri-xyz123.vercel.app`)
5. Vai su **"Deployments"**, clicca sui tre puntini del deploy più recente e scegli **"Redeploy"**

### Passo 4.6 – Regione Vercel (performance)

Per ridurre la latenza verso il database Neon (Frankfurt), le funzioni Vercel sono configurate per girare a **Frankfurt** (`fra1`). Il file `vercel.json` contiene già `"regions": ["fra1"]`.

Se hai creato il progetto prima di questa modifica, assicurati di fare un **Redeploy** dopo aver pushato il codice aggiornato, così Vercel userà la nuova regione.

---

## PARTE 5: Verificare che tutto funzioni

1. Apri l’URL del sito (es. `https://appteatri-xyz123.vercel.app`)
2. Prova ad accedere con le credenziali che hai nel database (o con quelle create dal seed)
3. Controlla che le pagine principali si aprano correttamente

---

## Domande frequenti

**Devo copiare il database su Cursor?**  
No. Cursor resta sul tuo computer. Il database è su Neon (su internet). Il codice in Cursor si collega a quel database tramite la connection string.

**Il mio file dev.db viene usato ancora?**  
No. Dopo aver cambiato lo schema a PostgreSQL, il progetto userà il database Neon. Puoi tenere `dev.db` come backup, ma il sito online non lo usa.

**Come aggiungo modifiche al sito in futuro?**  
Lavori in Cursor come sempre. Quando hai finito: `git add .` → `git commit -m "descrizione"` → `git push`. Vercel farà un nuovo deploy in automatico.

**Se qualcosa non funziona?**  
Controlla che `DATABASE_URL` e `NEXTAUTH_URL` in Vercel siano corretti. `NEXTAUTH_URL` deve essere esattamente l’URL del sito (con `https://`).

**Performance – connection string:** Aggiungi `&connect_timeout=15` alla `DATABASE_URL` in Vercel per gestire meglio i cold start del database.
