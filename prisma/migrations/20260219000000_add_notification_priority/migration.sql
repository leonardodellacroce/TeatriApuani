-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'MEDIUM';
