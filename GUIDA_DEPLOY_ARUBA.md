# Guida Deploy – Dominio Aruba app.teatriapuani.it

Configurazione del sottodominio **app.teatriapuani.it** per l'app su Vercel.

---

## 1. Aggiungere il dominio in Vercel

1. Vai su [vercel.com](https://vercel.com) → progetto **TeatriApuani** → **Settings** → **Domains**
2. Clicca **Add** e inserisci: `app.teatriapuani.it`
3. Vercel mostrerà i record DNS da configurare (tab **DNS Records**)

---

## 2. Configurare i DNS su Aruba

Con il solo dominio principale **teatriapuani.it** puoi creare sottodomini: la zona DNS include già tutti i sottodomini (app, www, ecc.).

1. Accedi al **Pannello Aruba** (gestione dominio teatriapuani.it)
2. Vai in **Gestione DNS** / **Zone DNS**
3. Aggiungi il record **CNAME** indicato da Vercel:
   - **Nome:** `app` (o `app.teatriapuani.it` se Aruba richiede il nome completo)
   - **Valore:** copia il valore dalla pagina Vercel (Settings → Domains → DNS Records), es. `8b232dd095d1fc31.vercel-dns-017.com.`

> Vercel assegna un CNAME specifico per progetto. Usa sempre il valore mostrato nella dashboard, non quello generico.

---

## 3. Aggiornare NEXTAUTH_URL su Vercel

1. Vercel → **Settings** → **Environment Variables**
2. Modifica `NEXTAUTH_URL` e imposta: `https://app.teatriapuani.it`
3. Vai su **Deployments** → tre puntini del deploy più recente → **Redeploy**

---

## 4. Verifica

La propagazione DNS può richiedere fino a 24–48 ore. Quando è attiva, l'app sarà raggiungibile su **https://app.teatriapuani.it**.
