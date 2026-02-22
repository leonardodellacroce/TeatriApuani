-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
