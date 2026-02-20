import { UserRoles } from "@/lib/areas-roles";

export function formatAreas(areasJson: string | null): string {
  if (!areasJson) return "-";
  try {
    const areas = JSON.parse(areasJson);
    return Array.isArray(areas) ? areas.join(", ") : "-";
  } catch {
    return "-";
  }
}

export function formatRoles(rolesJson: string | null): string {
  if (!rolesJson) return "-";
  try {
    const roles: UserRoles = JSON.parse(rolesJson);
    const roleStrings: string[] = [];
    
    for (const [area, roleArray] of Object.entries(roles)) {
      if (roleArray.length > 0) {
        roleStrings.push(`${area}: ${roleArray.join(", ")}`);
      }
    }
    
    return roleStrings.length > 0 ? roleStrings.join(" | ") : "-";
  } catch {
    return "-";
  }
}


