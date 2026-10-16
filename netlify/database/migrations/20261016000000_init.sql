-- Swipe Pay prototype schema. All balances are DEMO funds stored in pesewas (1 GH₵ = 100 pesewas).

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash      TEXT NOT NULL,
  pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until    TIMESTAMPTZ,
  login_failed_attempts INTEGER NOT NULL DEFAULT 0,
  login_locked_until    TIMESTAMPTZ,
  notifications_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9._]{3,20}$')
);

CREATE TABLE wallets (
  user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance    BIGINT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'GHS',
  is_demo    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Ledger of demo transfers. 'demo_credit' rows record the GH₵1,000 sign-up grant.
CREATE TABLE transactions (
  id            BIGSERIAL PRIMARY KEY,
  reference     TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('transfer', 'demo_credit')),
  sender_id     BIGINT REFERENCES users(id),
  recipient_id  BIGINT NOT NULL REFERENCES users(id),
  amount        BIGINT NOT NULL CHECK (amount > 0),
  fee           BIGINT NOT NULL DEFAULT 0,
  note          TEXT,
  channel       TEXT NOT NULL DEFAULT 'username' CHECK (channel IN ('username', 'nfc', 'qr', 'link', 'system')),
  device_id     BIGINT,
  idempotency_key TEXT,
  status        TEXT NOT NULL DEFAULT 'completed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_transfer CHECK (sender_id IS NULL OR sender_id <> recipient_id)
);
CREATE INDEX transactions_sender_idx ON transactions(sender_id, created_at DESC);
CREATE INDEX transactions_recipient_idx ON transactions(recipient_id, created_at DESC);
CREATE UNIQUE INDEX transactions_idem_idx ON transactions(sender_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NFC tags / Swipe devices linked to a user's payment link.
CREATE TABLE devices (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'nfc_tag' CHECK (kind IN ('nfc_tag', 'swipe_device')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  activated_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX devices_user_idx ON devices(user_id);
