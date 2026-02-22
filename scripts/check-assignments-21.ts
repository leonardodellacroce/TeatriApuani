/**
 * Verifica se Leonardo Della Croce ha assegnazioni il 21/02/2026.
 * Esegui: npx tsx scripts/check-assignments-21.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function isUserInAssignment(a: { userId: string | null; assignedUsers: string | null }, userId: string): boolean {
  if (a.userId === userId) return true;
  if (!a.assignedUsers) return false;
  try {
    const parsed = JSON.parse(a.assignedUsers);
    if (!Array.isArray(parsed)) return false;
    return parsed.some((u: unknown) => {
      if (typeof u === "string") return u === userId;
      if (u && typeof u === "object" && "userId" in u) return (u as { userId: string }).userId === userId;
      return false;
    });
  } catch {
    return false;
  }
}

async function main() {
  const targetDate = "2026-02-21";
  const startDate = new Date(targetDate);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(targetDate);
  endDate.setUTCHours(23, 59, 59, 999);

  // Trova Leonardo Della Croce
  const leonardo = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { contains: "Leonardo", mode: "insensitive" } },
        { cognome: { contains: "Della Croce", mode: "insensitive" } },
        { email: { contains: "leonardo", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, cognome: true, email: true },
  });

  if (!leonardo) {
    console.log("Utente Leonardo Della Croce non trovato.");
    return;
  }

  console.log("Utente trovato:", leonardo.name, leonardo.cognome, leonardo.email, "| ID:", leonardo.id);

  // Tutti gli assignment SHIFT per il 21/02
  const assignments = await prisma.assignment.findMany({
    where: {
      taskType: { is: { type: "SHIFT" } },
      workday: { date: { gte: startDate, lte: endDate } },
    },
    include: {
      workday: {
        include: {
          event: { select: { title: true } },
          location: { select: { name: true } },
        },
      },
      taskType: { select: { name: true } },
      timeEntries: { where: { userId: leonardo.id }, select: { id: true } },
    },
  });

  console.log("\n--- Assignment SHIFT per il 21/02/2026 ---");
  console.log("Totale:", assignments.length);

  for (const a of assignments) {
    const wdDate = a.workday.date;
    const dateStr = wdDate instanceof Date ? wdDate.toISOString().slice(0, 10) : String(wdDate).slice(0, 10);
    const isLeonardoAssigned = isUserInAssignment(a, leonardo.id);
    const hasTimeEntry = a.timeEntries && a.timeEntries.length > 0;

    console.log("\n- Assignment ID:", a.id);
    console.log("  Data workday:", dateStr);
    console.log("  Evento:", a.workday.event?.title);
    console.log("  Location:", a.workday.location?.name);
    console.log("  Orari:", a.startTime, "-", a.endTime);
    console.log("  userId (legacy):", a.userId);
    console.log("  assignedUsers:", a.assignedUsers?.slice(0, 100) + (a.assignedUsers && a.assignedUsers.length > 100 ? "..." : ""));
    console.log("  Leonardo assegnato?", isLeonardoAssigned);
    console.log("  Ha timeEntry?", hasTimeEntry);
  }

  const leonardoAssignments = assignments.filter((a) => isUserInAssignment(a, leonardo.id));
  const withoutHours = leonardoAssignments.filter((a) => !a.timeEntries || a.timeEntries.length === 0);

  console.log("\n--- Riepilogo per Leonardo ---");
  console.log("Assignment dove Leonardo è assegnato:", leonardoAssignments.length);
  console.log("Di questi, senza ore inserite:", withoutHours.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
