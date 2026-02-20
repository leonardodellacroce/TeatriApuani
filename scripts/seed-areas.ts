import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const areas = [
    { code: "001", name: "Area Tecnica" },
    { code: "002", name: "Area di Sala" },
    { code: "001", name: "Area di Biglietteria" },
  ];

  for (const area of areas) {
    try {
      await prisma.area.upsert({
        where: { name: area.name },
        update: {},
        create: area,
      });
      console.log(`✓ Created/updated area: ${area.name}`);
    } catch (e: any) {
      console.log(`✗ Error creating area ${area.name}:`, e.message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


