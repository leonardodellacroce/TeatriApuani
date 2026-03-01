import { UserRole } from "@prisma/client";

interface User {
  role?: UserRole | string;
  isCoordinatore?: boolean;
}

export function hasRole(user: User | null | undefined, roles: UserRole[]): boolean {
  if (!user) {
    return false;
  }
  return roles.includes(user.role as UserRole);
}

export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = user.role as string;
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function isAdminRole(role: string | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Ruoli che possono gestire workdays e vedere tutti gli eventi (include coordinatori come utenti standard con permessi aggiuntivi) */
const ROLES_CAN_MANAGE_WORKDAYS = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

export function canManageWorkdays(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role as string) || "";
  return ROLES_CAN_MANAGE_WORKDAYS.includes(role) || user.isCoordinatore === true;
}

export function canSeeAllEvents(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role as string) || "";
  return ROLES_CAN_MANAGE_WORKDAYS.includes(role) || user.isCoordinatore === true;
}

/** Può aprire eventi chiusi (include coordinatori) */
export function canOpenClosedEvents(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role as string) || "";
  return ROLES_CAN_MANAGE_WORKDAYS.includes(role) || user.isCoordinatore === true;
}

