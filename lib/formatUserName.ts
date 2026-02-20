/**
 * Formattazione nomi utente: abbreviato (Iniziale. Cognome) oppure completo in caso di ambiguità.
 * Usa il nome completo solo se due o più utenti hanno stesso cognome e stessa iniziale del nome.
 */
export interface UserLike {
  name?: string | null;
  cognome?: string | null;
  code?: string;
}

function getFullName(u: UserLike): string {
  const n = (u.name || "").trim();
  const c = (u.cognome || "").trim();
  return [n, c].filter(Boolean).join(" ") || (u.code || "-");
}

function getAbbreviated(u: UserLike): string {
  const name = (u.name || "").trim();
  const cognome = (u.cognome || "").trim();
  const initial = name.charAt(0).toUpperCase();
  if (cognome) {
    return initial ? `${initial}. ${cognome}` : cognome;
  }
  return name || (u.code || "-");
}

/**
 * Conta quanti utenti nel contesto hanno stesso cognome e stessa iniziale del nome.
 */
function countAmbiguous(
  user: UserLike,
  allInContext: UserLike[]
): number {
  const cognome = (user.cognome || "").trim().toLowerCase();
  const initial = (user.name || "").trim().charAt(0).toUpperCase();
  if (!cognome || !initial) return 0;
  return allInContext.filter((u) => {
    const c = (u.cognome || "").trim().toLowerCase();
    const i = (u.name || "").trim().charAt(0).toUpperCase();
    return c === cognome && i === initial;
  }).length;
}

/**
 * Formatta il nome utente: abbreviato (es. "L. Della Croce") oppure completo
 * se nel contesto ci sono 2+ utenti con stesso cognome e stessa iniziale.
 */
export function formatUserName(user: UserLike, allUsersInContext: UserLike[]): string {
  const full = getFullName(user);
  if (!user.name && !user.cognome) return user.code || "-";
  const ambiguous = countAmbiguous(user, allUsersInContext);
  return ambiguous >= 2 ? full : getAbbreviated(user);
}
