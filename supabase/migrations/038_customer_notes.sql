-- Add notes text column to customer_profiles for admin support annotations
ALTER TABLE customer_profiles 
  ADD COLUMN IF NOT EXISTS notes TEXT;
