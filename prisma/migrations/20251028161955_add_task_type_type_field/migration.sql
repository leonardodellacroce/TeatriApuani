/*
  Warnings:

  - You are about to drop the `Assignment` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `type` to the `TaskType` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Assignment_taskTypeId_idx";

-- DropIndex
DROP INDEX "Assignment_userId_idx";

-- DropIndex
DROP INDEX "Assignment_workdayId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Assignment";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TaskType" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "TaskType";
DROP TABLE "TaskType";
ALTER TABLE "new_TaskType" RENAME TO "TaskType";
CREATE UNIQUE INDEX "TaskType_name_key" ON "TaskType"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
