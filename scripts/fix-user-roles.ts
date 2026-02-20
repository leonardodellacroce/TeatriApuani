import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fixing user roles...');
  
  // Update all users with 'UTENTE' role to null
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET role = NULL WHERE role = 'UTENTE'`
  );
  
  console.log(`Updated ${result} users`);
  
  await prisma.$disconnect();
}

main();


