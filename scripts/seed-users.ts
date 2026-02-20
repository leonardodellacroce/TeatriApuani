import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding users...');

  // Hash password
  const password = await hash('password123', 10);

  // Creo SUPER_ADMIN
  const admin = await prisma.user.upsert({
    where: { email: 'admin@teatro.it' },
    update: {},
    create: {
      code: '000',
      name: 'SUPER',
      cognome: 'ADMIN',
      email: 'admin@teatro.it',
      password,
      role: 'SUPER_ADMIN',
      isSuperAdmin: true,
      isAdmin: false,
      isResponsabile: false,
      isCoordinatore: false,
      isActive: true,
    },
  });

  console.log('SUPER_ADMIN created:', { id: admin.id, code: admin.code, email: admin.email });

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


