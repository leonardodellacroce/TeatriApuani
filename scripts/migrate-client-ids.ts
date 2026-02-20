import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateClientIds() {
  console.log("Starting migration of clientIds...");

  // Carica tutti i clienti
  const allClients = await prisma.client.findMany();
  console.log(`Loaded ${allClients.length} clients`);

  // Carica tutti gli eventi che hanno clientName ma non clientIds
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { clientIds: null },
        { clientIds: "" }
      ]
    }
  });

  console.log(`Found ${events.length} events to migrate`);

  for (const event of events) {
    if (!event.clientName) {
      console.log(`Event ${event.id} has no clientName, skipping`);
      continue;
    }

    // Split clientName by comma
    const clientNames = event.clientName.split(",").map(n => n.trim());
    console.log(`Event ${event.id} (${event.title}) has clients:`, clientNames);

    // Find matching client IDs
    const clientIds: string[] = [];
    for (const name of clientNames) {
      const client = allClients.find(c => {
        if (c.ragioneSociale === name) return true;
        if (c.nome && c.cognome && `${c.nome} ${c.cognome}` === name) return true;
        return false;
      });

      if (client) {
        clientIds.push(client.id);
        console.log(`  - Matched "${name}" to client ID: ${client.id}`);
      } else {
        console.log(`  - WARNING: Could not find client for "${name}"`);
      }
    }

    if (clientIds.length > 0) {
      // Update event with clientIds
      await prisma.event.update({
        where: { id: event.id },
        data: {
          clientIds: JSON.stringify(clientIds)
        }
      });
      console.log(`  ✓ Updated event ${event.id} with ${clientIds.length} client IDs`);

      // If there's exactly 1 client, auto-assign to all shifts
      if (clientIds.length === 1) {
        const workdays = await prisma.workday.findMany({
          where: { eventId: event.id },
          select: { id: true }
        });

        if (workdays.length > 0) {
          const workdayIds = workdays.map(w => w.id);
          const shifts = await prisma.assignment.findMany({
            where: {
              workdayId: { in: workdayIds },
              taskType: { type: "SHIFT" }
            },
            select: { id: true }
          });

          if (shifts.length > 0) {
            await prisma.assignment.updateMany({
              where: {
                id: { in: shifts.map(s => s.id) }
              },
              data: {
                clientId: clientIds[0]
              }
            });
            console.log(`  ✓ Auto-assigned ${shifts.length} shifts to client ${clientIds[0]}`);
          }
        }
      }
    }
  }

  console.log("Migration completed!");
  await prisma.$disconnect();
}

migrateClientIds().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

