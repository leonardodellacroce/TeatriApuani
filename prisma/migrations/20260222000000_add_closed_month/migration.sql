-- CreateTable
CREATE TABLE "ClosedMonth" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosedMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClosedMonth_year_month_key" ON "ClosedMonth"("year", "month");

-- CreateIndex
CREATE INDEX "ClosedMonth_year_month_idx" ON "ClosedMonth"("year", "month");
