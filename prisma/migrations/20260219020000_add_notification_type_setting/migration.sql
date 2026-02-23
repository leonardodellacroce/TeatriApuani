-- CreateTable
CREATE TABLE "NotificationTypeSetting" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "showInDashboardModal" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTypeSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTypeSetting_type_key" ON "NotificationTypeSetting"("type");
