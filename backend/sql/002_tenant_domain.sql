CREATE SCHEMA IF NOT EXISTS tenant_domain;

CREATE TABLE IF NOT EXISTS tenant_domain.products (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10,2),
  size TEXT,
  material TEXT,
  selling TEXT,
  scene TEXT,
  link TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON tenant_domain.products(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_domain.posts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  date_mmdd TEXT,
  week_tag TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  script TEXT,
  cta TEXT,
  link TEXT,
  trigger_tags TEXT[] NOT NULL DEFAULT '{}',
  metrics_json JSONB NOT NULL DEFAULT '{"reach":0,"saves":0,"dms":0,"clicks":0,"orders":0}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_tenant_id ON tenant_domain.posts(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_domain.agent_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  input_ref JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_ref JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_id ON tenant_domain.agent_runs(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_domain.tenant_onboarding_state (
  tenant_id UUID PRIMARY KEY,
  steps_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_state_tenant_id ON tenant_domain.tenant_onboarding_state(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_domain.alert_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  metric_key TEXT NOT NULL,
  operator TEXT NOT NULL,
  threshold NUMERIC(12,4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant_id ON tenant_domain.alert_rules(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_domain.resource_comments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  mentions_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resource_comments_tenant_resource ON tenant_domain.resource_comments(tenant_id, resource_type, resource_id);

CREATE TABLE IF NOT EXISTS tenant_domain.mention_notifications (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  comment_id UUID NOT NULL,
  mentioned_user_id TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mention_notifications_tenant_user ON tenant_domain.mention_notifications(tenant_id, mentioned_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'fk_mention_notifications_comment_id'
      AND n.nspname = 'tenant_domain'
      AND t.relname = 'mention_notifications'
  ) THEN
    ALTER TABLE tenant_domain.mention_notifications
      ADD CONSTRAINT fk_mention_notifications_comment_id
      FOREIGN KEY (comment_id)
      REFERENCES tenant_domain.resource_comments(id)
      ON DELETE CASCADE;
  END IF;
END $$;
