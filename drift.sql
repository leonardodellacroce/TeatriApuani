-- DropIndex
DROP INDEX IF EXISTS "TaskType_name_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Area" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT,
    "enabledInWorkdayPlanning" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Area" ("code", "createdAt", "id", "name", "prefix", "updatedAt") SELECT "code", "createdAt", "id", "name", "prefix", "updatedAt" FROM "Area";
DROP TABLE "Area";
ALTER TABLE "new_Area" RENAME TO "Area";
CREATE UNIQUE INDEX IF NOT EXISTS "Area_prefix_key" ON "Area"("prefix" ASC);
CREATE UNIQUE INDEX IF NOT EXISTS "Area_name_key" ON "Area"("name" ASC);
CREATE UNIQUE INDEX IF NOT EXISTS "Area_code_key" ON "Area"("code" ASC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaskType_name_type_key" ON "TaskType"("name" ASC, "type" ASC);
