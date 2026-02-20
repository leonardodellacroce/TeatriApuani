import { prisma } from "@/lib/prisma";

/**
 * Verifica se un evento è passato (endDate è nel passato)
 */
export function isEventPast(endDate: Date): boolean {
  const now = new Date();
  // Normalizza entrambe le date a mezzanotte per confronto equo
  const endDateNormalized = new Date(endDate);
  endDateNormalized.setHours(0, 0, 0, 0);
  
  const nowNormalized = new Date(now);
  nowNormalized.setHours(0, 0, 0, 0);
  
  // L'evento è passato se endDate < oggi (mezzanotte di oggi)
  return endDateNormalized < nowNormalized;
}

/**
 * Verifica se una location esiste ed è archiviata
 * @returns null se la location non esiste, true se è archiviata, false altrimenti
 */
export async function isLocationArchived(locationId: string): Promise<boolean | null> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { isArchived: true },
  });
  
  if (!location) return null;
  return location.isArchived;
}

/**
 * Verifica se un cliente esiste ed è archiviato
 * @returns null se il cliente non esiste, true se è archiviato, false altrimenti
 */
export async function isClientArchived(clientId: string): Promise<boolean | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { isArchived: true },
  });
  
  if (!client) return null;
  return client.isArchived;
}

/**
 * Verifica se un utente esiste ed è archiviato
 * @returns null se l'utente non esiste, true se è archiviato, false altrimenti
 */
export async function isUserArchived(userId: string): Promise<boolean | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isArchived: true },
  });
  
  if (!user) return null;
  return user.isArchived;
}

/**
 * Verifica se un evento esiste e se è passato
 * @returns { exists: boolean, isPast: boolean, endDate?: Date }
 */
export async function checkEventStatus(eventId: string): Promise<{
  exists: boolean;
  isPast: boolean;
  endDate?: Date;
}> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { endDate: true },
  });
  
  if (!event) {
    return { exists: false, isPast: false };
  }
  
  return {
    exists: true,
    isPast: isEventPast(event.endDate),
    endDate: event.endDate,
  };
}






