import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Hash password comune per tutti
  const hashedPassword = await bcrypt.hash("password123", 10);

  // Creo gli utenti di prova per ogni ruolo
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "superadmin@test.com" },
      update: {},
      create: {
        code: "001",
        email: "superadmin@test.com",
        password: hashedPassword,
        name: "Super Admin",
        role: "SUPER_ADMIN",
        isSuperAdmin: true,
        isAdmin: false,
        isResponsabile: false,
      },
    }),
    prisma.user.upsert({
      where: { email: "admin@test.com" },
      update: {},
      create: {
        code: "002",
        email: "admin@test.com",
        password: hashedPassword,
        name: "Admin User",
        role: "ADMIN",
        isSuperAdmin: false,
        isAdmin: true,
        isResponsabile: false,
      },
    }),
    prisma.user.upsert({
      where: { email: "responsabile@test.com" },
      update: {},
      create: {
        code: "003",
        email: "responsabile@test.com",
        password: hashedPassword,
        name: "Responsabile",
        role: "RESPONSABILE",
        isAdmin: false,
        isResponsabile: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "coordinatore@test.com" },
      update: {},
      create: {
        code: "004",
        email: "coordinatore@test.com",
        password: hashedPassword,
        name: "Coordinatore",
        cognome: "Test",
        role: null,
        isCoordinatore: true,
        isAdmin: false,
        isResponsabile: false,
      },
    }),
    prisma.user.upsert({
      where: { email: "utente@test.com" },
      update: {},
      create: {
        code: "005",
        email: "utente@test.com",
        password: hashedPassword,
        name: "Utente",
        cognome: "Standard",
        role: null,
        isCoordinatore: false,
        isAdmin: false,
        isResponsabile: false,
      },
    }),
  ]);

  console.log("Created users:");
  users.forEach((user) => {
    console.log(`- ${user.name} (${user.email}) - Role: ${user.role}`);
  });

  // Companies
  const companiesData = [
    { code: "001", ragioneSociale: "Compagnia Alfa S.r.l.", city: "Roma", province: "RM", email: "info@alfasrl.it" },
    { code: "002", ragioneSociale: "Teatri Uniti S.p.A.", city: "Milano", province: "MI", email: "contatti@teatriuniti.it" },
  ];
  for (const c of companiesData) {
    await prisma.company.upsert({
      where: { code: c.code },
      update: c,
      create: c,
    });
  }

  // Locations
  const locationsData = [
    { code: "001", name: "Teatro Centrale", city: "Roma", province: "RM", color: "#2563eb" },
    { code: "002", name: "Auditorium Verdi", city: "Milano", province: "MI", color: "#16a34a" },
  ];
  for (const l of locationsData) {
    await prisma.location.upsert({
      where: { code: l.code },
      update: l,
      create: l,
    });
  }

  // Clients
  const clientsData = [
    { code: "001", type: "AZIENDA", ragioneSociale: "Produzioni XYZ S.r.l.", city: "Roma", province: "RM", email: "amministrazione@produzionixyz.it" },
    { code: "002", type: "PRIVATO", nome: "Mario", cognome: "Rossi", city: "Milano", province: "MI", email: "mario.rossi@email.it" },
  ];
  for (const cli of clientsData) {
    await prisma.client.upsert({
      where: { code: cli.code },
      update: cli,
      create: cli,
    });
  }

  // Areas (codici progressivi a 3 cifre univoci)
  const areasData = [
    { code: "001", name: "Area di Biglietteria" },
    { code: "002", name: "Area di Sala" },
    { code: "003", name: "Area Tecnica" },
  ];
  for (const a of areasData) {
    await prisma.area.upsert({
      where: { name: a.name },
      update: a,
      create: a,
    });
  }

  // Duties (mantengono i prefissi e tre cifre come richiesto in mansioni)
  const dutiesData = [
    { code: "B-001", name: "Biglietteria", area: "Area di Biglietteria" },
    { code: "S-001", name: "Maschera", area: "Area di Sala" },
    { code: "T-001", name: "Macchinista", area: "Area Tecnica" },
    { code: "T-002", name: "Elettricista", area: "Area Tecnica" },
  ];
  for (const d of dutiesData) {
    await prisma.duty.upsert({
      where: { code: d.code },
      update: d,
      create: d,
    });
  }

  // Events
  const teatroCentrale = await prisma.location.findFirst({ where: { code: "001" } });
  const auditoriumVerdi = await prisma.location.findFirst({ where: { code: "002" } });

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const event1Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 20, 0, 0);
  const event1End = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 0, 0);
  const event2Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 21, 0, 0);
  const event2End = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 1, 0, 0);

  const event1 = await prisma.event.create({
    data: {
      title: "Perfetti Sconosciuti",
      clientName: "Produzioni XYZ S.r.l.",
      locationId: teatroCentrale?.id || null,
      startDate: event1Start,
      endDate: event1End,
      notes: "Spettacolo teatrale",
      isClosed: false,
    },
  });

  const event2 = await prisma.event.create({
    data: {
      title: "Concerto di Autunno",
      clientName: "Mario Rossi",
      locationId: auditoriumVerdi?.id || null,
      startDate: event2Start,
      endDate: event2End,
      notes: "Evento musicale",
      isClosed: false,
    },
  });

  // Workdays con timeSpans (string JSON nel modello corrente)
  const spans1 = JSON.stringify([{ start: "18:00", end: "20:00" }, { start: "21:00", end: "23:00" }]);
  const spansOvernightA = JSON.stringify([{ start: "22:00", end: "24:00" }]);
  const spansOvernightB = JSON.stringify([{ start: "00:00", end: "02:00" }]);

  await prisma.workday.create({
    data: {
      eventId: event1.id,
      date: new Date(event1Start.getFullYear(), event1Start.getMonth(), event1Start.getDate()),
      locationId: teatroCentrale?.id || null,
      isOpen: true,
      timeSpans: spans1,
    },
  });

  // Overnight su due giorni
  const wd2DateA = new Date(event2Start.getFullYear(), event2Start.getMonth(), event2Start.getDate());
  const wd2DateB = new Date(wd2DateA.getTime() + oneDay);

  await prisma.workday.create({
    data: {
      eventId: event2.id,
      date: wd2DateA,
      locationId: auditoriumVerdi?.id || null,
      isOpen: true,
      timeSpans: spansOvernightA,
    },
  });
  await prisma.workday.create({
    data: {
      eventId: event2.id,
      date: wd2DateB,
      locationId: auditoriumVerdi?.id || null,
      isOpen: true,
      timeSpans: spansOvernightB,
    },
  });

  console.log("Seed completato: aziende, location, clienti, aree, mansioni, eventi e giornate creati.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
