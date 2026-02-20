-- Remove advanced locations: DocTemplate, DocInstance, SignEvent
DROP TABLE IF EXISTS "SignEvent" CASCADE;
DROP TABLE IF EXISTS "DocInstance" CASCADE;
DROP TABLE IF EXISTS "DocTemplate" CASCADE;

-- Remove enabledInAdvancedManagement from Location
ALTER TABLE "Location" DROP COLUMN IF EXISTS "enabledInAdvancedManagement";
