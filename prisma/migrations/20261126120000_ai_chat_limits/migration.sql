-- Max Response now applies to chat and explore calls. Thinking counts against
-- it, so the old 4096 default would truncate replies; it was never applied,
-- so rows still on that default move to the new one.
ALTER TABLE "AppSettings" ALTER COLUMN "aiChatMaxTokens" SET DEFAULT 32000;
UPDATE "AppSettings" SET "aiChatMaxTokens" = 32000 WHERE "aiChatMaxTokens" = 4096;

-- Max Context is now a cost warning in chat. 100K is where Claude Haiku 5.5
-- input pricing rises; rows still on the old 50K default move up.
ALTER TABLE "AppSettings" ALTER COLUMN "aiChatMaxContext" SET DEFAULT 100000;
UPDATE "AppSettings" SET "aiChatMaxContext" = 100000 WHERE "aiChatMaxContext" = 50000;
