/**
 * Script per correggere le date delle indisponibilità salvate con il bug del fuso orario.
 * Il bug: setHours(0,0,0,0) usava l'ora locale, causando uno shift (es. 19 feb → 18 feb 23:00 UTC).
 *
 * Esegui con: npx tsx scripts/fix-unavailability-dates.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fixDate(d: Date): Date | null {
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();

  // Se la data è già a mezzanotte UTC, non correggere (record già corretto)
  if (hours === 0 && minutes === 0 && seconds === 0 && ms === 0) {
    return null;
  }

  // Il bug: la data era stata impostata con setHours (locale).
  // Per correggere: aggiungiamo l'offset del fuso orario per ottenere la data "intesa"
  const offsetMs = -d.getTimezoneOffset() * 60 * 1000;
  const corrected = new Date(d.getTime() + offsetMs);
  corrected.setUTCHours(0, 0, 0, 0);
  return corrected;
}

function fixDateEnd(d: Date): Date | null {
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();

  // Se dateEnd è già 23:59:59 UTC, non correggere (record già corretto)
  if (hours === 23 && minutes === 59 && seconds >= 59) {
    return null;
  }

  const offsetMs = -d.getTimezoneOffset() * 60 * 1000;
  const corrected = new Date(d.getTime() + offsetMs);
  corrected.setUTCHours(23, 59, 59, 999);
  return corrected;
}

async function main() {
  const all = await prisma.unavailability.findMany({
    orderBy: { dateStart: "asc" },
  });

  console.log(`Trovate ${all.length} indisponibilità.`);

  let fixed = 0;
  for (const u of all) {
    const dStart = new Date(u.dateStart);
    const dEnd = new Date(u.dateEnd);

    const newStart = fixDate(dStart);
    const newEnd = fixDateEnd(dEnd);

    if (newStart || newEnd) {
      const updates: { dateStart?: Date; dateEnd?: Date } = {};
      if (newStart) updates.dateStart = newStart;
      if (newEnd) updates.dateEnd = newEnd;

      await prisma.unavailability.update({
        where: { id: u.id },
        data: updates,
      });
      fixed++;
      console.log(
        `  Corretto id=${u.id}: ${u.dateStart.toISOString()} → ${updates.dateStart?.toISOString() ?? "(invariato)"}, ${u.dateEnd.toISOString()} → ${updates.dateEnd?.toISOString() ?? "(invariato)"}`
      );
    }
  }

  console.log(`\nCorrette ${fixed} indisponibilità su ${all.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
