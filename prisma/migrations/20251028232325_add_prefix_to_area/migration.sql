-- AlterTable
ALTER TABLE "Area" ADD COLUMN "prefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Area_prefix_key" ON "Area"("prefix");

