/**
 * Verifica coerenza: notifiche "Orari da inserire" vs assegnazioni effettive.
 * Trova notifiche obsolete (utente non ha più turni per quelle date).
 *
 * Esegui: npx tsx scripts/verify-notifications-consistency.ts
 */
import { PrismaClient } from "@prisma/client";
import { getAssignmentsForUserInDateRange } from "../lib/myShiftsData";

const prisma = new PrismaClient();

function parseDatesFromMessage(message: string): string[] {
  const match = message.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
  if (!match) return [];
  return match.map((d) => {
    const [day, month, year] = d.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  });
}

async function main() {
  const notifications = await prisma.notification.findMany({
    where: {
      type: "MISSING_HOURS_REMINDER",
      read: false,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    include: { user: { select: { id: true, name: true, cognome: true, email: true } } },
  });

  console.log(`Notifiche MISSING_HOURS_REMINDER non lette (ultimi 30gg): ${notifications.length}\n`);

  let obsoleteCount = 0;
  for (const n of notifications) {
    const meta = n.metadata as { dates?: string[] } | null;
    let dates = meta?.dates;
    if (!dates?.length) dates = parseDatesFromMessage(n.message);
    if (!dates.length) continue;

    const sortedDates = [...dates].sort();
    const assignments = await getAssignmentsForUserInDateRange(
      n.userId,
      sortedDates[0],
      sortedDates[sortedDates.length - 1]
    );
    const withoutHours = assignments.filter((a) => !a.timeEntries || a.timeEntries.length === 0);

    if (withoutHours.length === 0) {
      obsoleteCount++;
      const name = n.user ? `${n.user.name || ""} ${n.user.cognome || ""}`.trim() || n.user.email : n.userId;
      console.log(`[OBSOLETA] ${name} (${n.userId}) - date: ${dates.join(", ")}`);
      console.log(`  Messaggio: ${n.message.slice(0, 80)}...`);
    }
  }

  if (obsoleteCount > 0) {
    console.log(`\n--- Trovate ${obsoleteCount} notifiche obsolete. Dovrebbero essere filtrate dall'API.`);
    console.log("Per segnarle come lette: le notifiche vengono auto-marcate al prossimo fetch.");
  } else {
    console.log("Nessuna notifica obsoleta trovata.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
