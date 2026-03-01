-- CreateTable
CREATE TABLE "FreeHoursEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "actualBreaks" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "convertedToAssignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeHoursEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeHoursEntry_userId_idx" ON "FreeHoursEntry"("userId");

-- CreateIndex
CREATE INDEX "FreeHoursEntry_companyId_idx" ON "FreeHoursEntry"("companyId");

-- CreateIndex
CREATE INDEX "FreeHoursEntry_status_idx" ON "FreeHoursEntry"("status");

-- CreateIndex
CREATE INDEX "FreeHoursEntry_date_idx" ON "FreeHoursEntry"("date");

-- AddForeignKey
ALTER TABLE "FreeHoursEntry" ADD CONSTRAINT "FreeHoursEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeHoursEntry" ADD CONSTRAINT "FreeHoursEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
