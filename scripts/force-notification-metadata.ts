/**
 * Esegue manualmente la migrazione per aggiungere metadata a Notification.
 * Usa quando prisma migrate deploy fallisce per timeout del lock.
 *
 * Esegui con: npx tsx scripts/force-notification-metadata.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
  `);
  console.log("Colonna metadata aggiunta a Notification.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
