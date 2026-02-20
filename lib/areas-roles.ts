// Definizione delle aree e ruoli disponibili

export const AREAS = {
  TECNICA: "Area Tecnica",
  SALA: "Area di Sala",
  AMMINISTRATIVA: "Area Amministrativa",
} as const;

export const ROLES_BY_AREA: Record<string, string[]> = {
  [AREAS.TECNICA]: ["Macchinista", "Elettricista", "Fonico", "Facchino"],
  [AREAS.SALA]: ["Maschera", "Custode", "Biglietteria"],
  [AREAS.AMMINISTRATIVA]: [], // Nessun ruolo per area amministrativa
};

export type AreaType = typeof AREAS[keyof typeof AREAS];

export interface UserRoles {
  [area: string]: string[]; // Es: { "Area Tecnica": ["Macchinista", "Elettricista"], "Area di Sala": ["Maschera"] }
}


