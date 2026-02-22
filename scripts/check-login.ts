/**
 * Script per verificare perché il login fallisce.
 * npx tsx scripts/check-login.ts leonardo@hivegroup.it password123
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "leonardo@hivegroup.it";
  const password = process.argv[3] || "password123";

  console.log("Verifica login per:", email);
  console.log("---");

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.log("ERRORE: Utente non trovato con questa email.");
    const allUsers = await prisma.user.findMany({ select: { email: true } });
    console.log("Email esistenti:", allUsers.map((u) => u.email).join(", "));
    process.exit(1);
  }

  console.log("Utente trovato:", user.id);
  console.log("Email:", user.email);
  console.log("isActive:", user.isActive);
  console.log("isArchived:", user.isArchived);
  console.log("isSuperAdmin:", user.isSuperAdmin);
  console.log("Password hash (primi 20 char):", user.password?.substring(0, 20) + "...");

  const isValid = await bcrypt.compare(password, user.password);
  console.log("---");
  console.log("bcrypt.compare(password, hash):", isValid ? "OK" : "FALLITO");

  if (!isValid) {
    const testHash = await bcrypt.hash(password, 10);
    const testCompare = await bcrypt.compare(password, testHash);
    console.log("Test bcrypt con nuova hash:", testCompare ? "OK" : "FALLITO");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
