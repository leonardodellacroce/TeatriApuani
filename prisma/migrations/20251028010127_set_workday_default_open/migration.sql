-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "eventId" TEXT NOT NULL,
    "locationId" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openedByUserId" TEXT,
    "closedByUserId" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workday_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Workday_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Workday" ("closedByUserId", "createdAt", "date", "endTime", "eventId", "id", "isOpen", "locationId", "openedByUserId", "startTime") SELECT "closedByUserId", "createdAt", "date", "endTime", "eventId", "id", "isOpen", "locationId", "openedByUserId", "startTime" FROM "Workday";
DROP TABLE "Workday";
ALTER TABLE "new_Workday" RENAME TO "Workday";
CREATE INDEX "Workday_eventId_idx" ON "Workday"("eventId");
CREATE INDEX "Workday_locationId_idx" ON "Workday"("locationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
