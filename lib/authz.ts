import { UserRole } from "@prisma/client";

interface User {
  role: UserRole | string;
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

