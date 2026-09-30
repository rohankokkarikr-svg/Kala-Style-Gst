-- Migration 010: Add images array column to products table
-- Allows products to store multiple product photos / AI generated images

ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[];

COMMENT ON COLUMN products.images IS 'Array of product image URLs including original photo and AI-generated variants';
