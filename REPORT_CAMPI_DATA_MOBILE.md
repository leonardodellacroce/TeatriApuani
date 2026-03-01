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

## Implementazione effettuata

### 1. `app/globals.css` (solo mobile, max-width: 767.98px)
- `min-width: 100% !important` – forza larghezza minima uguale al parent
- `width: 100% !important` e `max-width: 100% !important`
- `box-sizing: border-box !important`

### 2. `app/dashboard/events/new/page.tsx` e `edit/page.tsx`
- **Mobile:** `flex flex-col gap-4 w-full` – layout come Note
- **Desktop:** `sm:grid sm:grid-cols-2` – date affiancate
- Wrapper: `min-w-0 w-full` per ogni campo
