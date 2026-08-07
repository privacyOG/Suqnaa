CREATE TABLE admin_permissions (
  permission_key text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (permission_key ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  CHECK (length(description) BETWEEN 1 AND 300)
);

CREATE TABLE admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role_key ~ '^[a-z][a-z0-9_-]{2,49}$'),
  CHECK (length(display_name) BETWEEN 1 AND 100),
  CHECK (length(description) BETWEEN 1 AND 500)
);

CREATE TABLE admin_role_permissions (
  role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES admin_permissions(permission_key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE admin_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
  granted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoke_reason text,
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)),
  CHECK (revoke_reason IS NULL OR length(revoke_reason) <= 500)
);

CREATE UNIQUE INDEX admin_role_assignments_active_unique
  ON admin_role_assignments(user_id, role_id)
  WHERE revoked_at IS NULL;

CREATE INDEX admin_role_assignments_user_active_idx
  ON admin_role_assignments(user_id, granted_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX admin_role_assignments_role_active_idx
  ON admin_role_assignments(role_id, granted_at DESC)
  WHERE revoked_at IS NULL;

INSERT INTO admin_permissions(permission_key, description) VALUES
  ('operations.access', 'Open the protected operations workspace.'),
  ('moderation.queue.read', 'Read marketplace report queues.'),
  ('moderation.queue.resolve', 'Resolve marketplace report queue items without changing account or listing state.'),
  ('moderation.listing.manage', 'Change listing state from a moderation workflow.'),
  ('moderation.account.manage', 'Suspend or reactivate accounts from a moderation workflow.'),
  ('verification.read', 'Read seller and business verification review records.'),
  ('verification.review', 'Approve or reject seller and business verification checks.'),
  ('audit.read', 'Read protected operations audit records.'),
  ('roles.read', 'Read administrative roles, permissions, and active assignments.'),
  ('roles.manage', 'Grant and revoke administrative roles subject to anti-escalation controls.');

INSERT INTO admin_roles(role_key, display_name, description) VALUES
  ('platform_admin', 'Platform administrator', 'Full administrative control, including protected role management.'),
  ('trust_reviewer', 'Trust reviewer', 'Seller and business verification review only.'),
  ('moderation_reviewer', 'Moderation reviewer', 'Read and resolve moderation queue items without account or listing state changes.'),
  ('moderation_manager', 'Moderation manager', 'Moderation review plus listing and account state changes.'),
  ('audit_reviewer', 'Audit reviewer', 'Read-only access to protected operations audit history.');

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT roles.id, permissions.permission_key
FROM admin_roles roles
JOIN admin_permissions permissions ON permissions.permission_key IN (
  'operations.access',
  'moderation.queue.read',
  'moderation.queue.resolve',
  'moderation.listing.manage',
  'moderation.account.manage',
  'verification.read',
  'verification.review',
  'audit.read',
  'roles.read',
  'roles.manage'
)
WHERE roles.role_key = 'platform_admin';

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT roles.id, permissions.permission_key
FROM admin_roles roles
JOIN admin_permissions permissions ON permissions.permission_key IN (
  'operations.access', 'verification.read', 'verification.review'
)
WHERE roles.role_key = 'trust_reviewer';

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT roles.id, permissions.permission_key
FROM admin_roles roles
JOIN admin_permissions permissions ON permissions.permission_key IN (
  'operations.access', 'moderation.queue.read', 'moderation.queue.resolve'
)
WHERE roles.role_key = 'moderation_reviewer';

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT roles.id, permissions.permission_key
FROM admin_roles roles
JOIN admin_permissions permissions ON permissions.permission_key IN (
  'operations.access',
  'moderation.queue.read',
  'moderation.queue.resolve',
  'moderation.listing.manage',
  'moderation.account.manage'
)
WHERE roles.role_key = 'moderation_manager';

INSERT INTO admin_role_permissions(role_id, permission_key)
SELECT roles.id, permissions.permission_key
FROM admin_roles roles
JOIN admin_permissions permissions ON permissions.permission_key IN (
  'operations.access', 'audit.read'
)
WHERE roles.role_key = 'audit_reviewer';
