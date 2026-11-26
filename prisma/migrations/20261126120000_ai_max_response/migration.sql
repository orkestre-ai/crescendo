-- Max Response now applies to chat and explore calls. Thinking counts against
-- it, so the old 4096 default would truncate replies; it was never applied,
-- so rows still on that default move to the new one.
ALTER TABLE "AppSettings" ALTER COLUMN "aiChatMaxTokens" SET DEFAULT 32000;
UPDATE "AppSettings" SET "aiChatMaxTokens" = 32000 WHERE "aiChatMaxTokens" = 4096;
