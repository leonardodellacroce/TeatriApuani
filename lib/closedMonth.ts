import { prisma } from "@/lib/prisma";

/** Restituisce (anno, mese 1-12) del mese precedente rispetto a oggi */
export function getPreviousMonth(): { year: number; month: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  if (month === 0) {
    return { year: year - 1, month: 12 };
  }
  return { year, month }; // month è 1-11, quindi mese precedente
}

/** Verifica se (year, month) è il mese precedente rispetto a oggi */
export function isPreviousMonth(year: number, month: number): boolean {
  const prev = getPreviousMonth();
  return year === prev.year && month === prev.month;
}

/** Verifica se una data ricade nel mese precedente rispetto a oggi */
export function isDateInPreviousMonth(date: Date): boolean {
  const d = new Date(date);
  const prev = getPreviousMonth();
  return d.getFullYear() === prev.year && d.getMonth() + 1 === prev.month;
}

/** Verifica se un mese (year, month) è chiuso */
export async function isMonthClosed(year: number, month: number): Promise<boolean> {
  const found = await prisma.closedMonth.findFirst({
    where: { year, month },
  });
  return !!found;
}

/** Verifica se una data ricade in un mese chiuso */
export async function isDateInClosedMonth(date: Date): Promise<boolean> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 0-11 -> 1-12
  return isMonthClosed(year, month);
}
