/**
 * Modalità operativa per utenti non-standard con isWorker.
 * - admin: vede funzionalità amministrative, NON vede Le Mie Ore / I Miei Turni
 * - worker: vede solo Dashboard, Eventi, Le Mie Ore, I Miei Turni (come utente standard)
 */
export type WorkMode = "admin" | "worker";

const COOKIE_NAME = "workMode";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 anno

/** Legge workMode dal cookie (client-side) */
export function getWorkModeCookie(): WorkMode {
  if (typeof document === "undefined") return "admin";
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === "worker" ? "worker" : "admin";
}

/** Verifica se il cookie workMode è impostato */
export function hasWorkModeCookie(): boolean {
  if (typeof document === "undefined") return false;
  return new RegExp(`(?:^|; )${COOKIE_NAME}=`).test(document.cookie);
}

/** Nome dell'evento dispatchato quando cambia la modalità (per aggiornare la UI senza ricaricare) */
export const WORK_MODE_CHANGED_EVENT = "workModeChanged";

/** Imposta workMode cookie (client-side) e notifica i listener */
export function setWorkModeCookie(mode: WorkMode): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORK_MODE_CHANGED_EVENT, { detail: { mode } }));
  }
}

/** Legge workMode dalla richiesta (server-side, API routes) */
export function getWorkModeFromRequest(req: { cookies?: { get: (name: string) => { value?: string } | undefined }; headers?: Headers }): WorkMode {
  try {
    const cookie = req.cookies?.get?.(COOKIE_NAME);
    let value = cookie?.value;
    if (value === undefined && req.headers) {
      const cookieHeader = req.headers.get?.("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
        value = match ? decodeURIComponent(match[1]) : undefined;
      }
    }
    return value === "worker" ? "worker" : "admin";
  } catch {
    return "admin";
  }
}

/** Legge workMode dai cookie (server-side, Server Components) */
export async function getWorkModeFromServer(): Promise<WorkMode> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    const value = cookie?.value;
    return value === "worker" ? "worker" : "admin";
  } catch {
    return "admin";
  }
}
