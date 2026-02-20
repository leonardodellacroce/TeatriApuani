-- AlterTable: Aggiungi clientIds agli eventi (JSON array di ID clienti)
ALTER TABLE "Event" ADD COLUMN "clientIds" TEXT;

-- AlterTable: Aggiungi clientId agli assignments (per associare turni a clienti specifici)
ALTER TABLE "Assignment" ADD COLUMN "clientId" TEXT;

-- CreateIndex: Aggiungi indice per clientId negli assignments
CREATE INDEX "Assignment_clientId_idx" ON "Assignment"("clientId");

