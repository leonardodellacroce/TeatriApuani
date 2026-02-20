import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const duties = [
    { code: "001", name: "Macchinista", area: "Area Tecnica" },
    { code: "002", name: "Elettricista", area: "Area Tecnica" },
    { code: "003", name: "Fonico", area: "Area Tecnica" },
    { code: "004", name: "Facchino", area: "Area Tecnica" },
    { code: "005", name: "Maschera", area: "Area di Sala" },
    { code: "006", name: "Custode", area: "Area di Sala" },
    { code: "007", name: "Biglietteria", area: "Area di Sala" },
  ];

  for (const duty of duties) {
    try {
      const existing = await prisma.duty.findFirst({
        where: { code: duty.code },
      });

      if (!existing) {
        await prisma.duty.create({ data: duty });
        console.log(`✓ Created duty: ${duty.name} (${duty.area})`);
      } else {
        console.log(`- Duty already exists: ${duty.name}`);
      }
    } catch (e: any) {
      console.log(`✗ Error creating duty ${duty.name}:`, e.message);
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


