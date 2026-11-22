-- Separate CHAT_DB only. NULL marks manual/imported topics.
ALTER TABLE topics ADD COLUMN auto_revision INTEGER;
