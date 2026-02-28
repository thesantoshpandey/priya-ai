-- ============================================
-- PRIYA AI - Database Schema
-- ============================================
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- Go to: SQL Editor > New Query > Paste this > Run

-- 1. USERS TABLE
-- Stores every student who messages the bot
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT UNIQUE,
  telegram_chat_id TEXT UNIQUE,
  telegram_username TEXT,
  name TEXT,
  email TEXT,
  
  -- Academic info (gathered through conversation)
  class TEXT,              -- '11', '12', 'dropper'
  neet_year TEXT,          -- '2026', '2027'
  weak_subjects TEXT[],    -- ['organic_chemistry', 'genetics']
  coaching TEXT,           -- 'self_study', 'allen', 'aakash', etc.
  
  -- Age & compliance
  date_of_birth DATE,
  is_minor BOOLEAN DEFAULT FALSE,
  parental_consent BOOLEAN DEFAULT FALSE,
  parent_phone TEXT,
  consent_given_at TIMESTAMPTZ,
  
  -- Engagement tracking
  message_count INTEGER DEFAULT 0,
  first_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  voice_call_prompted BOOLEAN DEFAULT FALSE,
  
  -- Monetization
  tier TEXT DEFAULT 'free',   -- 'free', 'trial', 'paid'
  voice_credits INTEGER DEFAULT 0,
  
  -- Platform
  platform TEXT DEFAULT 'telegram',  -- 'telegram', 'whatsapp', 'web'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CHATS TABLE
-- Every single message, both user and AI
CREATE TABLE IF NOT EXISTS chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,         -- 'user' or 'assistant'
  content TEXT NOT NULL,
  platform TEXT DEFAULT 'telegram',
  
  -- Metadata
  tokens_used INTEGER,
  model_used TEXT,
  response_time_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CONSENT LOG TABLE
-- Audit trail for parental consent (DPDPA compliance)
CREATE TABLE IF NOT EXISTS consent_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_phone TEXT NOT NULL,
  otp_sent_at TIMESTAMPTZ,
  otp_verified_at TIMESTAMPTZ,
  consent_text TEXT NOT NULL,  -- Exact text shown to parent
  ip_address TEXT,
  status TEXT DEFAULT 'pending',  -- 'pending', 'verified', 'expired'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ADMIN ACCESS LOG
-- Track every time admin reads chats (accountability)
CREATE TABLE IF NOT EXISTS admin_access_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_identifier TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'view_user', 'view_chats', 'export'
  target_user_id UUID REFERENCES users(id),
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at);
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_last_message ON users(last_message_at DESC);

-- 6. AUTO-UPDATE updated_at on users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 7. ROW LEVEL SECURITY (RLS)
-- Enable RLS but allow service role full access
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_access_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (this is what our server uses)
CREATE POLICY "Service role full access on users" ON users
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on chats" ON chats
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on consent_log" ON consent_log
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on admin_access_log" ON admin_access_log
  FOR ALL USING (auth.role() = 'service_role');
