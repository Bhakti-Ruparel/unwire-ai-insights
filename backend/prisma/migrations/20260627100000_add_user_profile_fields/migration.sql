-- Add profile fields to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" TEXT NOT NULL DEFAULT '';
