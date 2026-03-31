CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS bridge;

CREATE TABLE IF NOT EXISTS bridge.users (
  id UUID PRIMARY KEY,
  external_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bridge.tenants (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bridge.tenant_memberships (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES bridge.tenants(id),
  user_id UUID NOT NULL REFERENCES bridge.users(id),
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS bridge.audit_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  source_ip TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
