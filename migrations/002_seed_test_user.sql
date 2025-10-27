-- Seed test user for FastPrep Admin MVP
-- Password: "test123"

-- Create admin role
INSERT INTO roles (name, permissions)
VALUES (
  'Admin',
  '{"users": {"view": true, "create": true, "edit": true, "delete": true}, "messages": {"view": true, "send": true, "delete": true}, "settings": {"view": true, "edit": true}}'::jsonb
)
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions
RETURNING id AS admin_role_id \gset

-- Create test admin user
-- Email: admin@fastprepusa.com
-- Password: test123 (we'll skip bcrypt for MVP, just store plain text - NOT FOR PRODUCTION!)
INSERT INTO users (email, password_hash, full_name)
VALUES (
  'admin@fastprepusa.com',
  'test123',
  'Admin User'
)
ON CONFLICT (email) DO NOTHING
RETURNING id AS admin_user_id \gset

-- Assign admin role to user
INSERT INTO user_roles (user_id, role_id)
SELECT 
  (SELECT id FROM users WHERE email = 'admin@fastprepusa.com'),
  (SELECT id FROM roles WHERE name = 'Admin')
ON CONFLICT DO NOTHING;

-- Verify
SELECT u.id, u.email, u.full_name, r.name as role
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
WHERE u.email = 'admin@fastprepusa.com';





