# Guida Deploy – Comandi Rapidi

Comandi per pubblicare le modifiche su Vercel (via GitHub).

---

## Sequenza completa

```bash
git add .
git status
git commit -m "Descrizione delle modifiche"
git push
```

---

## Comandi singoli

| Comando | Cosa fa |
|---------|---------|
| `git add .` | Aggiunge tutti i file modificati allo stage |
| `git status` | Mostra lo stato dei file (modificati, staged, ecc.) |
| `git commit -m "messaggio"` | Crea un commit con le modifiche staged |
| `git push` | Invia i commit su GitHub (Vercel farà il deploy) |

---

## Esempio

```bash
git add .
git status
git commit -m "Aggiunto export Excel ai report"
git push
```

---

## Note

- **`git add .`** – aggiunge tutto dalla cartella corrente in giù
- **`git status`** – utile per controllare cosa verrà committato
- **Messaggio del commit** – breve e chiaro (es. "Fix login", "Nuova pagina eventi")
- Dopo il **push**, Vercel avvia il deploy in automatico
