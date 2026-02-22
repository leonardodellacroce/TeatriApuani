-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "scheduledBreaks" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "actualBreaks" TEXT;

-- Migrate existing break data to JSON arrays
UPDATE "Assignment"
SET "scheduledBreaks" = json_build_array(json_build_object('start', "scheduledBreakStartTime", 'end', "scheduledBreakEndTime"))::text
WHERE "hasScheduledBreak" = true AND "scheduledBreakStartTime" IS NOT NULL AND "scheduledBreakEndTime" IS NOT NULL;

UPDATE "TimeEntry"
SET "actualBreaks" = json_build_array(json_build_object('start', "actualBreakStartTime", 'end', "actualBreakEndTime"))::text
WHERE "hasTakenBreak" = true AND "actualBreakStartTime" IS NOT NULL AND "actualBreakEndTime" IS NOT NULL;
