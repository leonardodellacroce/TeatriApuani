/*
  Warnings:

  - You are about to drop the column `color` on the `TaskType` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
INSERT INTO "new_TaskType" ("createdAt", "description", "id", "name", "type", "updatedAt") SELECT "createdAt", "description", "id", "name", "type", "updatedAt" FROM "TaskType";
DROP TABLE "TaskType";
ALTER TABLE "new_TaskType" RENAME TO "TaskType";
CREATE UNIQUE INDEX "TaskType_name_key" ON "TaskType"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
