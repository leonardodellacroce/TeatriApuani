# Report: campi data/ora su mobile – larghezza come campo Note

## Problema
I campi `input[type="date"]` e `input[type="time"]` su mobile non raggiungono la stessa larghezza del campo Note, pur essendo nello stesso form.

## Cause identificate

### 1. **Shadow DOM e comportamento dei browser**
- `input[type="date"]` usa Shadow DOM (Chrome, Safari, Firefox)
- Ogni browser gestisce larghezza e padding in modo diverso
- Safari iOS ignora spesso `width: 100%` (bug noto)
- Chrome può applicare `min-width` impliciti

### 2. **Layout a griglia**
- Con `grid grid-cols-1` le celle possono avere calcoli di larghezza diversi da un semplice blocco
- La griglia può ridurre la larghezza effettiva dei campi

### 3. **Tentativi precedenti e limiti**
- `min-width: 0` – utile ma non sufficiente
- `max-width: 100%` – evita overflow ma non forza la larghezza
- `width: 100%` – ignorato da alcuni browser
- Padding ridotto – aiuta l’overflow ma non la larghezza

## Soluzione proposta (solo mobile)

### A. Layout: flex invece di grid
- **Mobile:** `flex flex-col w-full` per il blocco date
- **Desktop:** `grid grid-cols-2` invariato
- Ogni campo date diventa un figlio flex che occupa tutta la larghezza, come il campo Note

### B. CSS globale (solo mobile, max-width: 767.98px)
```css
input[type="date"], input[type="time"], ... {
  width: 100% !important;
  min-width: 100% !important;  /* forza larghezza minima = parent */
  max-width: 100% !important;
  box-sizing: border-box !important;
}
```

### C. Wrapper dei campi
- Ogni campo date in un wrapper `w-full min-w-0`
- Il wrapper deve avere `width: 100%` per dare un riferimento chiaro all’input

## Compatibilità browser
- **Chrome/Edge:** `min-width: 100%` + `width: 100%` funziona
- **Safari iOS:** `min-width: 100%` aiuta; in casi estremi serve `-webkit-appearance: none` (cambia aspetto)
- **Firefox:** rispetta bene `width: 100%` e `box-sizing`

## Implementazione effettuata (soluzione solida)

### Soluzione: componenti DateInput e TimeInput
Invece di forzare CSS sugli input nativi (Shadow DOM), si usano componenti custom:
- **DateInput** e **TimeInput**: bottone stilizzato + input nativo nascosto
- Il tap sul bottone apre il date/time picker nativo tramite `showPicker()`
- Layout e larghezza completamente controllati dal bottone (come Note)
- Nessun problema Shadow DOM su Safari iOS

### 1. `components/DateInput.tsx` e `components/TimeInput.tsx`
- Bottone con `w-full min-w-0` che occupa tutta la larghezza del parent
- Input nativo nascosto (visually hidden) per form submit e picker
- DateInput: supporta `min`, `max`, `disabled`, formato dd/MM/yyyy in display
- TimeInput: supporta `onBlur` per normalizzazione HH:mm

### 2. Pagine aggiornate (tutti gli input date/time sostituiti)
- `app/dashboard/events/new/page.tsx` e `[id]/edit/page.tsx` – DateInput
- `app/dashboard/events/[id]/workdays/new/page.tsx` – DateInput, TimeInput
- `app/dashboard/events/[id]/workdays/[id]/edit/page.tsx` – DateInput, TimeInput
- `app/dashboard/events/[id]/workdays/[workdayId]/page.tsx` – TimeInput (activityTimes, shiftTimes, shiftBreaks)
- `app/dashboard/unavailabilities/page.tsx` – DateInput, TimeInput
- `app/dashboard/my-shifts/page.tsx` e `free-hours/page.tsx` – DateInput, TimeInput
- `app/dashboard/admin/shifts-hours/page.tsx` – DateInput, TimeInput
- `app/dashboard/reports/page.tsx` – DateInput
- `app/dashboard/events/[id]/page.tsx` – DateInput (move event)
