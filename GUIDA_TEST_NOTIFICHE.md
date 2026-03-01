# Guida al test delle notifiche di sistema

Le notifiche sono configurate in **Impostazioni → Notifiche → Notifiche di sistema** (`/settings/notifications?tab=system`).

---

## Notifiche lato lavoratore

Visualizzate in **Dashboard → Notifiche** (`/dashboard/notifications`).

| Tipo | Titolo | Come testarla |
|------|--------|---------------|
| `MISSING_HOURS_REMINDER` | Orari da inserire | 1. Assegna un turno a un lavoratore per una data passata (ieri o prima).<br>2. Chiama il cron `GET /api/cron/notify-missing-hours` con header `Authorization: Bearer <CRON_SECRET>` **oppure** usa il pulsante **"Notifica inserimento ore"** in Dashboard Admin → Turni e ore (`/dashboard/admin/shifts-hours`). |
| `DAILY_SHIFT_REMINDER` | Promemoria turni di oggi | 1. Assegna un turno a un lavoratore per la giornata odierna.<br>2. Chiama il cron `GET /api/cron/notify-daily-shift-reminder` con header `Authorization: Bearer <CRON_SECRET>`.<br>Il cron viene eseguito automaticamente ogni mattina alle 7:00 UTC. Se il lavoratore non ha turni oggi, la notifica non viene inviata. |
| `UNAVAILABILITY_CREATED_BY_ADMIN` | Indisponibilità inserita | Come admin, crea un'indisponibilità per un lavoratore dalla sezione **Indisponibilità**. |
| `UNAVAILABILITY_MODIFIED_BY_ADMIN` | Indisponibilità modificata | Come admin, modifica un'indisponibilità esistente di un lavoratore dalla sezione **Indisponibilità**. |
| `UNAVAILABILITY_DELETED_BY_ADMIN` | Indisponibilità eliminata | Come admin, elimina un'indisponibilità di un lavoratore dalla sezione **Indisponibilità**. |
| `UNAVAILABILITY_APPROVED` | Indisponibilità approvata | 1. Come lavoratore, crea un'indisponibilità che confligge con un turno assegnato (va in stato PENDING).<br>2. Come admin, approva l'indisponibilità dalla sezione **Indisponibilità**. |
| `UNAVAILABILITY_REJECTED` | Indisponibilità non approvata | 1. Come lavoratore, crea un'indisponibilità che confligge con un turno assegnato (va in stato PENDING).<br>2. Come admin, rifiuta l'indisponibilità dalla sezione **Indisponibilità**. |
| `ORE_INSERITE_DA_ADMIN` | Ore lavorate inserite | Come admin, inserisci le ore per un turno assegnato a un lavoratore da **Turni e ore** (`/dashboard/admin/shifts-hours`). |
| `ORE_MODIFICATE_DA_ADMIN` | Ore lavorate modificate | Come admin, modifica le ore già inserite per un turno di un lavoratore da **Turni e ore**. |
| `ORE_ELIMINATE_DA_ADMIN` | Ore lavorate eliminate | Come admin, elimina le ore inserite per un turno di un lavoratore da **Turni e ore**. |
| `FREE_HOURS_CONVERTED_BY_ADMIN` | Ore libere convertite in evento | Come admin, converte ore libere in evento da **Turni e ore** → sezione Ore libere in attesa → Crea evento. |
| `FREE_HOURS_DELETED_BY_ADMIN` | Ore libere eliminate | Come admin, elimina ore libere dalla sezione **Ore libere in attesa** in **Turni e ore**. |

---

## Notifiche lato admin

Visualizzate in **Dashboard → Notifiche Admin** (`/dashboard/admin-notifications`).

| Tipo | Titolo | Come testarla |
|------|--------|---------------|
| `ADMIN_LOCKED_ACCOUNTS` | Account bloccati | Effettua più tentativi di login errati con un account (non SuperAdmin) fino al blocco. **Solo SuperAdmin** riceve questa notifica. |
| `UNAVAILABILITY_PENDING_APPROVAL` | Indisponibilità in attesa | Come lavoratore, crea un'indisponibilità che confligge con turni assegnati in giornate con eventi attivi. L'indisponibilità va in stato PENDING e gli admin ricevono la notifica. |
| `UNAVAILABILITY_MODIFIED_BY_WORKER` | Indisponibilità modificata da dipendente | Come lavoratore, modifica la propria indisponibilità in giornate con eventi attivi. |
| `UNAVAILABILITY_DELETED_BY_WORKER` | Indisponibilità eliminata da dipendente | Come lavoratore, elimina la propria indisponibilità in giornate con eventi attivi. |
| `FREE_HOURS_ADDED_BY_WORKER` | Ore libere inserite | Come lavoratore, inserisci ore libere dalla pagina **Ore libere** (I miei turni → Ore libere). Gli admin ricevono la notifica e possono convertire in evento da **Turni e ore** → sezione Ore libere in attesa. |
| `FREE_HOURS_MODIFIED_BY_WORKER` | Ore libere modificate da dipendente | Come lavoratore, modifica le proprie ore libere dalla pagina **Ore libere**. |
| `FREE_HOURS_DELETED_BY_WORKER` | Ore libere eliminate da dipendente | Come lavoratore, elimina le proprie ore libere dalla pagina **Ore libere**. |
| `WORKDAY_ISSUES` | Problemi programmazione | 1. Crea uno o più workday con problemi (es. senza assegnazioni, personale insufficiente, slot vuoti).<br>2. Chiama il cron `GET /api/cron/notify-workday-issues` con header `Authorization: Bearer <CRON_SECRET>`.<br>Oppure attendi l'esecuzione giornaliera del cron (configurato in Vercel). |

---

## Note

- **CRON_SECRET**: se impostato in `.env`, va usato nell'header `Authorization: Bearer <valore>` per chiamare i cron da esterno.
- **Filtri admin**: le notifiche admin di indisponibilità e problemi programmazione rispettano le preferenze "Aree e aziende per le notifiche" (Impostazioni → Notifiche, tab utente).
- **Priorità e modal**: in Impostazioni → Notifiche → Notifiche di sistema puoi attivare/disattivare ogni tipo, impostare priorità (Alta/Media/Bassa) e il modal in dashboard.
