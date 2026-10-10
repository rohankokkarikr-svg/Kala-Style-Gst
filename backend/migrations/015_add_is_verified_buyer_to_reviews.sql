-- 015_add_is_verified_buyer_to_reviews.sql
-- Add is_verified_buyer column to reviews table if it does not already exist

ALTER TABLE IF EXISTS reviews ADD COLUMN IF NOT EXISTS is_verified_buyer BOOLEAN DEFAULT false;
