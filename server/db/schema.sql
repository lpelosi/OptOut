-- OptOut schema. Idempotent — safe to re-run.
-- Apply with: npm run migrate  (or: psql "$DATABASE_URL" -f db/schema.sql)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";    -- case-insensitive email

CREATE TABLE IF NOT EXISTS users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           citext UNIQUE NOT NULL,
    display_name    text NOT NULL,
    password_hash   text,
    apple_user_id   text UNIQUE,
    google_user_id  text UNIQUE,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES users(id) ON DELETE CASCADE,  -- null = built-in default
    name            text NOT NULL,
    icon            text NOT NULL DEFAULT 'tag',
    color           text NOT NULL DEFAULT '#4F8A8B',
    default_amount  numeric(10,2),
    sort_order      int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

CREATE TABLE IF NOT EXISTS jars (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            text NOT NULL,
    icon            text NOT NULL DEFAULT 'piggy-bank',
    color           text NOT NULL DEFAULT '#4F8A8B',
    target_amount   numeric(10,2) NOT NULL CHECK (target_amount > 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_jars_user ON jars(user_id);

CREATE TABLE IF NOT EXISTS entries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
    jar_id          uuid REFERENCES jars(id) ON DELETE SET NULL,
    amount          numeric(10,2) NOT NULL CHECK (amount >= 0),
    -- 'saved' = money opted out of spending; 'spent' = money actually spent (e.g. scanned receipt)
    direction       text NOT NULL DEFAULT 'saved' CHECK (direction IN ('saved', 'spent')),
    note            text,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- Idempotent add for databases created before `direction` existed.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'saved';
DO $$ BEGIN
    ALTER TABLE entries ADD CONSTRAINT entries_direction_check CHECK (direction IN ('saved', 'spent'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_entries_user_occurred ON entries(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_jar ON entries(jar_id);
CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash      text PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS login_codes (
    email           citext NOT NULL,
    code_hash       text NOT NULL,
    expires_at      timestamptz NOT NULL,
    attempts        int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email)
);

-- Built-in categories (user_id NULL). Inserted once.
INSERT INTO categories (user_id, name, icon, color, default_amount, sort_order)
SELECT * FROM (VALUES
    (NULL::uuid, 'Dining out',     'utensils',     '#E07A5F', 18.00, 1),
    (NULL::uuid, 'Coffee',         'coffee',       '#B5651D',  5.00, 2),
    (NULL::uuid, 'Costume/Event',  'sparkles',     '#9B5DE5', 40.00, 3),
    (NULL::uuid, 'Impulse buy',    'shopping-bag', '#F4A261', 25.00, 4),
    (NULL::uuid, 'Subscription',   'repeat',       '#2A9D8F', 12.00, 5),
    (NULL::uuid, 'Rideshare',      'car',          '#264653', 15.00, 6),
    (NULL::uuid, 'Snacks',         'cookie',       '#E9C46A',  4.00, 7),
    (NULL::uuid, 'Other',          'tag',          '#6C757D',  NULL, 8)
) AS v(user_id, name, icon, color, default_amount, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL);
