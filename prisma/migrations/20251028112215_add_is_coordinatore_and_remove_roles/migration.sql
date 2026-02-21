-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isResponsabile" BOOLEAN NOT NULL DEFAULT false,
    "isCoordinatore" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT,
    "cognome" TEXT,
    "codiceFiscale" TEXT,
    "areas" TEXT,
    "roles" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("areas", "code", "codiceFiscale", "cognome", "companyId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "isAdmin", "isResponsabile", "isSuperAdmin", "name", "password", "role", "roles", "updatedAt") SELECT "areas", "code", "codiceFiscale", "cognome", "companyId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "isAdmin", "isResponsabile", "isSuperAdmin", "name", "password", "role", "roles", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_code_key" ON "User"("code");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_codiceFiscale_key" ON "User"("codiceFiscale");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
