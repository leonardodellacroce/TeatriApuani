-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Company
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "partitaIva" TEXT,
    "codiceFiscale" TEXT,
    "codiceSDI" TEXT,
    "email" TEXT,
    "pec" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Assegna codici progressivi alle aziende esistenti
INSERT INTO "new_Company" 
SELECT 
    "id",
    printf('%03d', ROW_NUMBER() OVER (ORDER BY "createdAt")),
    "ragioneSociale",
    "address",
    "city",
    "province",
    "postalCode",
    "partitaIva",
    "codiceFiscale",
    "codiceSDI",
    "email",
    "pec",
    "createdAt",
    "updatedAt"
FROM "Company";

DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- Location
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Assegna codici progressivi alle location esistenti
INSERT INTO "new_Location"
SELECT 
    "id",
    printf('%03d', ROW_NUMBER() OVER (ORDER BY "createdAt")),
    "name",
    "address",
    "city",
    "province",
    "postalCode",
    "createdAt",
    "updatedAt"
FROM "Location";

DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
