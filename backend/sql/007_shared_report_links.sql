CREATE TABLE IF NOT EXISTS bridge.shared_report_links (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES bridge.tenants(id),
  token TEXT NOT NULL UNIQUE,
  report_type TEXT NOT NULL,
  scope_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_report_links_tenant_id ON bridge.shared_report_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shared_report_links_expires_at ON bridge.shared_report_links(expires_at);

CREATE TABLE IF NOT EXISTS bridge.user_credentials (
  user_id UUID PRIMARY KEY REFERENCES bridge.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_updated_at
  ON bridge.user_credentials(updated_at DESC);

CREATE TABLE IF NOT EXISTS tenant_domain.brand_strategy_intakes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE,
  brand_name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT 'general',
  target_audience TEXT NOT NULL DEFAULT '',
  business_goal TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '專業親切',
  keywords_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  constraints_text TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_strategy_intakes_tenant_id
  ON tenant_domain.brand_strategy_intakes(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_domain.brand_strategy_plans (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  intake_id UUID NOT NULL REFERENCES tenant_domain.brand_strategy_intakes(id) ON DELETE CASCADE,
  plan_json JSONB NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_strategy_plans_tenant_id
  ON tenant_domain.brand_strategy_plans(tenant_id);

ALTER TABLE tenant_domain.brand_strategy_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.brand_strategy_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_brand_strategy_intakes ON tenant_domain.brand_strategy_intakes;
CREATE POLICY tenant_isolation_brand_strategy_intakes
  ON tenant_domain.brand_strategy_intakes
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_brand_strategy_plans ON tenant_domain.brand_strategy_plans;
CREATE POLICY tenant_isolation_brand_strategy_plans
  ON tenant_domain.brand_strategy_plans
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));
