-- Create test user for FastPrep Admin
-- Password: "test123" (bcrypt hash below)

-- First, ensure we have a role
INSERT INTO roles (id, name, description, permissions, created_at, updated_at)
VALUES (
  'role-admin-001',
  'Admin',
  'Full system access',
  '{"users":{"view":true,"create":true,"edit":true,"delete":true},"messages":{"view":true,"send":true,"delete":true},"settings":{"view":true,"edit":true}}',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create admin user
-- Email: admin@fastprepusa.com
-- Password: test123
-- bcrypt hash for "test123": $2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
INSERT INTO users (id, email, password_hash, name, role_id, created_at, updated_at)
VALUES (
  'user-admin-001',
  'admin@fastprepusa.com',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Admin User',
  'role-admin-001',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Verify
SELECT id, email, name, role_id FROM users WHERE email = 'admin@fastprepusa.com';






