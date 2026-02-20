-- CreateTable
CREATE TABLE "DocTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pageSettings" TEXT NOT NULL,
    "blocksJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "DocInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "signedAt" DATETIME,
    "signedBy" TEXT
);

