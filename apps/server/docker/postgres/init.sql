-- docker/postgres/init.sql
-- Runs once when the PostgreSQL container is first created.

-- Enable UUID generation (used by Prisma's @default(uuid()))
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for fuzzy text search (used in user search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable citext for case-insensitive text fields (optional optimization)
CREATE EXTENSION IF NOT EXISTS citext;
