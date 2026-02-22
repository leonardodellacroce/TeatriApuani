/**
 * Script per reimpostare la password del SuperAdmin.
 * Esegui con: npx tsx scripts/reset-superadmin-password.ts <email> [nuova_password]
 * Esempio: npx tsx scripts/reset-superadmin-password.ts leonardo@hivegroup.it password123
 * Se non specifichi la password, verrà usata "password123"
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "leonardo@hivegroup.it";
  const newPassword = process.argv[3] || "password123";

  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) {
    console.error(`Utente non trovato: ${email}`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      lockedUntil: null,
      failedLoginAttempts: 0,
      mustChangePassword: true,
    },
  });

  console.log(`Password reimpostata per: ${email}`);
  console.log(`Nuova password: ${newPassword}`);
  console.log(`Al primo accesso ti verrà chiesto di cambiarla.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
