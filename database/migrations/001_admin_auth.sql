BEGIN;

CREATE TYPE admin_user_status AS ENUM ('active', 'disabled', 'locked');

CREATE TABLE admin_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(150) NOT NULL,
  password_hash TEXT NOT NULL,
  status admin_user_status NOT NULL DEFAULT 'active',
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TIMESTAMP NULL,
  last_login_at TIMESTAMP NULL,
  password_changed_at TIMESTAMP NULL,
  created_by BIGINT NULL REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_admin_users_username_ci ON admin_users (LOWER(username));
CREATE UNIQUE INDEX uq_admin_users_email_ci ON admin_users (LOWER(email));
CREATE INDEX ix_admin_users_status ON admin_users (status);

CREATE TABLE admin_roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_permissions (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(150) NOT NULL UNIQUE,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT NULL,
  UNIQUE (resource, action)
);

CREATE TABLE admin_user_roles (
  user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX ix_admin_user_roles_role_id ON admin_user_roles (role_id);

CREATE TABLE admin_role_permissions (
  role_id BIGINT NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES admin_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX ix_admin_role_permissions_permission_id
  ON admin_role_permissions (permission_id);

CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL
);

CREATE INDEX ix_admin_sessions_user_active
  ON admin_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX ix_admin_sessions_expiry ON admin_sessions (expires_at);

INSERT INTO admin_permissions (code, resource, action, description) VALUES
  ('dashboard.read', 'dashboard', 'read', 'View the administration dashboard'),
  ('customers.read', 'customers', 'read', 'View customer and KYC records'),
  ('wallets.read', 'wallets', 'read', 'View wallets and balances'),
  ('transactions.read', 'transactions', 'read', 'View transactions and ledger entries'),
  ('admin_users.read', 'admin_users', 'read', 'View admin users'),
  ('admin_users.manage', 'admin_users', 'manage', 'Create and manage admin users'),
  ('admin_roles.read', 'admin_roles', 'read', 'View roles and permissions'),
  ('admin_roles.manage', 'admin_roles', 'manage', 'Manage roles and permissions'),
  ('audit.read', 'audit', 'read', 'View administrative audit records');

INSERT INTO admin_roles (code, name, description, is_system)
VALUES ('super_admin', 'Super administrator', 'Full administration access', TRUE);

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM admin_roles role
CROSS JOIN admin_permissions permission
WHERE role.code = 'super_admin';

COMMIT;
