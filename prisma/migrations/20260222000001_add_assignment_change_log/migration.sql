-- CreateTable
CREATE TABLE "AssignmentChangeLog" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT,
    "workdayId" TEXT NOT NULL,
    "workdayDate" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "AssignmentChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentChangeLog_userId_idx" ON "AssignmentChangeLog"("userId");

-- CreateIndex
CREATE INDEX "AssignmentChangeLog_workdayDate_idx" ON "AssignmentChangeLog"("workdayDate");

-- CreateIndex
CREATE INDEX "AssignmentChangeLog_createdAt_idx" ON "AssignmentChangeLog"("createdAt");
