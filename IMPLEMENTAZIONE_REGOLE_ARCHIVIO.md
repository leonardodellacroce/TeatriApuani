# Implementazione Regole di Archivio e Eventi Passati

## Riepilogo delle Modifiche

Sono state implementate le seguenti regole di business:

### 1. Elementi Archiviati
Gli elementi archiviati (Location, Cliente, Utente) **NON** possono essere utilizzati per creare o modificare eventi, workdays e assignments. Possono essere visualizzati solo in:
- Eventi passati che li utilizzano
- Filtri degli eventi (se ci sono eventi creati con quell'elemento)

### 2. Eventi Passati
Gli eventi passati (endDate < oggi) **NON** possono essere modificati da nessuno tranne dal **Super Admin**.

## File Modificati

### 1. Nuovo File Helper
**`lib/validation.ts`** - Contiene funzioni di utilità per:
- `isEventPast(endDate)` - Verifica se un evento è passato
- `isLocationArchived(locationId)` - Verifica se una location è archiviata
- `isClientArchived(clientId)` - Verifica se un cliente è archiviato
- `isUserArchived(userId)` - Verifica se un utente è archiviato
- `checkEventStatus(eventId)` - Verifica stato completo di un evento

### 2. API Events
**`app/api/events/route.ts`**
- **POST**: Verifica che la location non sia archiviata prima di creare un evento

**`app/api/events/[id]/route.ts`**
- **PATCH**: 
  - Verifica che l'evento non sia passato (solo Super Admin può modificare eventi passati)
  - Verifica che la location non sia archiviata
- **DELETE**:
  - Verifica che l'evento non sia passato (solo Super Admin può eliminare eventi passati)

### 3. API Workdays
**`app/api/workdays/route.ts`**
- **POST**:
  - Verifica che l'evento associato non sia passato (solo Super Admin può creare workdays per eventi passati)
  - Verifica che la location non sia archiviata

**`app/api/workdays/[id]/route.ts`**
- **PATCH**:
  - Verifica che l'evento associato non sia passato (solo Super Admin può modificare)
  - Verifica che la location non sia archiviata
- **DELETE**:
  - Verifica che l'evento associato non sia passato (solo Super Admin può eliminare)

### 4. API Assignments
**`app/api/assignments/route.ts`**
- **POST**:
  - Verifica che l'evento associato non sia passato (solo Super Admin può creare assignments per eventi passati)
  - Verifica che l'utente non sia archiviato

**`app/api/assignments/[id]/route.ts`**
- **PATCH**:
  - Verifica che l'evento associato non sia passato (solo Super Admin può modificare)
  - Verifica che l'utente (userId) non sia archiviato
  - Verifica che gli utenti in assignedUsers non siano archiviati
- **DELETE**:
  - Verifica che l'evento associato non sia passato (solo Super Admin può eliminare)

## Messaggi di Errore

### Elementi Archiviati
- `"Non è possibile utilizzare una location archiviata per creare/modificare un evento"` (400)
- `"Non è possibile assegnare un utente archiviato"` (400)
- `"Non è possibile assegnare utenti archiviati"` (400)

### Eventi Passati
- `"Gli eventi passati possono essere modificati solo dal Super Admin"` (403)
- `"Gli eventi passati possono essere eliminati solo dal Super Admin"` (403)
- `"Non è possibile creare giornate per eventi passati (solo Super Admin)"` (403)
- `"Non è possibile modificare giornate per eventi passati (solo Super Admin)"` (403)
- `"Non è possibile eliminare giornate per eventi passati (solo Super Admin)"` (403)
- `"Non è possibile creare assegnazioni per eventi passati (solo Super Admin)"` (403)
- `"Non è possibile modificare assegnazioni per eventi passati (solo Super Admin)"` (403)
- `"Non è possibile eliminare assegnazioni per eventi passati (solo Super Admin)"` (403)

## Logica di Determinazione Evento Passato

Un evento è considerato passato se la sua `endDate` (normalizzata a mezzanotte) è **inferiore** alla data odierna (normalizzata a mezzanotte).

Esempio:
- Oggi: 7 novembre 2025
- Evento con endDate: 6 novembre 2025 → **Passato**
- Evento con endDate: 7 novembre 2025 → **NON passato** (stesso giorno)
- Evento con endDate: 8 novembre 2025 → **NON passato** (futuro)

## Note Tecniche

1. **Autorizzazioni**: Solo gli utenti con ruolo `SUPER_ADMIN` possono modificare eventi passati e i loro componenti (workdays, assignments)

2. **Validazione Cascade**: La validazione viene applicata in cascata:
   - Eventi → Workdays → Assignments
   - Se un evento è passato, tutti i workdays e assignments associati sono protetti

3. **Location Validation**: La validazione della location archiviata viene applicata a:
   - Creazione/modifica Eventi
   - Creazione/modifica Workdays

4. **User Validation**: La validazione dell'utente archiviato viene applicata a:
   - Creazione/modifica Assignments (campo userId)
   - Modifica Assignments (campo assignedUsers - array di utenti)

## Test Suggeriti

1. Testare la creazione di un evento con location archiviata (deve fallire)
2. Testare la modifica di un evento passato come Admin (deve fallire)
3. Testare la modifica di un evento passato come Super Admin (deve funzionare)
4. Testare l'assegnazione di un utente archiviato a un assignment (deve fallire)
5. Testare la creazione di workday per evento passato (deve fallire per non Super Admin)

## Compatibilità

Le modifiche sono **backward compatible**:
- Eventi esistenti non vengono modificati
- Il comportamento esistente viene esteso con nuove validazioni
- Non sono richieste migrazioni del database






