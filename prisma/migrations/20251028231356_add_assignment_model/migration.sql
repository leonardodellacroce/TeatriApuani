-- DropIndex
DROP INDEX "TaskType_name_type_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workdayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "area" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_workdayId_fkey" FOREIGN KEY ("workdayId") REFERENCES "Workday" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("area", "createdAt", "endTime", "id", "note", "startTime", "taskTypeId", "updatedAt", "userId", "workdayId") SELECT "area", "createdAt", "endTime", "id", "note", "startTime", "taskTypeId", "updatedAt", "userId", "workdayId" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE INDEX "Assignment_workdayId_idx" ON "Assignment"("workdayId");
CREATE INDEX "Assignment_userId_idx" ON "Assignment"("userId");
CREATE INDEX "Assignment_taskTypeId_idx" ON "Assignment"("taskTypeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
