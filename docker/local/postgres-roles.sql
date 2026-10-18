-- Creates the three roles Supabase provides and plain Postgres does not.
--
-- Migration 20260818150000 grants to `anon`, so on a plain Postgres every
-- migration after it fails unless these roles exist first (G-58). The roles
-- cannot log in and are given nothing here; the migrations decide what they
-- may do. Safe to run on every start.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;
