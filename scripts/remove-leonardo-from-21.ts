/**
 * Rimuove Leonardo Della Croce dall'assignment del 21/02 (Perfetti Sconosciuti)
 * che dovrebbe essere stato rimosso automaticamente all'approvazione dell'indisponibilità.
 *
 * Esegui: npx tsx scripts/remove-leonardo-from-21.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEONARDO_ID = "cmlvbds5r00009k3eqj52y7ti";
const ASSIGNMENT_ID = "cmlw7oemi00059kglngpo3qfz"; // Perfetti Sconosciuti 21/02

async function main() {
  const a = await prisma.assignment.findUnique({
    where: { id: ASSIGNMENT_ID },
    include: {
      workday: { include: { event: { select: { title: true } } } },
    },
  });

  if (!a) {
    console.log("Assignment non trovato.");
    return;
  }

  console.log("Assignment:", a.workday?.event?.title, "| workday date:", a.workday?.date);
  console.log("assignedUsers prima:", a.assignedUsers);

  if (!a.assignedUsers) {
    console.log("Nessun assignedUsers - nulla da rimuovere.");
    return;
  }

  const arr = JSON.parse(a.assignedUsers) as Array<{ userId: string; dutyId?: string }>;
  const filtered = arr.filter((x) => x.userId !== LEONARDO_ID);

  if (filtered.length === arr.length) {
    console.log("Leonardo non trovato in assignedUsers.");
    return;
  }

  await prisma.assignment.update({
    where: { id: ASSIGNMENT_ID },
    data: { assignedUsers: JSON.stringify(filtered) },
  });

  console.log("Rimosso. assignedUsers dopo:", JSON.stringify(filtered));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
