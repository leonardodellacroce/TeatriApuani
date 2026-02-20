-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "color" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Location" ("address", "city", "code", "color", "createdAt", "id", "name", "postalCode", "province", "updatedAt") SELECT "address", "city", "code", "color", "createdAt", "id", "name", "postalCode", "province", "updatedAt" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" DATETIME,
    "password" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isResponsabile" BOOLEAN NOT NULL DEFAULT false,
    "isCoordinatore" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT,
    "cognome" TEXT,
    "codiceFiscale" TEXT,
    "areas" TEXT,
    "roles" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("areas", "code", "codiceFiscale", "cognome", "companyId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "isAdmin", "isCoordinatore", "isResponsabile", "isSuperAdmin", "name", "password", "role", "roles", "updatedAt") SELECT "areas", "code", "codiceFiscale", "cognome", "companyId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "isAdmin", "isCoordinatore", "isResponsabile", "isSuperAdmin", "name", "password", "role", "roles", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_code_key" ON "User"("code");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_codiceFiscale_key" ON "User"("codiceFiscale");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
