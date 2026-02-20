import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('Total users:', users.length);
  users.forEach(u => {
    console.log({
      code: u.code,
      email: u.email,
      name: u.name,
      cognome: u.cognome,
      isSuperAdmin: u.isSuperAdmin,
      isAdmin: u.isAdmin,
      isActive: u.isActive,
    });
  });
  await prisma.$disconnect();
}

main();


