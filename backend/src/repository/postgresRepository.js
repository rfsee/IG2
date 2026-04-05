import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { createHttpError } from "../errors.js";
import { buildDailyWorkspacePayload } from "../workspace/dailyWorkspace.js";

const { Pool } = pg;

export function createPostgresRepository() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw createHttpError("DATABASE_URL_REQUIRED", 500);
  }

  const pool = new Pool({ connectionString });

  return {
    kind: "postgres",
    async healthCheck() {
      const { rows } = await pool.query("SELECT NOW() AS now");
      return { ok: true, provider: "postgres", now: rows[0]?.now || null };
    },
    async listVisibleTenants(actorId) {
      const { rows } = await pool.query(
        `SELECT m.tenant_id::text AS "tenantId", m.role, t.name AS "tenantName"
         FROM bridge.tenant_memberships m
         JOIN bridge.users u ON u.id = m.user_id
         JOIN bridge.tenants t ON t.id = m.tenant_id
         WHERE u.external_subject = $1
         ORDER BY t.name ASC`,
        [actorId]
      );
      return rows;
    },
    async getTenantById(tenantId) {
      const { rows } = await pool.query(`SELECT id::text AS id, name FROM bridge.tenants WHERE id::text = $1 LIMIT 1`, [tenantId]);
      return rows[0] || null;
    },
    async findMembership(actorId, tenantId) {
      const { rows } = await pool.query(
        `SELECT u.external_subject AS "userId", m.tenant_id::text AS "tenantId", m.role
         FROM bridge.tenant_memberships m
         JOIN bridge.users u ON u.id = m.user_id
         WHERE u.external_subject = $1 AND m.tenant_id::text = $2
         LIMIT 1`,
        [actorId, tenantId]
      );
      return rows[0] || null;
    },
    async getOnboardingState(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const existing = await client.query(
          `SELECT tenant_id::text AS "tenantId",
                  steps_json AS steps,
                  completed_at AS "completedAt"
           FROM tenant_domain.tenant_onboarding_state
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           LIMIT 1`
        );

        if (!existing.rows[0]) {
          const seeded = buildDefaultOnboardingState(tenantId);
          const inserted = await client.query(
            `INSERT INTO tenant_domain.tenant_onboarding_state
              (tenant_id, steps_json, completed_at)
             VALUES
              (current_setting('app.tenant_id', true)::uuid, $1::jsonb, $2::timestamptz)
             RETURNING tenant_id::text AS "tenantId",
                       steps_json AS steps,
                       completed_at AS "completedAt"`,
            [JSON.stringify(seeded.steps), seeded.completedAt]
          );
          await client.query("COMMIT");
          return normalizeOnboardingStateRow(inserted.rows[0]);
        }

        await client.query("COMMIT");
        return normalizeOnboardingStateRow(existing.rows[0]);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async listTemplates() {
      return listDefaultTemplates();
    },
    async applyTemplate(tenantId, templateId) {
      const template = DEFAULT_TEMPLATE_CATALOG.find((item) => item.id === templateId);
      if (!template) {
        throw createHttpError("template_not_found", 404);
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const createdPostIds = [];
        for (const source of template.posts) {
          const payload = normalizePostPayload(
            {
              ...source,
              id: randomUUID(),
              status: source.status || "草稿"
            },
            {}
          );
          const { rows } = await client.query(
            `INSERT INTO tenant_domain.posts
              (id, tenant_id, date_mmdd, week_tag, type, status, title, script, cta, link, trigger_tags, metrics_json)
             VALUES
              ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::jsonb)
             RETURNING id::text AS id`,
            [
              payload.id,
              payload.date,
              payload.week,
              payload.type,
              payload.status,
              payload.title,
              payload.script,
              payload.cta,
              payload.link,
              payload.triggerTags,
              JSON.stringify(payload.metrics)
            ]
          );
          if (rows[0]?.id) {
            createdPostIds.push(rows[0].id);
          }
        }
        await client.query("COMMIT");
        return {
          templateId: template.id,
          templateName: template.name,
          appliedCount: createdPostIds.length,
          createdPostIds
        };
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async completeOnboardingStep(tenantId, stepKey) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const existing = await client.query(
          `SELECT tenant_id::text AS "tenantId",
                  steps_json AS steps,
                  completed_at AS "completedAt"
           FROM tenant_domain.tenant_onboarding_state
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           LIMIT 1`
        );

        const baseState = existing.rows[0]
          ? normalizeOnboardingStateRow(existing.rows[0])
          : normalizeOnboardingState(buildDefaultOnboardingState(tenantId));
        const next = markOnboardingStepComplete(baseState, stepKey);

        const upserted = await client.query(
          `INSERT INTO tenant_domain.tenant_onboarding_state
             (tenant_id, steps_json, completed_at)
           VALUES
             (current_setting('app.tenant_id', true)::uuid, $1::jsonb, $2::timestamptz)
           ON CONFLICT (tenant_id)
           DO UPDATE SET
             steps_json = EXCLUDED.steps_json,
             completed_at = EXCLUDED.completed_at,
             updated_at = NOW()
           RETURNING tenant_id::text AS "tenantId",
                     steps_json AS steps,
                     completed_at AS "completedAt"`,
          [JSON.stringify(next.steps), next.completedAt]
        );

        await client.query("COMMIT");
        return normalizeOnboardingStateRow(upserted.rows[0]);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async classifyDmIntent(_tenantId, input) {
      return classifyIntentFromText(String(input.question || ""), String(input.selectedIntent || ""));
    },
    async generateDmReplyPlaybook(tenantId, input) {
      const question = String(input.question || "").trim();
      const postTitle = String(input.postTitle || "").trim();
      const postLink = String(input.postLink || "").trim();
      const intentResult = classifyIntentFromText(question, String(input.intent || input.selectedIntent || ""));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `SELECT name, price, size, material
           FROM tenant_domain.products
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 30`
        );
        await client.query("COMMIT");
        const recommendedProducts = pickRecommendedProducts(rows, intentResult.intent);
        return {
          intent: intentResult.intent,
          intentLabel: mapIntentLabel(intentResult.intent),
          confidence: intentResult.confidence,
          recommendedProducts,
          script: buildReplyScript({ question, postTitle, postLink, intent: intentResult.intent, recommendedProducts })
        };
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async listAlertRules(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `SELECT id::text AS id,
                  metric_key AS "metricKey",
                  operator,
                  threshold,
                  is_active AS "isActive",
                  created_at AS "createdAt",
                  updated_at AS "updatedAt"
           FROM tenant_domain.alert_rules
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC`
        );
        await client.query("COMMIT");
        return rows.map((row) => normalizeAlertRuleRow(row));
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async upsertAlertRule(tenantId, input) {
      const payload = normalizeAlertRuleInput(input);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        if (payload.id) {
          const updated = await client.query(
            `UPDATE tenant_domain.alert_rules
             SET metric_key = $2,
                 operator = $3,
                 threshold = $4,
                 is_active = $5,
                 updated_at = NOW()
             WHERE id::text = $1
               AND tenant_id::text = current_setting('app.tenant_id', true)
             RETURNING id::text AS id,
                       metric_key AS "metricKey",
                       operator,
                       threshold,
                       is_active AS "isActive",
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"`,
            [payload.id, payload.metricKey, payload.operator, payload.threshold, payload.isActive]
          );
          if (updated.rows[0]) {
            await client.query("COMMIT");
            return normalizeAlertRuleRow(updated.rows[0]);
          }
        }

        const inserted = await client.query(
          `INSERT INTO tenant_domain.alert_rules
            (id, tenant_id, metric_key, operator, threshold, is_active)
           VALUES
            ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5)
           RETURNING id::text AS id,
                     metric_key AS "metricKey",
                     operator,
                     threshold,
                     is_active AS "isActive",
                     created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          [randomUUID(), payload.metricKey, payload.operator, payload.threshold, payload.isActive]
        );
        await client.query("COMMIT");
        return normalizeAlertRuleRow(inserted.rows[0]);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async listAlerts(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const rulesResult = await client.query(
          `SELECT id::text AS id,
                  metric_key AS "metricKey",
                  operator,
                  threshold,
                  is_active AS "isActive",
                  created_at AS "createdAt",
                  updated_at AS "updatedAt"
           FROM tenant_domain.alert_rules
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC`
        );
        const metricsResult = await client.query(
          `SELECT
             COALESCE(SUM(CASE WHEN (metrics_json->>'reach') ~ '^-?\\d+(\\.\\d+)?$' THEN (metrics_json->>'reach')::numeric ELSE 0 END), 0) AS reach,
             COALESCE(SUM(CASE WHEN (metrics_json->>'saves') ~ '^-?\\d+(\\.\\d+)?$' THEN (metrics_json->>'saves')::numeric ELSE 0 END), 0) AS saves,
             COALESCE(SUM(CASE WHEN (metrics_json->>'dms') ~ '^-?\\d+(\\.\\d+)?$' THEN (metrics_json->>'dms')::numeric ELSE 0 END), 0) AS dms,
             COALESCE(SUM(CASE WHEN (metrics_json->>'clicks') ~ '^-?\\d+(\\.\\d+)?$' THEN (metrics_json->>'clicks')::numeric ELSE 0 END), 0) AS clicks,
             COALESCE(SUM(CASE WHEN (metrics_json->>'orders') ~ '^-?\\d+(\\.\\d+)?$' THEN (metrics_json->>'orders')::numeric ELSE 0 END), 0) AS orders
           FROM tenant_domain.posts
           WHERE tenant_id::text = current_setting('app.tenant_id', true)`
        );
        await client.query("COMMIT");

        const rules = rulesResult.rows.map((row) => normalizeAlertRuleRow(row));
        const metrics = normalizeAlertMetrics(metricsResult.rows[0] || {});
        const items = rules
          .filter((item) => item.isActive !== false)
          .map((rule) => evaluateAlertRule(rule, metrics))
          .filter(Boolean);
        return {
          rules,
          metrics,
          items
        };
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async getDailyWorkspace(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const postsResult = await client.query(
          `SELECT id::text AS id, title, status
           FROM tenant_domain.posts
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC`
        );
        const productsResult = await client.query(
          `SELECT id::text AS id, name, link
           FROM tenant_domain.products
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC`
        );
        await client.query("COMMIT");
        const alerts = await this.listAlerts(tenantId);
        return buildDailyWorkspacePayload({
          posts: postsResult.rows,
          products: productsResult.rows,
          alerts
        });
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async getContentUpgradePackage(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const postsResult = await client.query(
          `SELECT id::text AS id, title, status
           FROM tenant_domain.posts
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        const productsResult = await client.query(
          `SELECT id::text AS id, name, price, material, scene
           FROM tenant_domain.products
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        await client.query("COMMIT");
        const industryKey = inferIndustryKey({
          tenantId,
          posts: postsResult.rows,
          products: productsResult.rows
        });
        return buildContentUpgradePackagePayload({
          industryKey,
          posts: postsResult.rows,
          products: productsResult.rows
        });
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async getContentUpgradeBatchKpi(tenantId, batchId = "") {
      const posts = await this.listPosts(tenantId);
      return buildContentUpgradeBatchKpiPayload(posts, batchId);
    },
    async getContentUpgradeMonthlyMission(tenantId, month = "") {
      const payload = await this.getContentUpgradePackage(tenantId);
      return buildContentUpgradeMonthlyMissionPayload(payload, month);
    },
    async getBrandStrategyIntake(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `SELECT id::text AS id,
                  tenant_id::text AS "tenantId",
                  brand_name AS "brandName",
                  industry,
                  target_audience AS "targetAudience",
                  business_goal AS "businessGoal",
                  tone,
                  keywords_json AS keywords,
                  constraints_text AS constraints,
                  notes,
                  created_at AS "createdAt",
                  updated_at AS "updatedAt"
           FROM tenant_domain.brand_strategy_intakes
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           LIMIT 1`
        );
        await client.query("COMMIT");
        return rows[0] ? normalizeBrandStrategyIntakeRow(rows[0]) : null;
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async saveBrandStrategyIntake(tenantId, input = {}) {
      const payload = normalizeBrandStrategyIntakeInput(input);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const intakeIdResult = await client.query(
          `SELECT id::text AS id
           FROM tenant_domain.brand_strategy_intakes
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           LIMIT 1`
        );
        const intakeId = String(intakeIdResult.rows[0]?.id || randomUUID());
        const { rows } = await client.query(
          `INSERT INTO tenant_domain.brand_strategy_intakes
             (id, tenant_id, brand_name, industry, target_audience, business_goal, tone, keywords_json, constraints_text, notes)
           VALUES
             ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
           ON CONFLICT (tenant_id)
           DO UPDATE SET
             brand_name = EXCLUDED.brand_name,
             industry = EXCLUDED.industry,
             target_audience = EXCLUDED.target_audience,
             business_goal = EXCLUDED.business_goal,
             tone = EXCLUDED.tone,
             keywords_json = EXCLUDED.keywords_json,
             constraints_text = EXCLUDED.constraints_text,
             notes = EXCLUDED.notes,
             updated_at = NOW()
           RETURNING id::text AS id,
                     tenant_id::text AS "tenantId",
                     brand_name AS "brandName",
                     industry,
                     target_audience AS "targetAudience",
                     business_goal AS "businessGoal",
                     tone,
                     keywords_json AS keywords,
                     constraints_text AS constraints,
                     notes,
                     created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          [
            intakeId,
            payload.brandName,
            payload.industry,
            payload.targetAudience,
            payload.businessGoal,
            payload.tone,
            JSON.stringify(payload.keywords),
            payload.constraints,
            payload.notes
          ]
        );
        await client.query("COMMIT");
        return normalizeBrandStrategyIntakeRow(rows[0]);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async generateBrandStrategyPlan(tenantId, input = {}) {
      const intakeId = String(input.intakeId || "").trim();
      const actorId = String(input.actorId || "system").trim() || "system";
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const intakeResult = await client.query(
          `SELECT id::text AS id,
                  tenant_id::text AS "tenantId",
                  brand_name AS "brandName",
                  industry,
                  target_audience AS "targetAudience",
                  business_goal AS "businessGoal",
                  tone,
                  keywords_json AS keywords,
                  constraints_text AS constraints,
                  notes,
                  created_at AS "createdAt",
                  updated_at AS "updatedAt"
           FROM tenant_domain.brand_strategy_intakes
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
             AND ($1 = '' OR id::text = $1)
           LIMIT 1`,
          [intakeId]
        );
        if (!intakeResult.rows[0]) {
          throw createHttpError("brand_strategy_intake_not_found", 404);
        }
        const intake = normalizeBrandStrategyIntakeRow(intakeResult.rows[0]);
        const postsResult = await client.query(
          `SELECT id::text AS id,
                  title,
                  status,
                  type,
                  metrics_json AS metrics
           FROM tenant_domain.posts
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        const productsResult = await client.query(
          `SELECT id::text AS id,
                  name,
                  status,
                  price
           FROM tenant_domain.products
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        const planPayload = buildBrandStrategyPlanPayload({
          tenantId,
          intake,
          posts: postsResult.rows,
          products: productsResult.rows
        });
        const planId = randomUUID();
        const { rows } = await client.query(
          `INSERT INTO tenant_domain.brand_strategy_plans
             (id, tenant_id, intake_id, plan_json, created_by)
           VALUES
             ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2::uuid, $3::jsonb, $4)
           RETURNING id::text AS id,
                     tenant_id::text AS "tenantId",
                     intake_id::text AS "intakeId",
                     plan_json AS "planJson",
                     created_by AS "createdBy",
                     created_at AS "createdAt"`,
          [planId, intake.id, JSON.stringify(planPayload), actorId]
        );
        await client.query("COMMIT");
        return normalizeBrandStrategyPlanRow(rows[0]);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async getBrandStrategyPlan(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `SELECT id::text AS id,
                  tenant_id::text AS "tenantId",
                  intake_id::text AS "intakeId",
                  plan_json AS "planJson",
                  created_by AS "createdBy",
                  created_at AS "createdAt"
           FROM tenant_domain.brand_strategy_plans
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY created_at DESC
           LIMIT 1`
        );
        await client.query("COMMIT");
        return rows[0] ? normalizeBrandStrategyPlanRow(rows[0]) : null;
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async createSharedReportLink(tenantId, input = {}) {
      const batchId = normalizeSharedReportBatchId(input.batchId);
      const expiresAt = buildSharedReportExpiry(input.expiresInDays);
      const token = buildSharedReportToken();
      const { rows } = await pool.query(
        `INSERT INTO bridge.shared_report_links
          (id, tenant_id, token, report_type, scope_json, expires_at, created_by)
         VALUES
          ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::timestamptz, $7)
         RETURNING id::text AS id,
                   tenant_id::text AS "tenantId",
                   token,
                   report_type AS "reportType",
                   scope_json AS scope,
                   expires_at AS "expiresAt",
                   created_by AS "createdBy",
                   created_at AS "createdAt"`,
        [randomUUID(), tenantId, token, "content_upgrade_batch", JSON.stringify({ batchId: batchId || "all" }), expiresAt, String(input.createdBy || "system").trim() || "system"]
      );
      return normalizeSharedReportLinkRow(rows[0]);
    },
    async getSharedReportLinkByToken(token) {
      const normalizedToken = String(token || "").trim();
      const { rows } = await pool.query(
        `SELECT id::text AS id,
                tenant_id::text AS "tenantId",
                token,
                report_type AS "reportType",
                scope_json AS scope,
                expires_at AS "expiresAt",
                created_by AS "createdBy",
                created_at AS "createdAt"
         FROM bridge.shared_report_links
         WHERE token = $1
         LIMIT 1`,
        [normalizedToken]
      );
      return rows[0] ? normalizeSharedReportLinkRow(rows[0]) : null;
    },
    async applyContentUpgradeMonthlyMission(tenantId, month = "") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const postsResult = await client.query(
          `SELECT id::text AS id, title, status
           FROM tenant_domain.posts
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        const productsResult = await client.query(
          `SELECT id::text AS id, name, price, material, scene
           FROM tenant_domain.products
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        const industryKey = inferIndustryKey({ tenantId, posts: postsResult.rows, products: productsResult.rows });
        const payload = buildContentUpgradePackagePayload({ industryKey, posts: postsResult.rows, products: productsResult.rows });
        const mission = buildContentUpgradeMonthlyMissionPayload(payload, month);
        const batchId = buildContentUpgradeBatchId("mission");
        const createdPosts = [];
        for (const source of buildMonthlyMissionDraftPosts(mission)) {
          const postId = randomUUID();
          const normalized = normalizePostPayload(
            {
              ...source,
              id: postId,
              status: source.status || "草稿",
              triggerTags: Array.isArray(source.triggerTags)
                ? [...source.triggerTags, `batch:${batchId}`]
                : [`batch:${batchId}`]
            },
            { id: postId }
          );
          const { rows } = await client.query(
            `INSERT INTO tenant_domain.posts
              (id, tenant_id, date_mmdd, week_tag, type, status, title, script, cta, link, trigger_tags, metrics_json)
             VALUES
              ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::jsonb)
             RETURNING id::text AS id,
                       date_mmdd AS date,
                       week_tag AS week,
                       type,
                       status,
                       title,
                       script,
                       cta,
                       link,
                       trigger_tags AS "triggerTags",
                       metrics_json AS metrics`,
            [
              normalized.id,
              normalized.date,
              normalized.week,
              normalized.type,
              normalized.status,
              normalized.title,
              normalized.script,
              normalized.cta,
              normalized.link,
              normalized.triggerTags,
              JSON.stringify(normalized.metrics)
            ]
          );
          if (rows[0]) {
            createdPosts.push(normalizePostRow(rows[0]));
          }
        }
        await client.query("COMMIT");
        return {
          month: mission.month,
          batchId,
          checklist: mission.checklist.map((item) => String(item)),
          objective: mission.objective,
          topic: { ...mission.topic },
          recommendedPackage: mission.recommendedPackage ? { ...mission.recommendedPackage } : null,
          draftPosts: createdPosts,
          createdPostIds: createdPosts.map((item) => item.id),
          appliedCount: createdPosts.length,
          generatedAt: new Date().toISOString()
        };
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async applyContentUpgradePackage(tenantId, packageId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const postsResult = await client.query(
          `SELECT id::text AS id, title, status
           FROM tenant_domain.posts
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        const productsResult = await client.query(
          `SELECT id::text AS id, name, price, material, scene
           FROM tenant_domain.products
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC
           LIMIT 200`
        );
        const industryKey = inferIndustryKey({
          tenantId,
          posts: postsResult.rows,
          products: productsResult.rows
        });
        const payload = buildContentUpgradePackagePayload({
          industryKey,
          posts: postsResult.rows,
          products: productsResult.rows
        });
        const selectedId = String(packageId || "").trim();
        const selected = payload.packages.find((item) => item.id === selectedId);
        if (!selected) {
          throw createHttpError("content_upgrade_package_not_found", 404);
        }
        const plan = buildAppliedUpgradePlan(selected, payload);
        const batchId = buildContentUpgradeBatchId("apply");
        const createdPosts = [];
        for (const source of plan.draftPosts) {
          const postId = randomUUID();
          const normalized = normalizePostPayload(
            {
              ...source,
              id: postId,
              status: source.status || "草稿",
              triggerTags: Array.isArray(source.triggerTags)
                ? [...source.triggerTags, `batch:${batchId}`]
                : [`batch:${batchId}`]
            },
            { id: postId }
          );
          const { rows } = await client.query(
            `INSERT INTO tenant_domain.posts
              (id, tenant_id, date_mmdd, week_tag, type, status, title, script, cta, link, trigger_tags, metrics_json)
             VALUES
              ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::jsonb)
             RETURNING id::text AS id,
                       date_mmdd AS date,
                       week_tag AS week,
                       type,
                       status,
                       title,
                       script,
                       cta,
                       link,
                       trigger_tags AS "triggerTags",
                       metrics_json AS metrics`,
            [
              normalized.id,
              normalized.date,
              normalized.week,
              normalized.type,
              normalized.status,
              normalized.title,
              normalized.script,
              normalized.cta,
              normalized.link,
              normalized.triggerTags,
              JSON.stringify(normalized.metrics)
            ]
          );
          if (rows[0]) {
            createdPosts.push(normalizePostRow(rows[0]));
          }
        }
        const generatedTasks = (plan.generatedTasks || []).map((task, index) => {
          if (index === 0 && createdPosts[0]?.id) {
            return {
              ...task,
              resourceId: createdPosts[0].id,
              hint: `先完成 ${createdPosts[0].title || task.hint || createdPosts[0].id} 的素材與上架`
            };
          }
          return { ...task };
        });
        await client.query("COMMIT");
        return {
          ...plan,
          generatedTasks,
          draftPosts: createdPosts,
          createdPostIds: createdPosts.map((item) => item.id),
          appliedCount: createdPosts.length,
          batchId,
          executionSummary: {
            ...plan.executionSummary,
            draftCount: createdPosts.length,
            batchId
          }
        };
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async listComments(tenantId, query = {}) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const resourceType = String(query.resourceType || "").trim().toLowerCase();
        const resourceId = String(query.resourceId || "").trim();
        const { rows } = await client.query(
          `SELECT id::text AS id,
                  resource_type AS "resourceType",
                  resource_id AS "resourceId",
                  author_id AS "authorId",
                  body,
                  mentions_json AS mentions,
                  created_at AS "createdAt"
           FROM tenant_domain.resource_comments
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
             AND ($1 = '' OR resource_type = $1)
             AND ($2 = '' OR resource_id = $2)
           ORDER BY created_at DESC
           LIMIT 200`,
          [resourceType, resourceId]
        );
        await client.query("COMMIT");
        return rows.map((row) => normalizeCommentRow(row));
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async createComment(tenantId, input) {
      const resourceType = String(input.resourceType || "").trim().toLowerCase();
      if (!(resourceType === "post" || resourceType === "product")) {
        throw createHttpError("comment_resource_type_invalid", 400);
      }
      const resourceId = String(input.resourceId || "").trim();
      if (!resourceId) {
        throw createHttpError("comment_resource_id_required", 400);
      }
      const body = String(input.body || "").trim();
      if (!body) {
        throw createHttpError("comment_body_required", 400);
      }
      if (body.length > 2000) {
        throw createHttpError("comment_body_too_long", 400);
      }
      const authorId = String(input.authorId || "system").trim() || "system";
      const mentions = parseMentionsFromText(body);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `INSERT INTO tenant_domain.resource_comments
             (id, tenant_id, resource_type, resource_id, author_id, body, mentions_json)
           VALUES
             ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5, $6::jsonb)
           RETURNING id::text AS id,
                     resource_type AS "resourceType",
                     resource_id AS "resourceId",
                     author_id AS "authorId",
                     body,
                     mentions_json AS mentions,
                     created_at AS "createdAt"`,
          [randomUUID(), resourceType, resourceId, authorId, body, JSON.stringify(mentions)]
        );
        const comment = normalizeCommentRow(rows[0]);

        if (mentions.length > 0) {
          for (const mentionedUserId of mentions) {
            await client.query(
              `INSERT INTO tenant_domain.mention_notifications
                 (id, tenant_id, comment_id, mentioned_user_id, is_read)
               VALUES
                 ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2::uuid, $3, FALSE)`,
              [randomUUID(), comment.id, mentionedUserId]
            );
          }
        }

        await client.query("COMMIT");
        return comment;
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async listPosts(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `SELECT id::text AS id,
                  date_mmdd AS date,
                  week_tag AS week,
                  type,
                  status,
                  title,
                  script,
                  cta,
                  link,
                  trigger_tags AS "triggerTags",
                  metrics_json AS metrics
           FROM tenant_domain.posts
            WHERE tenant_id::text = current_setting('app.tenant_id', true)
            ORDER BY updated_at DESC`
        );
        await client.query("COMMIT");
        return rows.map((row) => normalizePostRow(row));
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async createPost(tenantId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const postId = randomUUID();
        const payload = normalizePostPayload(input, { id: postId });
        const { rows } = await client.query(
          `INSERT INTO tenant_domain.posts
            (id, tenant_id, date_mmdd, week_tag, type, status, title, script, cta, link, trigger_tags, metrics_json)
           VALUES
            ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::jsonb)
           RETURNING id::text AS id,
                     date_mmdd AS date,
                     week_tag AS week,
                     type,
                     status,
                     title,
                     script,
                     cta,
                     link,
                     trigger_tags AS "triggerTags",
                     metrics_json AS metrics`,
          [
            payload.id,
            payload.date,
            payload.week,
            payload.type,
            payload.status,
            payload.title,
            payload.script,
            payload.cta,
            payload.link,
            payload.triggerTags,
            JSON.stringify(payload.metrics)
          ]
        );
        await client.query("COMMIT");
        return normalizePostRow(rows[0]);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async updatePost(tenantId, postId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const existingResult = await client.query(
          `SELECT id::text AS id,
                  date_mmdd AS date,
                  week_tag AS week,
                  type,
                  status,
                  title,
                  script,
                  cta,
                  link,
                  trigger_tags AS "triggerTags",
                  metrics_json AS metrics
           FROM tenant_domain.posts
           WHERE id::text = $1
             AND tenant_id::text = current_setting('app.tenant_id', true)
           LIMIT 1`,
          [postId]
        );
        if (!existingResult.rows[0]) {
          throw createHttpError("post_not_found", 404);
        }
        const payload = normalizePostPayload(input, normalizePostRow(existingResult.rows[0]));
        const { rows } = await client.query(
          `UPDATE tenant_domain.posts
           SET date_mmdd = $2,
               week_tag = $3,
               type = $4,
               status = $5,
               title = $6,
               script = $7,
               cta = $8,
               link = $9,
               trigger_tags = $10::text[],
               metrics_json = $11::jsonb,
               updated_at = NOW()
           WHERE id::text = $1
             AND tenant_id::text = current_setting('app.tenant_id', true)
           RETURNING id::text AS id,
                     date_mmdd AS date,
                     week_tag AS week,
                     type,
                     status,
                     title,
                     script,
                     cta,
                     link,
                     trigger_tags AS "triggerTags",
                     metrics_json AS metrics`,
          [
            postId,
            payload.date,
            payload.week,
            payload.type,
            payload.status,
            payload.title,
            payload.script,
            payload.cta,
            payload.link,
            payload.triggerTags,
            JSON.stringify(payload.metrics)
          ]
        );
        await client.query("COMMIT");
        return normalizePostRow(rows[0]);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async batchUpdatePostsStatus(tenantId, input = {}) {
      const ids = normalizeBatchIds(input.ids);
      const status = normalizePostBatchStatus(input.status);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const results = [];
        for (const id of ids) {
          const { rows } = await client.query(
            `UPDATE tenant_domain.posts
             SET status = $2,
                 updated_at = NOW()
             WHERE id::text = $1
               AND tenant_id::text = current_setting('app.tenant_id', true)
             RETURNING id::text AS id, status`,
            [id, status]
          );
          if (rows[0]) {
            results.push({ id: rows[0].id, ok: true, status: rows[0].status });
          } else {
            results.push({ id, ok: false, error: "post_not_found" });
          }
        }
        await client.query("COMMIT");
        return buildBatchMutationSummary(results, status);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async deletePost(tenantId, postId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `DELETE FROM tenant_domain.posts
           WHERE id::text = $1
             AND tenant_id::text = current_setting('app.tenant_id', true)
           RETURNING id::text AS id`,
          [postId]
        );
        if (!rows[0]) {
          throw createHttpError("post_not_found", 404);
        }
        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async listProducts(tenantId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `SELECT id::text AS id, name, price, size, material, selling, link, scene, status
           FROM tenant_domain.products
           WHERE tenant_id::text = current_setting('app.tenant_id', true)
           ORDER BY updated_at DESC`
        );
        await client.query("COMMIT");
        return rows;
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async createProduct(tenantId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const productId = randomUUID();
        const { rows } = await client.query(
          `INSERT INTO tenant_domain.products (id, tenant_id, name, price, size, material, selling, link, scene, status)
           VALUES ($1::uuid, current_setting('app.tenant_id', true)::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id::text AS id, name, price, size, material, selling, link, scene, status`,
          [
            productId,
            String(input.name || "").trim(),
            Number(input.price || 0),
            String(input.size || "").trim(),
            String(input.material || "").trim(),
            String(input.selling || "").trim(),
            String(input.link || "").trim(),
            String(input.scene || "").trim(),
            String(input.status || "active").trim() || "active"
          ]
        );
        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async updateProduct(tenantId, productId, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const statusCandidate = input?.status === undefined ? null : String(input.status || "").trim() || null;
        const { rows } = await client.query(
          `UPDATE tenant_domain.products
           SET name = $3,
               price = $4,
               size = $5,
               material = $6,
               selling = $7,
               link = $8,
               scene = $9,
                status = COALESCE($10, status),
                updated_at = NOW()
            WHERE id::text = $2
              AND tenant_id::text = current_setting('app.tenant_id', true)
            RETURNING id::text AS id, name, price, size, material, selling, link, scene, status`,
          [
            tenantId,
            productId,
            String(input.name || "").trim(),
            Number(input.price || 0),
            String(input.size || "").trim(),
            String(input.material || "").trim(),
            String(input.selling || "").trim(),
            String(input.link || "").trim(),
            String(input.scene || "").trim(),
            statusCandidate
          ]
        );
        if (!rows[0]) {
          throw createHttpError("product_not_found", 404);
        }
        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async batchUpdateProductsStatus(tenantId, input = {}) {
      const ids = normalizeBatchIds(input.ids);
      const status = normalizeProductBatchStatus(input.status);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const results = [];
        for (const id of ids) {
          const { rows } = await client.query(
            `UPDATE tenant_domain.products
             SET status = $2,
                 updated_at = NOW()
             WHERE id::text = $1
               AND tenant_id::text = current_setting('app.tenant_id', true)
             RETURNING id::text AS id, status`,
            [id, status]
          );
          if (rows[0]) {
            results.push({ id: rows[0].id, ok: true, status: rows[0].status });
          } else {
            results.push({ id, ok: false, error: "product_not_found" });
          }
        }
        await client.query("COMMIT");
        return buildBatchMutationSummary(results, status);
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteProduct(tenantId, productId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const { rows } = await client.query(
          `DELETE FROM tenant_domain.products
           WHERE id::text = $2
             AND tenant_id::text = current_setting('app.tenant_id', true)
           RETURNING id::text AS id`,
          [tenantId, productId]
        );
        if (!rows[0]) {
          throw createHttpError("product_not_found", 404);
        }
        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        await safeRollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async registerUser(input = {}) {
      const email = normalizeEmail(input.email);
      const password = String(input.password || "");
      const storeName = String(input.storeName || "").trim();
      if (!email) {
        throw createHttpError("email_required", 400);
      }
      if (password.length < 6) {
        throw createHttpError("password_too_short", 400);
      }
      if (!storeName) {
        throw createHttpError("store_name_required", 400);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const emailHit = await client.query(
          `SELECT u.id::text AS id
           FROM bridge.users u
           WHERE lower(u.email) = $1
           LIMIT 1`,
          [email]
        );
        if (emailHit.rows[0]) {
          throw createHttpError("email_already_exists", 409);
        }

        const userId = randomUUID();
        const actorId = buildActorId();
        const tenantId = randomUUID();
        const tenantSlug = buildTenantSlug(storeName);
        const displayName = buildDisplayNameFromEmail(email);

        await client.query(
          `INSERT INTO bridge.users (id, external_subject, email, display_name, status)
           VALUES ($1::uuid, $2, $3, $4, 'active')`,
          [userId, actorId, email, displayName]
        );

        await client.query(
          `INSERT INTO bridge.user_credentials (user_id, password_hash)
           VALUES ($1::uuid, $2)`,
          [userId, hashPassword(password)]
        );

        await client.query(
          `INSERT INTO bridge.tenants (id, slug, name, plan_tier, status)
           VALUES ($1::uuid, $2, $3, 'starter', 'active')`,
          [tenantId, tenantSlug, storeName]
        );

        await client.query(
          `INSERT INTO bridge.tenant_memberships (id, tenant_id, user_id, role)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'owner')`,
          [randomUUID(), tenantId, userId]
        );

        await client.query("COMMIT");
        return {
          actorId,
          tenantId: String(tenantId)
        };
      } catch (error) {
        await safeRollback(client);
        if (String(error?.code || "") === "23505") {
          throw createHttpError("email_already_exists", 409);
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async loginUser(input = {}) {
      const email = normalizeEmail(input.email);
      const password = String(input.password || "");
      if (!email || !password) {
        throw createHttpError("invalid_credentials", 401);
      }

      const { rows } = await pool.query(
        `SELECT u.external_subject AS "actorId",
                c.password_hash AS "passwordHash"
         FROM bridge.users u
         JOIN bridge.user_credentials c ON c.user_id = u.id
         WHERE lower(u.email) = $1
           AND u.status = 'active'
         LIMIT 1`,
        [email]
      );
      const hit = rows[0];
      if (!hit || String(hit.passwordHash || "") !== hashPassword(password)) {
        throw createHttpError("invalid_credentials", 401);
      }

      return {
        actorId: String(hit.actorId || "").trim()
      };
    },
    async createAuthSession(input = {}) {
      await pool.query(
        `INSERT INTO bridge.auth_sessions (token_hash, actor_id, expires_at, last_seen_at)
         VALUES ($1, $2, $3::timestamptz, NOW())
         ON CONFLICT (token_hash) DO UPDATE SET
           actor_id = EXCLUDED.actor_id,
           expires_at = EXCLUDED.expires_at,
           last_seen_at = NOW()`,
        [String(input.tokenHash || ""), String(input.actorId || "").trim(), String(input.expiresAt || "")]
      );
    },
    async resolveAuthSession(tokenHash) {
      const { rows } = await pool.query(
        `UPDATE bridge.auth_sessions
         SET last_seen_at = NOW()
         WHERE token_hash = $1
           AND expires_at > NOW()
         RETURNING actor_id AS "actorId", expires_at AS "expiresAt"`,
        [String(tokenHash || "")]
      );
      return rows[0] || null;
    },
    async appendAuditEvent(event) {
      await pool.query(
        `INSERT INTO bridge.audit_events
         (id, tenant_id, actor_id, actor_role, action, resource_type, resource_id, request_id, source_ip, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          randomUUID(),
          event.tenantId,
          event.actorId,
          event.actorRole,
          event.action,
          event.resourceType,
          event.resourceId,
          event.requestId,
          event.sourceIp || null,
          JSON.stringify(event.metadata || {})
        ]
      );
    },
    async listAuditEvents(tenantId, query = {}) {
      const normalized = normalizeAuditQuery(query);
      const values = [tenantId];
      const where = ["tenant_id::text = $1"];

      if (normalized.action) {
        values.push(normalized.action);
        where.push(`action = $${values.length}`);
      }
      if (normalized.actorId) {
        values.push(normalized.actorId);
        where.push(`actor_id = $${values.length}`);
      }
      if (normalized.resourceType) {
        values.push(normalized.resourceType);
        where.push(`resource_type = $${values.length}`);
      }
      if (normalized.requestId) {
        values.push(normalized.requestId);
        where.push(`request_id = $${values.length}`);
      }
      if (normalized.traceId) {
        values.push(normalized.traceId);
        where.push(`metadata->'event'->>'traceId' = $${values.length}`);
      }
      if (normalized.since) {
        values.push(normalized.since);
        where.push(`created_at >= $${values.length}::timestamptz`);
      }

      values.push(normalized.limit);
      const limitRef = `$${values.length}`;

      const { rows } = await pool.query(
        `SELECT id::text AS id, actor_id AS "actorId", actor_role AS "actorRole", action,
                resource_type AS "resourceType", resource_id AS "resourceId", request_id AS "requestId",
                metadata, created_at AS "createdAt"
         FROM bridge.audit_events
         WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ${limitRef}`,
        values
      );
      return rows;
    },
    async close() {
      await pool.end();
    }
  };
}

function normalizeAuditQuery(query) {
  if (typeof query === "number") {
    return {
      limit: Math.min(Math.max(query, 1), 1000),
      action: undefined,
      actorId: undefined,
      since: undefined
    };
  }

  const limit = Number(query.limit || 20);
  const sinceRaw = String(query.since || "").trim();
  return {
    limit: Math.min(Math.max(limit, 1), 1000),
    action: query.action,
    actorId: query.actorId,
    resourceType: query.resourceType,
    requestId: query.requestId,
    traceId: query.traceId,
    since: Number.isFinite(Date.parse(sinceRaw)) ? sinceRaw : undefined
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password) {
  return createHash("sha256").update(String(password || "")).digest("hex");
}

function buildActorId() {
  return `u_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function buildTenantSlug(storeName) {
  const base = String(storeName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const normalizedBase = base || "team-store";
  return `${normalizedBase}-${randomUUID().replace(/-/g, "").slice(0, 6)}`;
}

function buildDisplayNameFromEmail(email) {
  const localPart = String(email || "").split("@")[0] || "member";
  const safe = localPart.replace(/[^a-zA-Z0-9_\-.]+/g, " ").trim();
  return safe || "Member";
}

async function safeRollback(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.warn("Rollback failed", rollbackError);
  }
}

function normalizePostPayload(input, current = {}) {
  const source = input || {};
  const mergedMetrics = mergePostMetrics(current.metrics, source.metrics);
  return {
    id: String(current.id || source.id || randomUUID()),
    date: String(source.date ?? current.date ?? "").trim(),
    week: String(source.week ?? current.week ?? "W1").trim() || "W1",
    type: String(source.type ?? current.type ?? "feed").trim() || "feed",
    status: String(source.status ?? current.status ?? "draft").trim() || "draft",
    title: String(source.title ?? current.title ?? "").trim(),
    script: String(source.script ?? current.script ?? "").trim(),
    cta: String(source.cta ?? current.cta ?? "").trim(),
    link: String(source.link ?? current.link ?? "").trim(),
    triggerTags: normalizePostTags(source.triggerTags ?? current.triggerTags),
    metrics: normalizePostMetrics(mergedMetrics)
  };
}

function normalizePostRow(row) {
  return {
    id: String(row?.id || ""),
    date: String(row?.date || "").trim(),
    week: String(row?.week || "W1").trim() || "W1",
    type: String(row?.type || "feed").trim() || "feed",
    status: String(row?.status || "draft").trim() || "draft",
    title: String(row?.title || "").trim(),
    script: String(row?.script || "").trim(),
    cta: String(row?.cta || "").trim(),
    link: String(row?.link || "").trim(),
    triggerTags: normalizePostTags(row?.triggerTags),
    metrics: normalizePostMetrics(row?.metrics)
  };
}

function normalizePostTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizePostMetrics(metrics) {
  return {
    reach: Number(metrics?.reach ?? 0),
    saves: Number(metrics?.saves ?? 0),
    dms: Number(metrics?.dms ?? 0),
    clicks: Number(metrics?.clicks ?? 0),
    orders: Number(metrics?.orders ?? 0)
  };
}

function mergePostMetrics(currentMetrics, incomingMetrics) {
  const base = normalizePostMetrics(currentMetrics);
  if (!incomingMetrics || typeof incomingMetrics !== "object") {
    return base;
  }
  return {
    ...base,
    reach: incomingMetrics.reach ?? base.reach,
    saves: incomingMetrics.saves ?? base.saves,
    dms: incomingMetrics.dms ?? base.dms,
    clicks: incomingMetrics.clicks ?? base.clicks,
    orders: incomingMetrics.orders ?? base.orders
  };
}

function buildDefaultOnboardingState(tenantId) {
  return {
    tenantId: String(tenantId || "").trim(),
    steps: DEFAULT_ONBOARDING_STEPS.map((item) => ({ ...item, completedAt: null })),
    completedAt: null
  };
}

function normalizeOnboardingStateRow(row) {
  const source = {
    tenantId: String(row?.tenantId || "").trim(),
    steps: Array.isArray(row?.steps) ? row.steps : [],
    completedAt: row?.completedAt ? new Date(row.completedAt).toISOString() : null
  };
  return normalizeOnboardingState(source);
}

function normalizeOnboardingState(state) {
  const steps = Array.isArray(state?.steps)
    ? state.steps
        .map((item) => ({
          key: String(item?.key || "").trim(),
          label: String(item?.label || "").trim(),
          completedAt: item?.completedAt ? String(item.completedAt) : null
        }))
        .filter((item) => item.key && item.label)
    : [];
  const completedCount = steps.filter((item) => Boolean(item.completedAt)).length;
  const completedAt = completedCount === steps.length && steps.length > 0 ? new Date().toISOString() : null;
  return {
    tenantId: String(state?.tenantId || "").trim(),
    completedCount,
    totalCount: steps.length,
    isComplete: steps.length > 0 && completedCount === steps.length,
    completedAt,
    steps
  };
}

function markOnboardingStepComplete(state, stepKey) {
  const key = String(stepKey || "").trim();
  const index = state.steps.findIndex((item) => item.key === key);
  if (index < 0) {
    throw createHttpError("onboarding_step_not_found", 404);
  }
  const nextSteps = state.steps.map((item, itemIndex) => {
    if (itemIndex !== index) {
      return item;
    }
    if (item.completedAt) {
      return item;
    }
    return {
      ...item,
      completedAt: new Date().toISOString()
    };
  });
  return normalizeOnboardingState({
    tenantId: state.tenantId,
    steps: nextSteps
  });
}

const DEFAULT_ONBOARDING_STEPS = [
  { key: "connect_backend", label: "連接後端帳號" },
  { key: "import_products", label: "匯入或建立第一批商品" },
  { key: "create_weekly_plan", label: "建立本週第一份貼文規劃" },
  { key: "review_kpi", label: "查看 KPI 與每週總覽" }
];

const DEFAULT_TEMPLATE_CATALOG = [
  {
    id: "tpl_furniture_launch_v1",
    category: "furniture",
    name: "家具開店首週模板",
    description: "適合家具新店首週曝光與導購節奏",
    posts: [
      {
        date: "",
        week: "W1",
        type: "reels",
        status: "草稿",
        title: "開箱風格角落：小空間質感升級",
        script: "3 個鏡頭展示角落前後對比，強調小坪數也能有設計感。",
        cta: "留言想看哪個角落改造，私訊拿搭配清單",
        link: "",
        triggerTags: ["proof", "value"]
      },
      {
        date: "",
        week: "W1",
        type: "feed",
        status: "草稿",
        title: "本週主推商品：蘑菇邊几",
        script: "用 4 張圖說明尺寸、材質、使用情境與預算友善點。",
        cta: "點商品連結看更多細節，私訊可協助搭配",
        link: "",
        triggerTags: ["value", "urgency"]
      },
      {
        date: "",
        week: "W1",
        type: "story",
        status: "草稿",
        title: "限時問答：租屋空間最困擾哪一區？",
        script: "用投票互動蒐集痛點，隔天回應解法。",
        cta: "投票後私訊領取小空間清單",
        link: "",
        triggerTags: ["pain", "reassurance"]
      }
    ]
  },
  {
    id: "tpl_coffee_engagement_v1",
    category: "coffee",
    name: "咖啡店互動成長模板",
    description: "提升門市互動與 DM 諮詢率的內容節奏",
    posts: [
      {
        date: "",
        week: "W1",
        type: "reels",
        status: "草稿",
        title: "本週特調製作過程",
        script: "展示 5 秒開頭亮點 + 製作細節 + 成品口感描述。",
        cta: "留言關鍵字，私訊送本週優惠",
        link: "",
        triggerTags: ["proof", "urgency"]
      },
      {
        date: "",
        week: "W1",
        type: "feed",
        status: "草稿",
        title: "豆單推薦：新手入門 3 款",
        script: "圖文分別對應酸值、甜感、焙度，降低選擇焦慮。",
        cta: "私訊告訴我們你的口味偏好",
        link: "",
        triggerTags: ["value", "reassurance"]
      }
    ]
  }
];

function listDefaultTemplates() {
  return DEFAULT_TEMPLATE_CATALOG.map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    description: item.description,
    postCount: item.posts.length
  }));
}

function normalizeBrandStrategyIntakeInput(input) {
  const brandName = String(input?.brandName || "").trim();
  if (!brandName) {
    throw createHttpError("brand_strategy_brand_name_required", 400);
  }
  if (brandName.length > 120) {
    throw createHttpError("brand_strategy_brand_name_too_long", 400);
  }
  const industry = String(input?.industry || "general").trim() || "general";
  const targetAudience = String(input?.targetAudience || "").trim();
  const businessGoal = String(input?.businessGoal || "").trim();
  const tone = String(input?.tone || "專業親切").trim() || "專業親切";
  const constraints = String(input?.constraints || "").trim();
  const notes = String(input?.notes || "").trim();
  const keywords = normalizeBrandStrategyKeywords(input?.keywords);
  if (industry.length > 80) {
    throw createHttpError("brand_strategy_industry_too_long", 400);
  }
  if (targetAudience.length > 200) {
    throw createHttpError("brand_strategy_target_audience_too_long", 400);
  }
  if (businessGoal.length > 300) {
    throw createHttpError("brand_strategy_business_goal_too_long", 400);
  }
  if (tone.length > 80) {
    throw createHttpError("brand_strategy_tone_too_long", 400);
  }
  if (constraints.length > 400) {
    throw createHttpError("brand_strategy_constraints_too_long", 400);
  }
  if (notes.length > 1000) {
    throw createHttpError("brand_strategy_notes_too_long", 400);
  }
  return {
    brandName,
    industry,
    targetAudience,
    businessGoal,
    tone,
    keywords,
    constraints,
    notes
  };
}

function normalizeBrandStrategyKeywords(input) {
  const values = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\n,，]/)
        .map((item) => String(item || "").trim())
        .filter(Boolean);
  const normalized = [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
  if (normalized.length > 20) {
    throw createHttpError("brand_strategy_keywords_too_many", 400);
  }
  if (normalized.some((item) => item.length > 40)) {
    throw createHttpError("brand_strategy_keyword_too_long", 400);
  }
  return normalized;
}

function normalizeBrandStrategyIntakeRow(row) {
  return {
    id: String(row?.id || "").trim(),
    tenantId: String(row?.tenantId || "").trim(),
    brandName: String(row?.brandName || "").trim(),
    industry: String(row?.industry || "general").trim() || "general",
    targetAudience: String(row?.targetAudience || "").trim(),
    businessGoal: String(row?.businessGoal || "").trim(),
    tone: String(row?.tone || "專業親切").trim() || "專業親切",
    keywords: Array.isArray(row?.keywords)
      ? row.keywords.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    constraints: String(row?.constraints || "").trim(),
    notes: String(row?.notes || "").trim(),
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString()
  };
}

function normalizeBrandStrategyPlanRow(row) {
  const source = row?.planJson && typeof row.planJson === "object" ? row.planJson : {};
  const createdAtIso = normalizeIsoTimestamp(row?.createdAt, "");
  const generatedAtIso = normalizeIsoTimestamp(source?.generatedAt, createdAtIso);
  return {
    id: String(row?.id || "").trim(),
    tenantId: String(row?.tenantId || "").trim(),
    intakeId: String(row?.intakeId || source.intakeId || "").trim(),
    title: String(source?.title || "").trim(),
    summary: String(source?.summary || "").trim(),
    algorithmSignals: Array.isArray(source?.algorithmSignals)
      ? source.algorithmSignals.map((signal) => ({
          name: String(signal?.name || "").trim(),
          action: String(signal?.action || "").trim()
        }))
      : [],
    weeklyCadence: {
      reels: Number(source?.weeklyCadence?.reels || 0),
      feed: Number(source?.weeklyCadence?.feed || 0),
      story: Number(source?.weeklyCadence?.story || 0)
    },
    contentPillars: Array.isArray(source?.contentPillars)
      ? source.contentPillars.map((pillar) => ({
          name: String(pillar?.name || "").trim(),
          why: String(pillar?.why || "").trim(),
          cta: String(pillar?.cta || "").trim()
        }))
      : [],
    copyFramework: {
      voice: String(source?.copyFramework?.voice || "").trim(),
      hookTemplates: Array.isArray(source?.copyFramework?.hookTemplates)
        ? source.copyFramework.hookTemplates.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      ctaTemplates: Array.isArray(source?.copyFramework?.ctaTemplates)
        ? source.copyFramework.ctaTemplates.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      captionStructure: Array.isArray(source?.copyFramework?.captionStructure)
        ? source.copyFramework.captionStructure.map((value) => String(value || "").trim()).filter(Boolean)
        : []
    },
    imagePromptFramework: {
      styleDirection: String(source?.imagePromptFramework?.styleDirection || "").trim(),
      prompts: Array.isArray(source?.imagePromptFramework?.prompts)
        ? source.imagePromptFramework.prompts.map((prompt) => ({
            scenario: String(prompt?.scenario || "").trim(),
            prompt: String(prompt?.prompt || "").trim()
          }))
        : []
    },
    executionChecklist: Array.isArray(source?.executionChecklist)
      ? source.executionChecklist.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    generatedAt: generatedAtIso,
    createdAt: createdAtIso,
    createdBy: String(row?.createdBy || "system").trim() || "system"
  };
}

function normalizeIsoTimestamp(value, fallback = "") {
  const raw = String(value || "").trim();
  if (raw) {
    const parsedMs = Date.parse(raw);
    if (Number.isFinite(parsedMs)) {
      return new Date(parsedMs).toISOString();
    }
  }
  const fallbackRaw = String(fallback || "").trim();
  if (fallbackRaw) {
    const fallbackMs = Date.parse(fallbackRaw);
    if (Number.isFinite(fallbackMs)) {
      return new Date(fallbackMs).toISOString();
    }
  }
  return new Date().toISOString();
}

function buildBrandStrategyPlanPayload({ tenantId, intake, posts, products }) {
  const pendingPosts = posts.filter((item) => String(item?.status || "").trim() !== "已發佈").length;
  const topProducts = products
    .slice(0, 3)
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean);
  const keywordText = intake.keywords.length > 0 ? intake.keywords.join(" / ") : "品牌核心關鍵詞";
  const industryLabel = intake.industry || inferIndustryKey({ tenantId, posts, products });
  return {
    intakeId: intake.id,
    title: `${intake.brandName} IG 客製成長策略`,
    summary: `以 ${intake.brandName} 的「${industryLabel}」定位，採用 Reels 優先 + 收藏導向內容 + DM 收單節奏，先穩定互動再放大轉換。`,
    algorithmSignals: [
      {
        name: "觀看完成率",
        action: "前 3 秒先丟痛點或對比畫面，Reels 控制在 15-30 秒。"
      },
      {
        name: "收藏/分享率",
        action: "每週至少 2 篇可保存內容（清單、步驟、避坑）。"
      },
      {
        name: "互動回覆速度",
        action: "留言與私訊 12 小時內回覆，並使用 CTA 導向下一步。"
      }
    ],
    weeklyCadence: {
      reels: 3,
      feed: 2,
      story: 5
    },
    contentPillars: [
      {
        name: "痛點解法",
        why: `以目標客群「${intake.targetAudience || "核心受眾"}」的常見問題切入，提升停留與收藏。`,
        cta: "留言關鍵字索取完整方案"
      },
      {
        name: "成果證據",
        why: "透過前後對比、使用情境與數據，建立信任與轉單動機。",
        cta: "私訊領取案例細節"
      },
      {
        name: "成交推進",
        why: `圍繞商業目標「${intake.businessGoal || "提升詢單與成交"}」設計連續 CTA。`,
        cta: "回覆預算與需求，獲得客製建議"
      }
    ],
    copyFramework: {
      voice: intake.tone,
      hookTemplates: [
        `你也遇到「${intake.targetAudience || "這類客群"}」最常卡住的這個問題嗎？`,
        `先別急著買，${intake.brandName} 先教你 3 個不踩雷判斷。`,
        `為了達成「${intake.businessGoal || "成長目標"}」，這 1 個內容節奏一定要先做。`
      ],
      ctaTemplates: [
        "留言關鍵字，我把可直接套用的版本貼給你。",
        "私訊我們你的情境與預算，回覆你最快可執行方案。",
        "收藏這篇，下一次照表執行就好。"
      ],
      captionStructure: [
        "Hook（1 句痛點/對比）",
        "Value（3 個可執行重點）",
        "Proof（案例或情境證據）",
        "CTA（留言/私訊下一步）"
      ]
    },
    imagePromptFramework: {
      styleDirection: `${intake.tone}、高辨識品牌視覺、強調 ${keywordText}`,
      prompts: [
        {
          scenario: "Reels 開場首幀",
          prompt: `Instagram Reels cover, brand ${intake.brandName}, industry ${industryLabel}, bold subject, high contrast, clear focal point, text-safe composition, theme ${keywordText}, cinematic lighting, ultra detailed`
        },
        {
          scenario: "Feed 輪播教學圖",
          prompt: `Instagram carousel slide, educational style, concise visual hierarchy, brand ${intake.brandName}, audience ${intake.targetAudience || "general"}, include before-after storytelling, warm tone, clean layout`
        },
        {
          scenario: "Story 互動導購",
          prompt: `Instagram Story visual, conversational and interactive, poll-friendly layout, brand ${intake.brandName}, CTA-oriented composition, mobile-first framing, clear conversion intent`
        }
      ]
    },
    executionChecklist: [
      `本週排程 ${pendingPosts > 0 ? "先消化既有草稿並" : ""}新增 ${3 + 2} 篇主內容（Reels/Feed）`,
      "每篇貼文掛上單一核心 CTA，避免分散行動",
      `優先推進商品：${topProducts.join("、") || "依本週主力商品"}`,
      "每 7 天回顧 Reach/Saves/DMs，保留高表現主題並淘汰低效 Hook",
      `限制條件提醒：${intake.constraints || "目前無額外限制，可先以速度驗證"}`
    ],
    generatedAt: new Date().toISOString()
  };
}

function inferIndustryKey({ tenantId, posts, products }) {
  const tenantText = `${String(tenantId || "")} ${products.map((item) => item?.name || "").join(" ")} ${posts
    .map((item) => item?.title || "")
    .join(" ")}`.toLowerCase();
  if (/(coffee|espresso|latte|cafe|咖啡)/.test(tenantText)) {
    return "coffee";
  }
  if (/(furniture|sofa|chair|table|desk|木|桌|椅|邊几|家具)/.test(tenantText)) {
    return "furniture";
  }
  return "general";
}

function buildContentUpgradePackagePayload({ industryKey, posts, products }) {
  const profile = INDUSTRY_PROFILES[industryKey] || INDUSTRY_PROFILES.general;
  const pendingPosts = posts.filter((item) => String(item?.status || "").trim() !== "已發佈").length;
  const topProducts = products
    .slice(0, 3)
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean);
  return {
    algorithmMode: {
      key: "adaptive_refresh_v2",
      label: "演算法自適應模式 V2",
      summary: "依互動衰退與主題疲勞自動刷新題材節奏，避免內容老化。",
      checkpoints: [
        "每 7 天重新分配 Reels / Feed / Story 比例",
        "按 Hook 點擊與完播表現淘汰低效開場",
        "根據私訊意圖熱度調整下週主題"
      ]
    },
    industry: {
      key: profile.key,
      label: profile.label,
      strategy: profile.strategy,
      pillars: [...profile.pillars]
    },
    yearlyCopyBundle: {
      title: "一年份貼文文案大改版",
      summary: `已根據 ${profile.label} 產生 12 組月主題，含腳本 / 圖片 / 短影音拍攝步驟。`,
      monthlyTopics: buildMonthlyTopics(profile)
    },
    premium: {
      strategyCourse: [
        "趨勢內容策略影音課（60 分鐘）",
        "轉單節奏拆解課（Hook → DM → 成交）"
      ],
      topicPacks: profile.topicPacks,
      hookScripts: profile.hookScripts,
      dmAutomation: [
        "高成交自動私訊模板（首問、追問、成交收尾）",
        "冷掉對話喚回腳本（48h / 7d 兩段式）"
      ],
      aiPromptPack: [
        "貼文主題生成 Prompt",
        "短影音分鏡 Prompt",
        "客服 DM 回覆 Prompt"
      ]
    },
    packages: [
      {
        id: "pkg_algo_refresh",
        title: "演算法刷新包",
        summary: "升級為自適應內容節奏，讓內容跟著平台與用戶習慣更新。",
        included: ["更新發佈節奏", "Hook 測試清單", "下週優先題材"],
        recommendedFor: pendingPosts > 6 ? "待發佈內容較多，先優化排序與節奏" : "穩定維運時持續提升觸及"
      },
      {
        id: "pkg_industry_vertical",
        title: `${profile.label}專屬內容包`,
        summary: "從通用模板升級為產業專屬腳本與轉換策略。",
        included: ["產業內容主軸", "情境式 CTA", "轉單關鍵話術"],
        recommendedFor: `目前偵測產業：${profile.label}`
      },
      {
        id: "pkg_yearly_copy_rebuild",
        title: "一年文案重建包",
        summary: "12 個月主題與腳本一次到位，降低內容枯竭。",
        included: ["月主題地圖", "圖片拍攝清單", "短影音腳本"],
        recommendedFor: "想把內容排程與執行流程標準化"
      },
      {
        id: "pkg_premium_growth_suite",
        title: "高價值增長資產包",
        summary: "補齊策略課、主題包、Hook 腳本、DM 自動化與 AI 指令包。",
        included: ["策略影音課", "主題包", "DM 自動化", "AI Prompt"],
        recommendedFor: "希望同時提升產量、互動率與成交率"
      }
    ],
    summary: {
      postCount: posts.length,
      productCount: products.length,
      pendingPosts,
      topProducts,
      generatedAt: new Date().toISOString()
    }
  };
}

function buildMonthlyTopics(profile) {
  return MONTHLY_TOPIC_BLUEPRINT.map((item) => ({
    month: item.month,
    theme: `${profile.monthlyThemePrefix}${item.theme}`,
    hook: item.hook,
    videoStep: item.videoStep,
    cta: item.cta
  }));
}

function buildAppliedUpgradePlan(selectedPackage, payload) {
  const plan = UPGRADE_APPLY_PLANS[selectedPackage.id];
  if (!plan) {
    throw createHttpError("content_upgrade_package_not_found", 404);
  }
  const industry = payload?.industry || { key: "general", label: "通用" };
  const draftPosts = buildUpgradeDraftPosts({ selectedPackage, payload, plan });
  const generatedTasks = buildUpgradeExecutionTasks({ selectedPackage, payload, draftPosts });
  return {
    packageId: selectedPackage.id,
    title: selectedPackage.title,
    summary: selectedPackage.summary,
    industry: {
      key: industry.key,
      label: industry.label
    },
    actions: plan.actions.map((item) => String(item)),
    deliverables: plan.deliverables.map((item) => String(item)),
    sampleHook: plan.sampleHook,
    sampleDm: plan.sampleDm,
    generatedTasks,
    draftPosts,
    executionSummary: {
      taskCount: generatedTasks.length,
      draftCount: draftPosts.length,
      generatedAt: new Date().toISOString()
    },
    appliedAt: new Date().toISOString()
  };
}

function buildContentUpgradeBatchKpiPayload(posts, batchId = "") {
  const selectedBatchId = String(batchId || "").trim();
  const availableBatchIds = collectBatchIdsFromPosts(posts);
  const filtered = posts.filter((post) => {
    if (selectedBatchId) {
      return hasBatchTag(post, selectedBatchId);
    }
    return postHasAnyBatchTag(post);
  });
  const metrics = summarizeTenantMetrics(filtered);
  return {
    batchId: selectedBatchId || "all",
    batchCount: availableBatchIds.length,
    availableBatchIds,
    postCount: filtered.length,
    metrics,
    byType: countByField(filtered, (item) => String(item?.type || "unknown").trim() || "unknown"),
    byStatus: countByField(filtered, (item) => String(item?.status || "unknown").trim() || "unknown"),
    topPosts: filtered
      .map((item) => ({
        id: String(item?.id || ""),
        title: String(item?.title || ""),
        status: String(item?.status || ""),
        type: String(item?.type || ""),
        metrics: {
          reach: Number(item?.metrics?.reach || 0),
          saves: Number(item?.metrics?.saves || 0),
          dms: Number(item?.metrics?.dms || 0),
          clicks: Number(item?.metrics?.clicks || 0),
          orders: Number(item?.metrics?.orders || 0)
        }
      }))
      .sort((a, b) => computePostScore(b.metrics) - computePostScore(a.metrics))
      .slice(0, 5),
    generatedAt: new Date().toISOString()
  };
}

function buildContentUpgradeMonthlyMissionPayload(payload, month = "") {
  const missionMonth = normalizeMonthlyMissionMonth(month);
  const topics = Array.isArray(payload?.yearlyCopyBundle?.monthlyTopics) ? payload.yearlyCopyBundle.monthlyTopics : [];
  const topic =
    topics.find((item) => String(item?.month || "") === missionMonth) ||
    topics[0] ||
    { month: missionMonth, theme: "本月主題", hook: "先從本月最重要痛點切入", videoStep: "5-15 秒短影音示範", cta: "留言關鍵字領取清單" };
  const primaryPackage = Array.isArray(payload?.packages) ? payload.packages[0] : null;
  const premium = payload?.premium || {};
  return {
    month: missionMonth,
    industry: {
      key: String(payload?.industry?.key || "general"),
      label: String(payload?.industry?.label || "通用")
    },
    objective: `本月聚焦 ${String(topic.theme || "主題執行")}，透過高互動開場與私訊轉換提升成效。`,
    topic: {
      month: String(topic?.month || missionMonth),
      theme: String(topic?.theme || ""),
      hook: String(topic?.hook || ""),
      videoStep: String(topic?.videoStep || ""),
      cta: String(topic?.cta || "")
    },
    recommendedPackage: primaryPackage
      ? {
          id: String(primaryPackage.id || ""),
          title: String(primaryPackage.title || ""),
          summary: String(primaryPackage.summary || "")
        }
      : null,
    checklist: [
      `完成 1 支 ${String(topic.theme || "主題")} Reels 腳本`,
      "套用 1 則高成交 DM 腳本於客服流程",
      "回顧本月前半 KPI 並調整下一批內容"
    ],
    assets: {
      hookScripts: Array.isArray(premium?.hookScripts) ? premium.hookScripts.slice(0, 5).map((item) => String(item || "").trim()).filter(Boolean) : [],
      topicPacks: Array.isArray(premium?.topicPacks) ? premium.topicPacks.slice(0, 5).map((item) => String(item || "").trim()).filter(Boolean) : [],
      dmScripts: Array.isArray(premium?.dmAutomation) ? premium.dmAutomation.slice(0, 3).map((item) => String(item || "").trim()).filter(Boolean) : [],
      aiPrompts: Array.isArray(premium?.aiPromptPack) ? premium.aiPromptPack.slice(0, 5).map((item) => String(item || "").trim()).filter(Boolean) : []
    },
    generatedAt: new Date().toISOString()
  };
}

function normalizeSharedReportBatchId(value) {
  const batchId = String(value || "").trim();
  if (!batchId || batchId === "all") {
    return "";
  }
  if (batchId.length > 120) {
    throw createHttpError("shared_report_batch_id_too_long", 400);
  }
  return batchId;
}

function buildSharedReportExpiry(expiresInDays) {
  const days = Number(expiresInDays ?? 7);
  if (!Number.isFinite(days) || days < 1 || days > 30) {
    throw createHttpError("shared_report_expiry_invalid", 400);
  }
  return new Date(Date.now() + Math.trunc(days) * 24 * 60 * 60 * 1000).toISOString();
}

function buildSharedReportToken() {
  return randomUUID().replace(/-/g, "").slice(0, 24);
}

function normalizeSharedReportLinkRow(row) {
  return {
    id: String(row?.id || ""),
    tenantId: String(row?.tenantId || ""),
    token: String(row?.token || ""),
    reportType: String(row?.reportType || "content_upgrade_batch"),
    scope: row?.scope && typeof row.scope === "object" ? { ...row.scope } : { batchId: "all" },
    expiresAt: row?.expiresAt ? new Date(row.expiresAt).toISOString() : new Date().toISOString(),
    createdBy: String(row?.createdBy || ""),
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString()
  };
}

function normalizeBatchIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw createHttpError("batch_ids_required", 400);
  }
  const normalized = [...new Set(ids.map((item) => String(item || "").trim()).filter(Boolean))];
  if (normalized.length === 0) {
    throw createHttpError("batch_ids_required", 400);
  }
  if (normalized.length > 50) {
    throw createHttpError("batch_ids_too_many", 400);
  }
  return normalized;
}

function normalizePostBatchStatus(value) {
  const status = String(value || "").trim();
  if (!["草稿", "待拍", "待上架", "已發佈"].includes(status)) {
    throw createHttpError("post_status_invalid", 400);
  }
  return status;
}

function normalizeProductBatchStatus(value) {
  const status = String(value || "").trim();
  if (!["active", "paused", "archived"].includes(status)) {
    throw createHttpError("product_status_invalid", 400);
  }
  return status;
}

function buildBatchMutationSummary(results, targetStatus) {
  const successCount = results.filter((item) => item.ok).length;
  return {
    targetStatus,
    requestedCount: results.length,
    successCount,
    failedCount: results.length - successCount,
    results
  };
}

function buildMonthlyMissionDraftPosts(mission) {
  const topic = mission?.topic || {};
  const month = String(mission?.month || "01").trim() || "01";
  const packageId = String(mission?.recommendedPackage?.id || "monthly_mission").trim() || "monthly_mission";
  const checklist = Array.isArray(mission?.checklist) ? mission.checklist : [];
  return [
    {
      date: "",
      week: "W1",
      type: "reels",
      status: "draft",
      title: `${month}月任務｜${String(topic.theme || "主題短影音")}`,
      script: `${String(topic.hook || "")}
${String(topic.videoStep || "")}
任務重點：${checklist[0] || String(mission?.objective || "")}`,
      cta: String(topic.cta || "留言關鍵字索取完整方案"),
      link: "",
      triggerTags: [packageId.replace(/^pkg_/, ""), `mission:${month}`, "monthly-mission"],
      metrics: { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 }
    },
    {
      date: "",
      week: "W2",
      type: "feed",
      status: "draft",
      title: `${month}月任務｜${String(topic.theme || "主題圖文")}`,
      script: `${String(mission?.objective || "")}
執行清單：${checklist.join(" / ")}`,
      cta: String(topic.cta || "私訊領取本月清單"),
      link: "",
      triggerTags: [packageId.replace(/^pkg_/, ""), `mission:${month}`, "monthly-mission"],
      metrics: { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 }
    }
  ];
}

function normalizeMonthlyMissionMonth(value) {
  const normalized = String(value || "").trim();
  if (/^(0[1-9]|1[0-2])$/.test(normalized)) {
    return normalized;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
    return String(Math.trunc(numeric)).padStart(2, "0");
  }
  return String(new Date().getMonth() + 1).padStart(2, "0");
}

function collectBatchIdsFromPosts(posts) {
  const values = new Set();
  for (const post of posts || []) {
    for (const tag of post?.triggerTags || []) {
      const value = extractBatchIdFromTag(tag);
      if (value) {
        values.add(value);
      }
    }
  }
  return [...values];
}

function postHasAnyBatchTag(post) {
  return (post?.triggerTags || []).some((tag) => Boolean(extractBatchIdFromTag(tag)));
}

function hasBatchTag(post, batchId) {
  return (post?.triggerTags || []).some((tag) => extractBatchIdFromTag(tag) === batchId);
}

function extractBatchIdFromTag(tag) {
  const text = String(tag || "").trim();
  if (!text.startsWith("batch:")) {
    return "";
  }
  return text.slice("batch:".length).trim();
}

function countByField(items, keySelector) {
  const map = new Map();
  for (const item of items || []) {
    const key = String(keySelector(item) || "unknown").trim() || "unknown";
    map.set(key, Number(map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function summarizeTenantMetrics(posts) {
  return posts.reduce(
    (acc, item) => ({
      reach: acc.reach + Number(item?.metrics?.reach || 0),
      saves: acc.saves + Number(item?.metrics?.saves || 0),
      dms: acc.dms + Number(item?.metrics?.dms || 0),
      clicks: acc.clicks + Number(item?.metrics?.clicks || 0),
      orders: acc.orders + Number(item?.metrics?.orders || 0)
    }),
    { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 }
  );
}

function computePostScore(metrics) {
  return Number(metrics?.orders || 0) * 50 + Number(metrics?.dms || 0) * 10 + Number(metrics?.clicks || 0) * 5 + Number(metrics?.saves || 0) * 2 + Number(metrics?.reach || 0);
}

function buildUpgradeExecutionTasks({ selectedPackage, payload, draftPosts }) {
  const productHint = Array.isArray(payload?.summary?.topProducts) && payload.summary.topProducts.length > 0
    ? payload.summary.topProducts[0]
    : payload?.industry?.label || "主力商品";
  return [
    {
      id: `task_upgrade_${selectedPackage.id}_01`,
      type: "upgrade",
      priority: "high",
      title: `套用${selectedPackage.title}第一波內容`,
      hint: `先完成 ${draftPosts[0]?.title || productHint} 的素材與上架`,
      resourceId: draftPosts[0]?.id || ""
    },
    {
      id: `task_upgrade_${selectedPackage.id}_02`,
      type: "dm",
      priority: "medium",
      title: "同步更新高成交 DM 腳本",
      hint: "把 sample DM 套進客服/成交流程",
      resourceId: selectedPackage.id
    },
    {
      id: `task_upgrade_${selectedPackage.id}_03`,
      type: "analysis",
      priority: "medium",
      title: "安排 7 天成效回顧",
      hint: `觀察 ${payload?.industry?.label || "內容策略"} 的 Hook 與私訊表現`,
      resourceId: selectedPackage.id
    }
  ];
}

function buildUpgradeDraftPosts({ selectedPackage, payload, plan }) {
  const topics = Array.isArray(payload?.yearlyCopyBundle?.monthlyTopics) ? payload.yearlyCopyBundle.monthlyTopics.slice(0, 3) : [];
  const topProducts = Array.isArray(payload?.summary?.topProducts) ? payload.summary.topProducts : [];
  const productLine = topProducts.length > 0 ? topProducts.join("、") : `${payload?.industry?.label || "主力產品"}`;
  return topics.map((topic, index) => ({
    id: `draft_${selectedPackage.id}_${index + 1}`,
    date: "",
    week: `W${Math.min(index + 1, 4)}`,
    type: index === 0 ? "reels" : index === 1 ? "feed" : "story",
    status: "draft",
    title: `${topic.theme}｜${productLine}`,
    script: `${topic.hook}\n${topic.videoStep}\n重點產品：${productLine}\n執行：${plan.actions[index % plan.actions.length]}`,
    cta: topic.cta || "留言關鍵字或私訊索取完整方案",
    link: "",
    triggerTags: [selectedPackage.id.replace(/^pkg_/, ""), payload?.industry?.key || "general", "upgrade"],
    metrics: {
      reach: 0,
      saves: 0,
      dms: 0,
      clicks: 0,
      orders: 0
    }
  }));
}

function classifyIntentFromText(question, selectedIntent) {
  const normalizedSelected = normalizeAllowedIntent(selectedIntent);
  if (normalizedSelected && normalizedSelected !== "other") {
    return {
      intent: normalizedSelected,
      confidence: 0.92,
      source: "selected"
    };
  }

  const lower = String(question || "").toLowerCase();
  const rules = [
    { intent: "price", keywords: ["多少", "價格", "費用", "預算", "便宜", "貴", "price", "cost"] },
    { intent: "size", keywords: ["尺寸", "多大", "寬", "高", "長", "size", "cm"] },
    { intent: "material", keywords: ["材質", "木", "布", "metal", "wood", "fabric", "皮"] },
    { intent: "shipping", keywords: ["運費", "幾天", "到貨", "配送", "shipping", "delivery"] },
    { intent: "style", keywords: ["風格", "搭配", "顏色", "style", "look"] }
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => lower.includes(keyword))) {
      return {
        intent: rule.intent,
        confidence: 0.82,
        source: "rule"
      };
    }
  }

  return {
    intent: "other",
    confidence: 0.48,
    source: "fallback"
  };
}

function normalizeAllowedIntent(value) {
  const intent = String(value || "").trim().toLowerCase();
  if (DM_INTENT_ALLOWLIST.has(intent)) {
    return intent;
  }
  return "other";
}

function pickRecommendedProducts(products, intent) {
  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }
  if (intent === "price") {
    return [...products]
      .sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
      .slice(0, 3)
      .map((item) => item.name)
      .filter(Boolean);
  }
  if (intent === "size") {
    return products
      .filter((item) => String(item.size || "").trim())
      .slice(0, 3)
      .map((item) => item.name)
      .filter(Boolean);
  }
  if (intent === "material") {
    return products
      .filter((item) => String(item.material || "").trim())
      .slice(0, 3)
      .map((item) => item.name)
      .filter(Boolean);
  }
  return products.slice(0, 3).map((item) => item.name).filter(Boolean);
}

function buildReplyScript({ question, postTitle, postLink, intent, recommendedProducts }) {
  const intentLabel = mapIntentLabel(intent);
  const recommendedLine = recommendedProducts.length > 0 ? recommendedProducts.join("、") : "可再依需求推薦";
  return [
    `嗨，感謝你私訊！我先幫你整理「${intentLabel}」的重點 🙌`,
    question ? `你提到：${question}` : "我先幫你快速整理重點：",
    `推薦優先：${recommendedLine}`,
    postTitle ? `對應貼文：${postTitle}` : "",
    `連結參考：${postLink || "待補"}`,
    "你回我『空間尺寸 + 預算』，我可直接給你精準配置建議。"
  ]
    .filter(Boolean)
    .join("\n");
}

function mapIntentLabel(intent) {
  const map = {
    price: "價格",
    size: "尺寸",
    material: "材質",
    shipping: "配送",
    style: "風格",
    other: "其他"
  };
  return map[intent] || "需求";
}

function normalizeCommentRow(row) {
  return {
    id: String(row?.id || ""),
    resourceType: String(row?.resourceType || "").trim(),
    resourceId: String(row?.resourceId || "").trim(),
    authorId: String(row?.authorId || "").trim(),
    body: String(row?.body || "").trim(),
    mentions: normalizeCommentMentions(row?.mentions),
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString()
  };
}

function normalizeCommentMentions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function parseMentionsFromText(body) {
  const matches = String(body || "").match(/@([a-zA-Z0-9_]+)/g) || [];
  const values = matches
    .map((item) => String(item || "").replace(/^@/, "").trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("u_") ? item : `u_${item}`));
  return [...new Set(values)].slice(0, 10);
}

const DM_INTENT_ALLOWLIST = new Set(["price", "size", "material", "shipping", "style", "other"]);

function normalizeAlertRuleInput(input) {
  const metricKey = String(input?.metricKey || "").trim().toLowerCase();
  if (!ALERT_METRIC_ALLOWLIST.has(metricKey)) {
    throw createHttpError("alert_metric_key_invalid", 400);
  }
  const operator = String(input?.operator || "").trim().toLowerCase();
  if (!ALERT_OPERATOR_ALLOWLIST.has(operator)) {
    throw createHttpError("alert_operator_invalid", 400);
  }
  const threshold = Number(input?.threshold);
  if (!Number.isFinite(threshold)) {
    throw createHttpError("alert_threshold_invalid", 400);
  }
  return {
    id: String(input?.id || "").trim(),
    metricKey,
    operator,
    threshold,
    isActive: input?.isActive !== false
  };
}

function normalizeAlertRuleRow(row) {
  return {
    id: String(row?.id || ""),
    metricKey: String(row?.metricKey || ""),
    operator: String(row?.operator || ""),
    threshold: Number(row?.threshold || 0),
    isActive: row?.isActive !== false,
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString()
  };
}

function normalizeAlertMetrics(row) {
  return {
    reach: Number(row?.reach || 0),
    saves: Number(row?.saves || 0),
    dms: Number(row?.dms || 0),
    clicks: Number(row?.clicks || 0),
    orders: Number(row?.orders || 0)
  };
}

function evaluateAlertRule(rule, metrics) {
  const observed = Number(metrics?.[rule.metricKey] || 0);
  if (!matchThreshold(observed, rule.operator, Number(rule.threshold || 0))) {
    return null;
  }
  return {
    id: randomUUID(),
    ruleId: rule.id,
    metricKey: rule.metricKey,
    operator: rule.operator,
    threshold: Number(rule.threshold || 0),
    observed,
    severity: "warning",
    message: `指標 ${rule.metricKey} 目前 ${observed}，觸發規則 ${rule.operator} ${rule.threshold}`,
    createdAt: new Date().toISOString()
  };
}

function matchThreshold(observed, operator, threshold) {
  if (operator === "lt") {
    return observed < threshold;
  }
  if (operator === "lte") {
    return observed <= threshold;
  }
  if (operator === "gt") {
    return observed > threshold;
  }
  if (operator === "gte") {
    return observed >= threshold;
  }
  return false;
}

const ALERT_METRIC_ALLOWLIST = new Set(["reach", "saves", "dms", "clicks", "orders"]);
const ALERT_OPERATOR_ALLOWLIST = new Set(["lt", "lte", "gt", "gte"]);

const INDUSTRY_PROFILES = {
  furniture: {
    key: "furniture",
    label: "家具家居",
    strategy: "強化空間前後對比、尺寸解法與生活情境，提升收藏與私訊詢價。",
    pillars: ["小坪數改造", "材質與耐用度", "租屋族預算配置"],
    topicPacks: ["小空間收納改造", "租屋質感升級", "一桌多用生活提案"],
    hookScripts: ["3 坪也能做出高級感？先看這 1 個角落", "預算 3000 內，這組搭配最不踩雷"],
    monthlyThemePrefix: "家居"
  },
  coffee: {
    key: "coffee",
    label: "咖啡餐飲",
    strategy: "以風味教育 + 現場氛圍 + 限時活動，提高來店與回購。",
    pillars: ["風味知識", "吧台職人感", "檔期活動轉單"],
    topicPacks: ["豆單故事包", "特調製程包", "來店互動問答包"],
    hookScripts: ["同一支豆，為什麼今天喝起來更甜？", "這杯是熟客回購率最高的特調"],
    monthlyThemePrefix: "咖啡"
  },
  general: {
    key: "general",
    label: "通用零售",
    strategy: "以需求情境、使用成果與常見疑問回覆構成穩定轉換漏斗。",
    pillars: ["需求痛點", "使用成果", "成交引導"],
    topicPacks: ["新手入門包", "常見問題包", "限時活動包"],
    hookScripts: ["先別急著買，先看這 3 個判斷重點", "90% 新客都會先問這個問題"],
    monthlyThemePrefix: "成長"
  }
};

const MONTHLY_TOPIC_BLUEPRINT = [
  { month: "01", theme: "開年需求盤點", hook: "今年第一支先解決最痛點", videoStep: "前後對比 + 3 秒痛點鏡頭", cta: "留言你的今年目標" },
  { month: "02", theme: "情境搭配提案", hook: "這組搭配直接複製就好", videoStep: "情境分鏡 + 近景細節", cta: "私訊拿完整清單" },
  { month: "03", theme: "常見錯誤破解", hook: "別再這樣做，轉換會掉", videoStep: "錯誤示範 + 正確示範", cta: "收藏備忘" },
  { month: "04", theme: "主力產品季節應用", hook: "這季最該先做這件事", videoStep: "季節化場景 + 使用步驟", cta: "留言「季節」拿腳本" },
  { month: "05", theme: "口碑證據月", hook: "最多人回購的是這個", videoStep: "截圖證據 + 使用者回饋", cta: "私訊看完整案例" },
  { month: "06", theme: "高效懶人方案", hook: "不用想，照這套就好", videoStep: "清單式拍法 + 快切", cta: "留言「懶人包」" },
  { month: "07", theme: "中期調整優化", hook: "數據下滑先改這兩點", videoStep: "數據圖 + 對應優化", cta: "下載優化清單" },
  { month: "08", theme: "新品預熱與名單", hook: "新品還沒上就先排隊", videoStep: "預告鏡頭 + 倒數元素", cta: "私訊登記優先通知" },
  { month: "09", theme: "Q&A 轉單月", hook: "客人最常問的 5 題一次答", videoStep: "問答字幕 + 實拍佐證", cta: "留言你的問題" },
  { month: "10", theme: "活動檔期衝刺", hook: "這檔期不做會錯過什麼", videoStep: "活動亮點 + 時限提示", cta: "點連結搶先卡位" },
  { month: "11", theme: "成交加速月", hook: "最後一哩就差這句話", videoStep: "DM 對話拆解 + CTA", cta: "私訊拿成交話術" },
  { month: "12", theme: "年度回顧與續購", hook: "今年最值得複製的 3 件事", videoStep: "回顧集錦 + 明年預告", cta: "留言想看明年主題" }
];

const UPGRADE_APPLY_PLANS = {
  pkg_algo_refresh: {
    actions: ["重排未來 14 天內容節奏", "替換低效 Hook 開場", "建立每週回顧指標清單"],
    deliverables: ["節奏排程表", "Hook A/B 測試表", "週檢核模板"],
    sampleHook: "這支影片前 3 秒不抓人，觸及會直接掉。",
    sampleDm: "我幫你整理了最適合你目前狀況的內容節奏，回覆『節奏』我直接貼給你。"
  },
  pkg_industry_vertical: {
    actions: ["切換為產業專屬題材池", "重寫 CTA 與成交語句", "建立產業 FAQ 回覆模板"],
    deliverables: ["產業主題池", "CTA 話術包", "FAQ 回覆包"],
    sampleHook: "通用模板先放一邊，這才是你這個產業真的會轉單的寫法。",
    sampleDm: "你這個產業最容易成交的其實是這個切入點，我把完整腳本給你。"
  },
  pkg_yearly_copy_rebuild: {
    actions: ["建立 12 月主題地圖", "完成每月 4 支腳本草案", "補齊短影音拍攝步驟"],
    deliverables: ["年度主題地圖", "48 支腳本骨架", "拍攝 SOP"],
    sampleHook: "今年只要照這個月主題跑，內容不會再斷。",
    sampleDm: "我把你接下來一整年的主題都排好了，直接照表執行就行。"
  },
  pkg_premium_growth_suite: {
    actions: ["導入策略影音課學習節奏", "套用高成交 DM 自動化腳本", "建立 AI 指令包生產流程"],
    deliverables: ["學習地圖", "DM 自動化腳本", "AI 指令工作流"],
    sampleHook: "只靠發文已經不夠，這套是把互動變成交的完整系統。",
    sampleDm: "如果你要的是穩定成交，我可以直接給你『首問→追問→收單』完整自動化模板。"
  }
};

function buildContentUpgradeBatchId(prefix = "batch") {
  return `cu_${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
}
