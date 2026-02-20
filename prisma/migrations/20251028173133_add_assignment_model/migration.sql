-- AlterTable
ALTER TABLE "TaskType" ADD COLUMN "color" TEXT;

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workdayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_workdayId_fkey" FOREIGN KEY ("workdayId") REFERENCES "Workday" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Assignment_workdayId_idx" ON "Assignment"("workdayId");

-- CreateIndex
CREATE INDEX "Assignment_userId_idx" ON "Assignment"("userId");

-- CreateIndex
CREATE INDEX "Assignment_taskTypeId_idx" ON "Assignment"("taskTypeId");
