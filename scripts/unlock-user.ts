/**
 * Script di emergenza per sbloccare un utente bloccato.
 * Esegui con: npx tsx scripts/unlock-user.ts <email>
 * Esempio: npx tsx scripts/unlock-user.ts leonardo@hivegroup.it
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "leonardo@hivegroup.it";
  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) {
    console.error(`Utente non trovato: ${email}`);
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lockedUntil: null,
      failedLoginAttempts: 0,
    },
  });
  console.log(`Account sbloccato per: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
