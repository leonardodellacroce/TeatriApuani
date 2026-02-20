import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const prefixMap: Record<string, string> = {
    "Area di Biglietteria": "B",
    "Area di Sala": "S",
    "Area Tecnica": "T",
  };

  const duties = await prisma.duty.findMany({ orderBy: { createdAt: "asc" } });

  // Group by area
  const byArea: Record<string, typeof duties> = {} as any;
  for (const d of duties) {
    byArea[d.area] = byArea[d.area] || [];
    byArea[d.area].push(d as any);
  }

  for (const area of Object.keys(byArea)) {
    const prefix = prefixMap[area] || "";
    let idx = 1;
    for (const duty of byArea[area]) {
      const code = `${prefix}-${String(idx).padStart(3, '0')}`;
      await prisma.duty.update({ where: { id: duty.id }, data: { code } });
      console.log(`Updated ${duty.name} (${area}) -> ${code}`);
      idx += 1;
    }
  }

  console.log("Reassignment completed.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
