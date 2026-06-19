CREATE TYPE assistant_message_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'en',
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  role assistant_message_role NOT NULL,
  content text NOT NULL,
  safety_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_threads_user_idx ON assistant_threads(user_id, created_at DESC);
CREATE INDEX assistant_messages_thread_idx ON assistant_messages(thread_id, created_at ASC);
