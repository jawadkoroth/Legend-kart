-- =============================================
-- Migration 002: Profiles & Feedback tables
-- Run in Supabase SQL Editor AFTER 001_initial.sql
-- =============================================

-- ---------- Profiles Table ----------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Service role can do anything (for admin reads)
CREATE POLICY "Service role full access on profiles"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ---------- Feedback Table ----------
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS — only service role can read (admin), anyone can insert via API
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on feedback"
  ON feedback FOR ALL
  USING (auth.role() = 'service_role');

-- Allow anonymous inserts (the API uses service role, but just in case)
CREATE POLICY "Anyone can submit feedback"
  ON feedback FOR INSERT
  WITH CHECK (true);

-- ---------- Add sale_price_paise to products (optional pricing) ----------
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price_paise INTEGER;

-- Index for feedback admin view
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
