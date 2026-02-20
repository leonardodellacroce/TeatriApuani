/*
  Warnings:

  - Added the required column `ragioneSociale` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "street" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "partitaIva" TEXT,
    "codiceFiscale" TEXT,
    "codiceSDI" TEXT,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Company" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
