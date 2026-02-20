-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "hasScheduledBreak" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Assignment" ADD COLUMN "scheduledBreakStartTime" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "scheduledBreakEndTime" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "hasTakenBreak" BOOLEAN;
ALTER TABLE "TimeEntry" ADD COLUMN "actualBreakStartTime" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "actualBreakEndTime" TEXT;

