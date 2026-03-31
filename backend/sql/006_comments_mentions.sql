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

ALTER TABLE tenant_domain.resource_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domain.mention_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_resource_comments ON tenant_domain.resource_comments;
CREATE POLICY tenant_isolation_resource_comments
  ON tenant_domain.resource_comments
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_mention_notifications ON tenant_domain.mention_notifications;
CREATE POLICY tenant_isolation_mention_notifications
  ON tenant_domain.mention_notifications
  USING (tenant_id::TEXT = current_setting('app.tenant_id', true));
