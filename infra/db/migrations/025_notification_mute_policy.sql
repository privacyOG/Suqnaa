CREATE OR REPLACE FUNCTION notify_message_recipient()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_row conversations%ROWTYPE;
  recipient_id uuid;
  conversation_is_muted boolean;
BEGIN
  SELECT * INTO conversation_row
  FROM conversations
  WHERE id = NEW.conversation_id;

  recipient_id := CASE
    WHEN conversation_row.buyer_id = NEW.sender_id THEN conversation_row.seller_id
    ELSE conversation_row.buyer_id
  END;

  SELECT EXISTS (
    SELECT 1
    FROM conversation_mutes
    WHERE user_id = recipient_id
      AND conversation_id = NEW.conversation_id
  ) INTO conversation_is_muted;

  PERFORM enqueue_notification(
    recipient_id,
    'message.received',
    'messages',
    'New message',
    'You received a new marketplace message.',
    'message',
    NEW.id,
    'message:' || NEW.id::text,
    jsonb_build_object(
      'conversationId', NEW.conversation_id,
      'senderId', NEW.sender_id,
      'muted', conversation_is_muted
    ),
    CASE
      WHEN conversation_is_muted THEN ARRAY[]::text[]
      ELSE ARRAY['email', 'push']::text[]
    END
  );
  RETURN NEW;
END;
$$;
