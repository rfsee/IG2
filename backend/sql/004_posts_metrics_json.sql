ALTER TABLE tenant_domain.posts
  ADD COLUMN IF NOT EXISTS metrics_json JSONB NOT NULL DEFAULT '{"reach":0,"saves":0,"dms":0,"clicks":0,"orders":0}'::JSONB;

CREATE TABLE IF NOT EXISTS tenant_domain.tenant_onboarding_state (
  tenant_id UUID PRIMARY KEY,
  steps_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_state_tenant_id ON tenant_domain.tenant_onboarding_state(tenant_id);

ALTER TABLE tenant_domain.tenant_onboarding_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_onboarding_state ON tenant_domain.tenant_onboarding_state;
CREATE POLICY tenant_isolation_onboarding_state
  ON tenant_domain.tenant_onboarding_state
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

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

ALTER TABLE tenant_domain.alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_alert_rules ON tenant_domain.alert_rules;
CREATE POLICY tenant_isolation_alert_rules
  ON tenant_domain.alert_rules
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));
