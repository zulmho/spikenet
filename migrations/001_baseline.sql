CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  current_status TEXT NOT NULL DEFAULT 'offline',
  user_tag INTEGER NOT NULL DEFAULT 1000,
  spycat_karma INTEGER NOT NULL DEFAULT 0,
  color_accent TEXT NOT NULL DEFAULT '#f3a51a',
  compact_grid BOOLEAN NOT NULL DEFAULT FALSE,
  spike_sound BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  shop_name TEXT NOT NULL DEFAULT 'Steam',
  product_url TEXT NOT NULL UNIQUE,
  current_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  old_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  review_score_desc TEXT NOT NULL DEFAULT '',
  positive_percent INTEGER NOT NULL DEFAULT 0,
  genres TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  gameplay_hours INTEGER NOT NULL DEFAULT 15,
  is_coop BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notification_type TEXT NOT NULL DEFAULT 'target',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS direct_chats (
  id SERIAL PRIMARY KEY,
  user_one_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_two_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned_message_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_one_id, user_two_id),
  CHECK (user_one_id <> user_two_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES direct_chats(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE direct_chats ADD COLUMN IF NOT EXISTS pinned_message_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'direct_chats_pinned_message_fk'
  ) THEN
    ALTER TABLE direct_chats
      ADD CONSTRAINT direct_chats_pinned_message_fk
      FOREIGN KEY (pinned_message_id) REFERENCES direct_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS party_rooms (
  id SERIAL PRIMARY KEY,
  room_token TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id INTEGER NOT NULL REFERENCES party_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES party_rooms(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  reply_author TEXT,
  reply_content TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_votes (
  room_id INTEGER NOT NULL REFERENCES party_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_url ON products(product_url);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, recorded_at DESC);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'friendships' AND column_name = 'requester_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'friendships' AND column_name = 'addressee_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'friendships' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id, status);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'friendships' AND column_name = 'friend_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id, status);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_direct_messages_chat ON direct_messages(chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at ASC);
