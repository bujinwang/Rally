-- BadmintonGroup MVP - Database Initialization
-- This script runs on first database creation
-- Creates extensions and initial seed data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- Create read-only user for analytics (optional)
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'badminton_readonly') THEN
--     CREATE ROLE badminton_readonly WITH LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOCREATEDB NOCREATEROLE;
--     GRANT CONNECT ON DATABASE badminton_prod TO badminton_readonly;
--     GRANT USAGE ON SCHEMA public TO badminton_readonly;
--     GRANT SELECT ON ALL TABLES IN SCHEMA public TO badminton_readonly;
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO badminton_readonly;
--   END IF;
-- END $$;

-- Set session-level configuration
SET statement_timeout = '30s';
SET lock_timeout = '10s';
SET idle_in_transaction_session_timeout = '60s';

-- Log initialization
DO $$
BEGIN
  RAISE NOTICE 'BadmintonGroup database initialized successfully at %', now();
END $$;
