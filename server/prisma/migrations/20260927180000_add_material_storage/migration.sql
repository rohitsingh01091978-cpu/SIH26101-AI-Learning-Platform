-- Persistent file storage support. Purely additive/relaxing - no data is modified or removed:
--   * three new NULLable columns describing where a stored file lives (existing rows stay NULL)
--   * "filePath" (the legacy absolute path on the old ephemeral disk) becomes optional so new uploads,
--     which are stored under a server-generated key instead, do not need it. Existing values are kept as-is.
ALTER TABLE "learning_materials" ADD COLUMN "storageKey" TEXT,
ADD COLUMN "storageProvider" TEXT,
ADD COLUMN "sha256" TEXT;

ALTER TABLE "learning_materials" ALTER COLUMN "filePath" DROP NOT NULL;
