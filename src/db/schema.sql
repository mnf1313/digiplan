-- DigiPlan Database Schema
-- Neon Serverless Postgres

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Users table — account management
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  avatar_url    TEXT DEFAULT '',
  subscription_tier TEXT NOT NULL DEFAULT 'free'
                    CHECK (subscription_tier IN ('free', 'pro')),
  stripe_customer_id TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ============================================================
-- Sessions table — auth session management
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);

-- ============================================================
-- Calendar connections — linked external calendar services
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'notion')),
  access_token    TEXT NOT NULL DEFAULT '',
  refresh_token   TEXT NOT NULL DEFAULT '',
  token_expires_at TIMESTAMPTZ,
  calendar_id     TEXT NOT NULL DEFAULT '',
  calendar_name   TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_user_id ON calendar_connections (user_id);

-- ============================================================
-- Sync history — tracks each sync operation
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id   UUID REFERENCES calendar_connections(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  images_uploaded INT NOT NULL DEFAULT 0,
  events_parsed   INT NOT NULL DEFAULT 0,
  events_synced   INT NOT NULL DEFAULT 0,
  error_message   TEXT DEFAULT '',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON sync_history (user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON sync_history (status);

-- ============================================================
-- Parsed events — events extracted from planner photos
-- ============================================================
CREATE TABLE IF NOT EXISTS parsed_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_id           UUID REFERENCES sync_history(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT DEFAULT '',
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ,
  is_all_day        BOOLEAN NOT NULL DEFAULT false,
  location          TEXT DEFAULT '',
  recurrence_rule   TEXT DEFAULT '',
  source_image_url  TEXT DEFAULT '',
  confidence_score  REAL DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  calendar_event_id TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'synced', 'failed', 'dismissed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parsed_events_user_id ON parsed_events (user_id);
CREATE INDEX IF NOT EXISTS idx_parsed_events_sync_id ON parsed_events (sync_id);
CREATE INDEX IF NOT EXISTS idx_parsed_events_status ON parsed_events (status);