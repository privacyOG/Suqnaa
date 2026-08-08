CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX user_blocks_blocked_created_idx
  ON user_blocks(blocked_id, created_at DESC);

CREATE TABLE conversation_mutes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX conversation_mutes_conversation_idx
  ON conversation_mutes(conversation_id, user_id);

ALTER TABLE messages
  ADD COLUMN content_fingerprint text;

UPDATE messages
SET content_fingerprint = encode(
  digest(lower(regexp_replace(trim(body), '\s+', ' ', 'g')), 'sha256'),
  'hex'
)
WHERE content_fingerprint IS NULL;

CREATE INDEX messages_sender_fingerprint_created_idx
  ON messages(sender_id, content_fingerprint, created_at DESC)
  WHERE content_fingerprint IS NOT NULL;

ALTER TABLE reports
  ADD COLUMN conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN message_id uuid REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE reports
  ADD CONSTRAINT reports_message_context_check
  CHECK (message_id IS NULL OR conversation_id IS NOT NULL);

CREATE INDEX reports_conversation_created_idx
  ON reports(conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX reports_message_idx
  ON reports(message_id)
  WHERE message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_message_participant_and_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_row conversations%ROWTYPE;
  counterpart_id uuid;
BEGIN
  SELECT *
  INTO conversation_row
  FROM conversations
  WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found for message';
  END IF;

  IF NEW.sender_id = conversation_row.buyer_id THEN
    counterpart_id := conversation_row.seller_id;
  ELSIF NEW.sender_id = conversation_row.seller_id THEN
    counterpart_id := conversation_row.buyer_id;
  ELSE
    RAISE EXCEPTION 'Message sender is not a conversation participant';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM user_blocks
    WHERE (blocker_id = NEW.sender_id AND blocked_id = counterpart_id)
       OR (blocker_id = counterpart_id AND blocked_id = NEW.sender_id)
  ) THEN
    RAISE EXCEPTION 'Messaging unavailable while a participant block is active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_participant_block_guard ON messages;
CREATE TRIGGER messages_participant_block_guard
BEFORE INSERT OR UPDATE OF conversation_id, sender_id
ON messages
FOR EACH ROW
EXECUTE FUNCTION enforce_message_participant_and_block();

CREATE OR REPLACE FUNCTION enforce_message_report_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  message_conversation_id uuid;
  message_sender_id uuid;
  conversation_buyer_id uuid;
  conversation_seller_id uuid;
BEGIN
  IF NEW.message_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.conversation_id, m.sender_id, c.buyer_id, c.seller_id
  INTO message_conversation_id, message_sender_id, conversation_buyer_id, conversation_seller_id
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE m.id = NEW.message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reported message not found';
  END IF;

  IF NEW.conversation_id IS DISTINCT FROM message_conversation_id THEN
    RAISE EXCEPTION 'Reported message does not belong to conversation';
  END IF;

  IF NEW.reporter_id <> conversation_buyer_id
     AND NEW.reporter_id <> conversation_seller_id THEN
    RAISE EXCEPTION 'Message reporter is not a conversation participant';
  END IF;

  IF NEW.reporter_id = message_sender_id THEN
    RAISE EXCEPTION 'A user cannot report their own message';
  END IF;

  IF NEW.reported_user_id IS DISTINCT FROM message_sender_id THEN
    RAISE EXCEPTION 'Reported user must be the message sender';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_message_context_guard ON reports;
CREATE TRIGGER reports_message_context_guard
BEFORE INSERT OR UPDATE OF reporter_id, reported_user_id, conversation_id, message_id
ON reports
FOR EACH ROW
EXECUTE FUNCTION enforce_message_report_context();
