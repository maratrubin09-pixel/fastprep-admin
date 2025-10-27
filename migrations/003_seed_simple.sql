-- Simple seed for FastPrep Admin
-- Password: test123 (plain text for MVP)

-- Create admin role
INSERT INTO roles (name, permissions)
VALUES (
  'Admin',
  '{"users": {"view": true, "create": true, "edit": true, "delete": true}, "messages": {"view": true, "send": true, "delete": true}, "settings": {"view": true, "edit": true}}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Create test admin user
INSERT INTO users (email, password_hash, full_name)
VALUES (
  'admin@fastprepusa.com',
  'test123',
  'Admin User'
)
ON CONFLICT (email) DO NOTHING;

-- Assign admin role to user
INSERT INTO user_roles (user_id, role_id)
SELECT 
  u.id,
  r.id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'admin@fastprepusa.com'
  AND r.name = 'Admin'
ON CONFLICT DO NOTHING;

-- Verify
SELECT u.id, u.email, u.full_name, r.name as role
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
WHERE u.email = 'admin@fastprepusa.com';





