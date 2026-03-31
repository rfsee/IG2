ALTER TABLE tenant_domain.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.tenant_onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.resource_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.mention_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_products ON tenant_domain.products;
CREATE POLICY tenant_isolation_products
  ON tenant_domain.products
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_posts ON tenant_domain.posts;
CREATE POLICY tenant_isolation_posts
  ON tenant_domain.posts
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_agent_runs ON tenant_domain.agent_runs;
CREATE POLICY tenant_isolation_agent_runs
  ON tenant_domain.agent_runs
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_onboarding_state ON tenant_domain.tenant_onboarding_state;
CREATE POLICY tenant_isolation_onboarding_state
  ON tenant_domain.tenant_onboarding_state
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_alert_rules ON tenant_domain.alert_rules;
CREATE POLICY tenant_isolation_alert_rules
  ON tenant_domain.alert_rules
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_resource_comments ON tenant_domain.resource_comments;
CREATE POLICY tenant_isolation_resource_comments
  ON tenant_domain.resource_comments
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_mention_notifications ON tenant_domain.mention_notifications;
CREATE POLICY tenant_isolation_mention_notifications
  ON tenant_domain.mention_notifications
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));
