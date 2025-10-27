-- Initial schema for FastPrep Admin
-- Run this against your Postgres database

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  perm_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-Role junction
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- User permission overrides
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(255) NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('grant', 'revoke')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_upo_user_id ON user_permission_overrides(user_id);

-- User channel access
CREATE TABLE IF NOT EXISTS user_channel_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);

-- Conversations (threads)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR(255) NOT NULL,
  external_chat_id VARCHAR(255),
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_channel ON conversations(channel_id);
CREATE INDEX idx_conversations_assignee ON conversations(assignee_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC, id);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
  text TEXT,
  object_key VARCHAR(500),
  delivery_status VARCHAR(50) DEFAULT 'pending',
  external_message_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_delivery ON messages(delivery_status);

-- Outbox
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_status_scheduled ON outbox(status, scheduled_at) WHERE status = 'pending';

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Seed: Admin role
INSERT INTO roles (id, name, permissions)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Admin',
  '["users.read", "users.write", "roles.read", "roles.write", "inbox.read_all", "inbox.send_message", "inbox.assign", "audit.read"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Seed: Manager role
INSERT INTO roles (id, name, permissions)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'Manager',
  '["inbox.read_all", "inbox.send_message", "inbox.assign"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Seed: Agent role
INSERT INTO roles (id, name, permissions)
VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'Agent',
  '["inbox.read_assigned", "inbox.read_unassigned", "inbox.send_message"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Seed: Admin user (password: "admin123" — hash below is bcrypt example, replace with real hash)
-- To generate: bcrypt.hashSync('admin123', 10)
INSERT INTO users (id, email, password_hash, full_name)
VALUES (
  'u0000000-0000-0000-0000-000000000001',
  'admin@fastprepusa.com',
  '$2b$10$K8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z.Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8', -- REPLACE THIS
  'Admin User'
)
ON CONFLICT (email) DO NOTHING;

-- Assign Admin role to Admin user
INSERT INTO user_roles (user_id, role_id)
VALUES (
  'u0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;





