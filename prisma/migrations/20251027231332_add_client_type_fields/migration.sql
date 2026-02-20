-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT,
    "ragioneSociale" TEXT,
    "nome" TEXT,
    "cognome" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "partitaIva" TEXT,
    "codiceFiscale" TEXT,
    "codiceSDI" TEXT,
    "codicePA" TEXT,
    "email" TEXT,
    "pec" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Client" ("address", "city", "code", "codiceFiscale", "codiceSDI", "createdAt", "email", "id", "isArchived", "partitaIva", "pec", "postalCode", "province", "ragioneSociale", "updatedAt") SELECT "address", "city", "code", "codiceFiscale", "codiceSDI", "createdAt", "email", "id", "isArchived", "partitaIva", "pec", "postalCode", "province", "ragioneSociale", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
