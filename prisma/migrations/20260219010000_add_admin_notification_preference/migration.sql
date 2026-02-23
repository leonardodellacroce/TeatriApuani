-- CreateTable
CREATE TABLE "AdminNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyIds" TEXT,
    "areaIds" TEXT,
    "workdayIssuesDaysAhead" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminNotificationPreference_userId_key" ON "AdminNotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "AdminNotificationPreference" ADD CONSTRAINT "AdminNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
