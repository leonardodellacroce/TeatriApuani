/*
  Warnings:

  - You are about to drop the column `name` on the `Company` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
INSERT INTO "new_Company" ("address", "city", "codiceFiscale", "codiceSDI", "createdAt", "email", "id", "partitaIva", "pec", "postalCode", "province", "ragioneSociale", "updatedAt") SELECT "address", "city", "codiceFiscale", "codiceSDI", "createdAt", "email", "id", "partitaIva", "pec", "postalCode", "province", "ragioneSociale", "updatedAt" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
