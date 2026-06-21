ALTER TABLE conversations
  ADD COLUMN participant_key text;

UPDATE conversations
SET participant_key = LEAST(buyer_id::text, seller_id::text)
  || ':' || GREATEST(buyer_id::text, seller_id::text)
WHERE participant_key IS NULL;

ALTER TABLE conversations
  ALTER COLUMN participant_key SET NOT NULL;

CREATE UNIQUE INDEX conversations_participant_listing_unique
  ON conversations (
    participant_key,
    COALESCE(listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE messages
  ADD COLUMN client_message_id uuid,
  ADD COLUMN status text NOT NULL DEFAULT 'sent',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE messages
  ADD CONSTRAINT messages_status_check
  CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'removed'));

CREATE UNIQUE INDEX messages_sender_client_message_unique
  ON messages(sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX messages_sender_created_idx
  ON messages(sender_id, created_at DESC);
