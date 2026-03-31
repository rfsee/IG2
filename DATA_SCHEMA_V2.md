# IG Auto Growth OS - Multi-tenant Data Schema v3

## 1) Tenant and Access Core

### tenants
- `id` uuid (PK)
- `slug` string (unique)
- `name` string
- `plan_tier` enum: starter | growth | enterprise
- `status` enum: active | suspended | archived
- `created_at` timestamp
- `updated_at` timestamp

### users
- `id` uuid (PK)
- `email` string (unique)
- `display_name` string
- `status` enum: active | disabled
- `created_at` timestamp
- `updated_at` timestamp

### tenant_memberships
- `id` uuid (PK)
- `tenant_id` uuid (FK -> tenants.id)
- `user_id` uuid (FK -> users.id)
- `role` enum: owner | manager | editor | viewer
- `created_at` timestamp
- `updated_at` timestamp
- Unique index: (`tenant_id`, `user_id`)

## 2) Domain Entities (Tenant-scoped)

### products
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `name` string
- `price` number
- `size` string
- `material` string
- `selling` string
- `scene` string
- `link` string
- `status` enum: active | paused | archived
- `created_at` timestamp
- `updated_at` timestamp

### posts
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `date` string (MM/DD)
- `week` enum: W1..W4
- `type` enum: reels | feed | story
- `status` enum: 草稿 | 待拍 | 待上架 | 已發佈
- `title` string
- `script` string
- `cta` string
- `link` string
- `trigger_tags` string[]
- `content_agent_version` string
- `created_at` timestamp
- `updated_at` timestamp

### post_assets
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `post_id` uuid (FK -> posts.id)
- `asset_type` enum: cover | image | video
- `prompt_block_index` number
- `nano_prompt` string
- `asset_url` string
- `created_at` timestamp
- `updated_at` timestamp

### dm_threads
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `source_post_id` uuid (FK -> posts.id)
- `user_hash` string
- `intent` enum: price | size | material | shipping | style | other
- `stage` enum: new | qualified | offer_sent | closed
- `recommended_products` string[]
- `dm_script` string
- `last_action_at` timestamp
- `created_at` timestamp
- `updated_at` timestamp

### post_metrics_daily
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `post_id` uuid (FK -> posts.id)
- `date` string (YYYY-MM-DD)
- `reach` number
- `impressions` number
- `saves` number
- `shares` number
- `likes` number
- `comments` number
- `profile_visits` number
- `link_clicks` number
- `dms` number
- `orders` number
- Unique index: (`tenant_id`, `post_id`, `date`)

## 3) Agent and Prompt Operations

### agent_runs
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `agent_type` enum: content | visual_prompt | publishing | engagement | growth_analyst
- `trigger_source` enum: manual | scheduled | event
- `input_ref` json
- `output_ref` json
- `status` enum: queued | running | succeeded | failed
- `created_by` uuid (FK -> users.id)
- `created_at` timestamp
- `completed_at` timestamp

### prompt_variants
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `post_id` uuid (FK -> posts.id)
- `variant_id` string
- `caption_text` string
- `image_prompt_text` string
- `created_at` timestamp

## 4) Support and Audit

### support_sessions
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `support_user_id` uuid (FK -> users.id)
- `mode` enum: readonly | impersonate
- `reason_code` string
- `ticket_ref` string
- `started_at` timestamp
- `expires_at` timestamp
- `ended_at` timestamp

### audit_events
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `actor_id` uuid
- `actor_role` string
- `action` string
- `resource_type` string
- `resource_id` string
- `request_id` string
- `source_ip` string
- `metadata` json
- `created_at` timestamp

## 5) Backup and Restore Metadata

### tenant_backups
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `snapshot_ref` string
- `reason` string
- `created_by` uuid
- `created_at` timestamp

### restore_jobs
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `backup_id` uuid (FK -> tenant_backups.id)
- `status` enum: queued | running | succeeded | failed
- `requested_by` uuid
- `created_at` timestamp
- `completed_at` timestamp

## 6) Row Isolation and Constraint Rules
- Every tenant-scoped table must have `tenant_id NOT NULL`.
- Any business unique key must include tenant scope (example: (`tenant_id`, `variant_id`)).
- FK chains must stay inside one tenant boundary.
- Cross-tenant joins are invalid by policy and DB enforcement.

## 7) RLS/Equivalent Guardrail (Concept)
- Set request tenant context in DB session before query execution.
- Allow rows only when `row.tenant_id == session.tenant_id`.
- Platform support override allowed only during active support session and must be audited.

## 8) Derived Metrics
- `save_rate = saves / reach`
- `dm_rate = dms / reach`
- `click_rate = link_clicks / reach`
- `order_rate = orders / link_clicks`
- `dm_close_rate = closed_threads / qualified_threads`

## 9) Minimal Local-first Snapshot Shape (Transitional)
```json
{
  "schemaVersion": 3,
  "tenantId": "<active-tenant-id>",
  "posts": [],
  "products": [],
  "dmThreads": [],
  "sopDaily": {},
  "metadata": {
    "updatedAt": "ISO-8601"
  }
}
```

## 10) Planned Tables for Integrations Blueprint v1

### tenant_onboarding_state
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `steps_json` json
- `completed_at` timestamp
- `updated_at` timestamp

### template_catalog (global)
- `id` uuid (PK)
- `category` string
- `name` string
- `payload_json` json
- `is_active` boolean
- `created_at` timestamp

### tenant_template_applies
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `template_id` uuid (FK -> template_catalog.id)
- `applied_by` uuid (FK -> users.id)
- `created_at` timestamp

### dm_intent_rules
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `intent` string
- `match_rules_json` json
- `updated_at` timestamp

### dm_reply_playbooks
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `intent` string
- `reply_template` text
- `updated_at` timestamp

### alert_rules
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `metric_key` string
- `operator` string
- `threshold` number
- `is_active` boolean
- `updated_at` timestamp

### alert_events
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `rule_id` uuid (FK -> alert_rules.id)
- `metric_key` string
- `observed_value` number
- `hints_json` json
- `created_at` timestamp

### resource_comments
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `resource_type` string
- `resource_id` string
- `author_id` uuid (FK -> users.id)
- `body` text
- `created_at` timestamp

### mention_notifications
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `comment_id` uuid (FK -> resource_comments.id)
- `mentioned_user_id` uuid (FK -> users.id)
- `is_read` boolean
- `created_at` timestamp

### shared_report_links
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `token` string (unique)
- `scope_json` json
- `expires_at` timestamp
- `created_by` uuid (FK -> users.id)
- `created_at` timestamp

### tenant_integrations
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `provider` string
- `status` string
- `config_ref` string
- `updated_at` timestamp

### integration_sync_runs
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `integration_id` uuid (FK -> tenant_integrations.id)
- `status` string
- `summary_json` json
- `started_at` timestamp
- `completed_at` timestamp

### tenant_usage_counters
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `metric_key` string
- `value` number
- `window_start` timestamp
- `window_end` timestamp

### tenant_plan_subscriptions
- `id` uuid (PK)
- `tenant_id` uuid (not null, indexed)
- `plan_tier` string
- `status` string
- `billing_provider_ref` string
- `started_at` timestamp
- `renewed_at` timestamp
