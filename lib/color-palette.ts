/**
 * Palette condivisa di 32 colori per Locations e Tipologie turno.
 */
export const COLOR_PALETTE = [
  { name: "Rosso", value: "#EF4444" },
  { name: "Rosso Scuro", value: "#B91C1C" },
  { name: "Arancione", value: "#F97316" },
  { name: "Arancione Chiaro", value: "#FB923C" },
  { name: "Ambra", value: "#F59E0B" },
  { name: "Giallo", value: "#EAB308" },
  { name: "Giallo Chiaro", value: "#FDE047" },
  { name: "Lime", value: "#84CC16" },
  { name: "Verde", value: "#22C55E" },
  { name: "Verde Scuro", value: "#15803D" },
  { name: "Smeraldo", value: "#10B981" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Cielo", value: "#0EA5E9" },
  { name: "Blu", value: "#3B82F6" },
  { name: "Blu Scuro", value: "#1D4ED8" },
  { name: "Indaco", value: "#6366F1" },
  { name: "Viola", value: "#8B5CF6" },
  { name: "Viola Chiaro", value: "#A78BFA" },
  { name: "Fucsia", value: "#D946EF" },
  { name: "Rosa", value: "#EC4899" },
  { name: "Rosa Chiaro", value: "#F472B6" },
  { name: "Marrone", value: "#92400E" },
  { name: "Marrone Chiaro", value: "#B45309" },
  { name: "Grigio", value: "#6B7280" },
  { name: "Grigio Scuro", value: "#4B5563" },
  { name: "Grigio Chiaro", value: "#9CA3AF" },
  { name: "Slate", value: "#64748B" },
  { name: "Zinco", value: "#71717A" },
  { name: "Pietra", value: "#78716C" },
  { name: "Neutro", value: "#737373" },
  { name: "Nero", value: "#404040" },
];

export const COLOR_NAMES: Record<string, string> = Object.fromEntries(
  COLOR_PALETTE.map((c) => [c.value, c.name])
);

export function getColorName(color: string | null): string {
  if (!color) return "";
  return COLOR_NAMES[color] || color;
}
