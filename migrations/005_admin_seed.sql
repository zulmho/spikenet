ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE market_moderators ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

INSERT INTO user_roles (user_id, role, granted_by)
SELECT id, role, id
FROM users
CROSS JOIN (VALUES ('admin'), ('support'), ('market_moderator')) AS seed(role)
WHERE id = 1
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO market_moderators (user_id, granted_by)
SELECT user_id, granted_by
FROM user_roles
WHERE role = 'market_moderator'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_roles (user_id, role, granted_by)
SELECT user_id, 'market_moderator', granted_by
FROM market_moderators
ON CONFLICT (user_id, role) DO NOTHING;
