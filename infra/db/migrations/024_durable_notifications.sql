CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_family text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text,
  entity_id uuid,
  dedupe_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX notifications_user_created_idx
  ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX notifications_user_unread_idx
  ON notifications(user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE TABLE notification_preferences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_family text NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_family)
);

CREATE TABLE notification_push_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  destination text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (provider, destination)
);

CREATE INDEX notification_push_targets_user_active_idx
  ON notification_push_targets(user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  destination text NOT NULL,
  push_target_id uuid REFERENCES notification_push_targets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel, destination)
);

CREATE INDEX notification_deliveries_pending_idx
  ON notification_deliveries(next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed', 'processing');

CREATE FUNCTION enqueue_notification(
  target_user_id uuid,
  target_event_type text,
  target_event_family text,
  target_title text,
  target_body text,
  target_entity_type text,
  target_entity_id uuid,
  target_dedupe_key text,
  target_metadata jsonb,
  requested_channels text[]
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  created_notification_id uuid;
  preference notification_preferences%ROWTYPE;
  target_email text;
  target_phone text;
  target_email_verified_at timestamptz;
  target_phone_verified_at timestamptz;
  push_target record;
BEGIN
  INSERT INTO notifications (
    user_id,
    event_type,
    event_family,
    title,
    body,
    entity_type,
    entity_id,
    dedupe_key,
    metadata
  )
  VALUES (
    target_user_id,
    target_event_type,
    target_event_family,
    target_title,
    target_body,
    target_entity_type,
    target_entity_id,
    target_dedupe_key,
    COALESCE(target_metadata, '{}'::jsonb)
  )
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING id INTO created_notification_id;

  IF created_notification_id IS NULL THEN
    SELECT id INTO created_notification_id
    FROM notifications
    WHERE user_id = target_user_id
      AND dedupe_key = target_dedupe_key;
    RETURN created_notification_id;
  END IF;

  SELECT * INTO preference
  FROM notification_preferences
  WHERE user_id = target_user_id
    AND event_family = target_event_family;

  SELECT email, phone_e164, email_verified_at, phone_verified_at
  INTO target_email, target_phone, target_email_verified_at, target_phone_verified_at
  FROM users
  WHERE id = target_user_id;

  IF 'email' = ANY(requested_channels)
     AND COALESCE(preference.email_enabled, true)
     AND target_email IS NOT NULL
     AND target_email_verified_at IS NOT NULL THEN
    INSERT INTO notification_deliveries (
      notification_id, channel, destination
    ) VALUES (
      created_notification_id, 'email', lower(btrim(target_email))
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF 'sms' = ANY(requested_channels)
     AND COALESCE(preference.sms_enabled, false)
     AND target_phone IS NOT NULL
     AND target_phone_verified_at IS NOT NULL THEN
    INSERT INTO notification_deliveries (
      notification_id, channel, destination
    ) VALUES (
      created_notification_id, 'sms', btrim(target_phone)
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF 'push' = ANY(requested_channels)
     AND COALESCE(preference.push_enabled, true) THEN
    FOR push_target IN
      SELECT id, destination
      FROM notification_push_targets
      WHERE user_id = target_user_id
        AND revoked_at IS NULL
    LOOP
      INSERT INTO notification_deliveries (
        notification_id,
        channel,
        destination,
        push_target_id
      ) VALUES (
        created_notification_id,
        'push',
        push_target.destination,
        push_target.id
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN created_notification_id;
END;
$$;

CREATE FUNCTION notify_message_recipient()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_row conversations%ROWTYPE;
  recipient_id uuid;
BEGIN
  SELECT * INTO conversation_row FROM conversations WHERE id = NEW.conversation_id;
  recipient_id := CASE
    WHEN conversation_row.buyer_id = NEW.sender_id THEN conversation_row.seller_id
    ELSE conversation_row.buyer_id
  END;

  PERFORM enqueue_notification(
    recipient_id,
    'message.received',
    'messages',
    'New message',
    'You received a new marketplace message.',
    'message',
    NEW.id,
    'message:' || NEW.id::text,
    jsonb_build_object('conversationId', NEW.conversation_id, 'senderId', NEW.sender_id),
    ARRAY['email', 'push']
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_enqueue_notification
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION notify_message_recipient();

CREATE FUNCTION notify_offer_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  seller_id uuid;
BEGIN
  SELECT listings.seller_id INTO seller_id
  FROM listings
  WHERE listings.id = NEW.listing_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM enqueue_notification(
      seller_id,
      'offer.received',
      'offers',
      'New offer',
      'A buyer made an offer on your listing.',
      'offer',
      NEW.id,
      'offer:received:' || NEW.id::text,
      jsonb_build_object('listingId', NEW.listing_id, 'buyerId', NEW.buyer_id),
      ARRAY['email', 'push']
    );
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('accepted', 'rejected', 'expired') THEN
    PERFORM enqueue_notification(
      NEW.buyer_id,
      'offer.' || NEW.status::text,
      'offers',
      CASE NEW.status
        WHEN 'accepted' THEN 'Offer accepted'
        WHEN 'rejected' THEN 'Offer declined'
        ELSE 'Offer expired'
      END,
      CASE NEW.status
        WHEN 'accepted' THEN 'Your offer was accepted.'
        WHEN 'rejected' THEN 'Your offer was declined.'
        ELSE 'Your offer expired.'
      END,
      'offer',
      NEW.id,
      'offer:' || NEW.status::text || ':' || NEW.id::text,
      jsonb_build_object('listingId', NEW.listing_id),
      ARRAY['email', 'push']
    );
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    PERFORM enqueue_notification(
      seller_id,
      'offer.cancelled',
      'offers',
      'Offer cancelled',
      'A buyer cancelled an offer on your listing.',
      'offer',
      NEW.id,
      'offer:cancelled:' || NEW.id::text,
      jsonb_build_object('listingId', NEW.listing_id, 'buyerId', NEW.buyer_id),
      ARRAY['push']
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER offers_enqueue_notification
AFTER INSERT OR UPDATE OF status ON offers
FOR EACH ROW
EXECUTE FUNCTION notify_offer_change();

CREATE FUNCTION notify_order_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM enqueue_notification(
      NEW.seller_id,
      'order.created',
      'orders',
      'New order',
      'An order was created for one of your listings.',
      'order',
      NEW.id,
      'order:created:seller:' || NEW.id::text,
      jsonb_build_object('listingId', NEW.listing_id, 'buyerId', NEW.buyer_id),
      ARRAY['email', 'push']
    );
    PERFORM enqueue_notification(
      NEW.buyer_id,
      'order.created',
      'orders',
      'Order created',
      'Your marketplace order was created.',
      'order',
      NEW.id,
      'order:created:buyer:' || NEW.id::text,
      jsonb_build_object('listingId', NEW.listing_id, 'sellerId', NEW.seller_id),
      ARRAY['email', 'push']
    );
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM enqueue_notification(
      NEW.buyer_id,
      'order.' || NEW.status::text,
      'orders',
      'Order updated',
      'Your order status changed to ' || NEW.status::text || '.',
      'order',
      NEW.id,
      'order:' || NEW.status::text || ':buyer:' || NEW.id::text,
      jsonb_build_object('status', NEW.status),
      ARRAY['email', 'push']
    );
    PERFORM enqueue_notification(
      NEW.seller_id,
      'order.' || NEW.status::text,
      'orders',
      'Order updated',
      'An order status changed to ' || NEW.status::text || '.',
      'order',
      NEW.id,
      'order:' || NEW.status::text || ':seller:' || NEW.id::text,
      jsonb_build_object('status', NEW.status),
      ARRAY['email', 'push']
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_enqueue_notification
AFTER INSERT OR UPDATE OF status ON transactions
FOR EACH ROW
EXECUTE FUNCTION notify_order_change();

CREATE FUNCTION notify_payment_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM enqueue_notification(
      NEW.buyer_id,
      'payment.' || NEW.status::text,
      'payments',
      'Payment updated',
      'Your payment status changed to ' || NEW.status::text || '.',
      'payment_intent',
      NEW.id,
      'payment:' || NEW.status::text || ':buyer:' || NEW.id::text,
      jsonb_build_object('status', NEW.status, 'transactionId', NEW.transaction_id),
      ARRAY['email', 'push']
    );
    PERFORM enqueue_notification(
      NEW.seller_id,
      'payment.' || NEW.status::text,
      'payments',
      'Payment updated',
      'Payment status for an order changed to ' || NEW.status::text || '.',
      'payment_intent',
      NEW.id,
      'payment:' || NEW.status::text || ':seller:' || NEW.id::text,
      jsonb_build_object('status', NEW.status, 'transactionId', NEW.transaction_id),
      ARRAY['email', 'push']
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_intents_enqueue_notification
AFTER UPDATE OF status ON payment_intents
FOR EACH ROW
EXECUTE FUNCTION notify_payment_change();

CREATE FUNCTION notify_fulfilment_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_row payment_intents%ROWTYPE;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO payment_row FROM payment_intents WHERE id = NEW.payment_intent_id;

  PERFORM enqueue_notification(
    payment_row.buyer_id,
    'fulfilment.' || NEW.status::text,
    'fulfilment',
    'Fulfilment updated',
    'Your order fulfilment status changed to ' || NEW.status::text || '.',
    'fulfilment',
    NEW.id,
    'fulfilment:' || NEW.status::text || ':buyer:' || NEW.id::text,
    jsonb_build_object('paymentIntentId', NEW.payment_intent_id, 'status', NEW.status),
    ARRAY['email', 'push']
  );
  PERFORM enqueue_notification(
    payment_row.seller_id,
    'fulfilment.' || NEW.status::text,
    'fulfilment',
    'Fulfilment updated',
    'Order fulfilment status changed to ' || NEW.status::text || '.',
    'fulfilment',
    NEW.id,
    'fulfilment:' || NEW.status::text || ':seller:' || NEW.id::text,
    jsonb_build_object('paymentIntentId', NEW.payment_intent_id, 'status', NEW.status),
    ARRAY['email', 'push']
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER fulfilments_enqueue_notification
AFTER UPDATE OF status ON fulfilments
FOR EACH ROW
EXECUTE FUNCTION notify_fulfilment_change();

CREATE FUNCTION notify_dispute_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_row payment_intents%ROWTYPE;
BEGIN
  SELECT * INTO payment_row FROM payment_intents WHERE id = NEW.payment_intent_id;

  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.outcome IS DISTINCT FROM NEW.outcome THEN
    PERFORM enqueue_notification(
      payment_row.buyer_id,
      CASE WHEN TG_OP = 'INSERT' THEN 'dispute.opened' ELSE 'dispute.updated' END,
      'disputes',
      CASE WHEN TG_OP = 'INSERT' THEN 'Dispute opened' ELSE 'Dispute updated' END,
      CASE WHEN TG_OP = 'INSERT' THEN 'A dispute was opened for your order.' ELSE 'A dispute for your order was updated.' END,
      'dispute',
      NEW.id,
      'dispute:' || NEW.status::text || ':' || NEW.outcome::text || ':buyer:' || NEW.id::text,
      jsonb_build_object('status', NEW.status, 'outcome', NEW.outcome, 'paymentIntentId', NEW.payment_intent_id),
      ARRAY['email', 'sms', 'push']
    );
    PERFORM enqueue_notification(
      payment_row.seller_id,
      CASE WHEN TG_OP = 'INSERT' THEN 'dispute.opened' ELSE 'dispute.updated' END,
      'disputes',
      CASE WHEN TG_OP = 'INSERT' THEN 'Dispute opened' ELSE 'Dispute updated' END,
      CASE WHEN TG_OP = 'INSERT' THEN 'A dispute was opened for an order.' ELSE 'A dispute for an order was updated.' END,
      'dispute',
      NEW.id,
      'dispute:' || NEW.status::text || ':' || NEW.outcome::text || ':seller:' || NEW.id::text,
      jsonb_build_object('status', NEW.status, 'outcome', NEW.outcome, 'paymentIntentId', NEW.payment_intent_id),
      ARRAY['email', 'sms', 'push']
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER disputes_enqueue_notification
AFTER INSERT OR UPDATE OF status, outcome ON disputes
FOR EACH ROW
EXECUTE FUNCTION notify_dispute_change();

CREATE FUNCTION notify_account_security_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT (
    NEW.action LIKE 'password.%' OR
    NEW.action LIKE 'session.%' OR
    NEW.action IN (
      'account.contact_verification.completed',
      'account.contact_changed',
      'account.closed'
    )
  ) THEN
    RETURN NEW;
  END IF;

  target_user_id := CASE
    WHEN NEW.entity_type = 'user' THEN NEW.entity_id
    ELSE NEW.actor_user_id
  END;

  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM enqueue_notification(
    target_user_id,
    'account.security',
    'account_security',
    'Account security activity',
    'A security-sensitive change occurred on your account.',
    'audit_log',
    NEW.id,
    'account-security:' || NEW.id::text,
    jsonb_build_object('action', NEW.action),
    ARRAY['email', 'sms', 'push']
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_logs_enqueue_account_security_notification
AFTER INSERT ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION notify_account_security_event();