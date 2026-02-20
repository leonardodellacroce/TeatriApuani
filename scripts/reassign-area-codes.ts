import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const areas = await prisma.area.findMany({ orderBy: { name: "asc" } });
  let index = 1;
  for (const area of areas) {
    const newCode = String(index).padStart(3, "0");
    if (area.code !== newCode) {
      await prisma.area.update({ where: { id: area.id }, data: { code: newCode } });
      console.log(`Area ${area.name}: ${area.code} -> ${newCode}`);
    }
    index += 1;
  }
  console.log("Reassign complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
