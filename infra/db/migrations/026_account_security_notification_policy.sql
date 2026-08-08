CREATE OR REPLACE FUNCTION notify_account_security_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT (
    NEW.action LIKE 'account.password.%' OR
    NEW.action LIKE 'account.session.%' OR
    NEW.action LIKE 'account.sessions.%' OR
    NEW.action IN (
      'account.contact_verification.completed',
      'account.closed',
      'account.deletion.anonymized'
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
