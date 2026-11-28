-- Max Response now applies to chat and explore calls. Thinking counts against
-- it, so the old 4096 default would truncate replies; it was never applied,
-- so rows still on that default move to the new one.
ALTER TABLE "AppSettings" ALTER COLUMN "aiChatMaxTokens" SET DEFAULT 32000;
UPDATE "AppSettings" SET "aiChatMaxTokens" = 32000 WHERE "aiChatMaxTokens" = 4096;

-- Max Context is now the input cap per call: Claude compacts at it, other
-- models drop the oldest turns. It was never applied, so rows still on the
-- old 50K default move to the new 150K.
ALTER TABLE "AppSettings" ALTER COLUMN "aiChatMaxContext" SET DEFAULT 150000;
UPDATE "AppSettings" SET "aiChatMaxContext" = 150000 WHERE "aiChatMaxContext" = 50000;

-- Claude compaction summary, stored so reopened conversations keep it.
ALTER TABLE "Message" ADD COLUMN "compaction" TEXT;
