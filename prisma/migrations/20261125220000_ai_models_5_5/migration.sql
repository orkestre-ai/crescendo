-- New per-surface defaults: Claude Sonnet 5.5 everywhere.
ALTER TABLE "AppSettings" ALTER COLUMN "aiChatModelId" SET DEFAULT 'claude-sonnet-5-5';
ALTER TABLE "AppSettings" ALTER COLUMN "aiExploreModelId" SET DEFAULT 'claude-sonnet-5-5';
ALTER TABLE "AppSettings" ALTER COLUMN "aiRecsModelId" SET DEFAULT 'claude-sonnet-5-5';

-- Move saved selections off the previous built-in models. Haiku 4.5 was the
-- old recommendations default, so it moves to the new default (Sonnet 5.5);
-- other models move to their current tier. Custom model IDs are untouched.
CREATE TEMP TABLE model_remap (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
INSERT INTO model_remap VALUES
  ('claude-haiku-4-5-20251001', 'claude-sonnet-5-5'),
  ('claude-sonnet-4-6', 'claude-sonnet-5-5'),
  ('claude-opus-4-6', 'claude-opus-5-5'),
  ('gpt-4o', 'gpt-6.2-sol'),
  ('gpt-4.1', 'gpt-6.2-sol'),
  ('gpt-4o-mini', 'gpt-6-luna'),
  ('gpt-4.1-mini', 'gpt-6-luna'),
  ('gemini-2.5-pro', 'gemini-4-hydrogen'),
  ('gemini-2.5-flash', 'gemini-3.5-flash-lite');

UPDATE "AppSettings" s SET "aiChatModelId" = m.new_id FROM model_remap m WHERE s."aiChatModelId" = m.old_id;
UPDATE "AppSettings" s SET "aiExploreModelId" = m.new_id FROM model_remap m WHERE s."aiExploreModelId" = m.old_id;
UPDATE "AppSettings" s SET "aiRecsModelId" = m.new_id FROM model_remap m WHERE s."aiRecsModelId" = m.old_id;

DROP TABLE model_remap;
