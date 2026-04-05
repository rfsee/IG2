import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { sendJson, readJsonBody } from "./json.js";
import { requirePermission } from "./rbac.js";
import { resolveTenantContext } from "./tenantContext.js";
import { AUTH_WINDOW_MS, enforceRateLimit } from "./rateLimit.js";
import { writeAudit } from "./audit.js";
import { bootstrapCore } from "./bootstrap.js";
import { createHttpError, normalizeError } from "./errors.js";

const PORT = Number(process.env.PORT || 8793);
const STARTED_AT = new Date();
const APP_VERSION = String(process.env.APP_VERSION || process.env.npm_package_version || "0.1.0");
const AUTH_PASSWORD_MIN_LENGTH = Math.max(Number(process.env.AUTH_PASSWORD_MIN_LENGTH || 10), 8);
const AUTH_REGISTER_ENABLED = parseEnvBoolean(process.env.AUTH_REGISTER_ENABLED, true);
const AUTH_REGISTER_EMAIL_ALLOWLIST_EXACT = buildExactEmailAllowlist(process.env.AUTH_REGISTER_EMAIL_ALLOWLIST);
const AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX = String(process.env.AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX || "").trim();
const AUTH_REGISTER_EMAIL_ALLOWLIST = buildEmailAllowlistMatcher(AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX);
const CORS_ALLOWED_ORIGINS = buildOriginAllowlist(process.env.CORS_ALLOWED_ORIGINS);
const PRODUCT_PREVIEW_CACHE_FILE = new URL("../data/product_preview_cache.json", import.meta.url);
const productPreviewCache = new Map();
let productPreviewCacheLoaded = false;
const services = await bootstrapCore();

if (services.authProvider.kind === "local" && AUTH_REGISTER_ENABLED && CORS_ALLOWED_ORIGINS.length === 0) {
  throw createHttpError("cors_allowed_origins_required_for_public_local_auth", 500);
}

const server = createServer(async (req, res) => {
  try {
    applyCorsHeaders(req, res);
    applySecurityHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      return sendJson(res, 200, {
        ok: true,
        service: "ig-growth-os-core-api",
        message: "IG2 backend is running. Use /health for status.",
        healthUrl: "/health",
        docsHint: "Use the frontend site to interact with the product UI."
      });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "ig-growth-os-core-api",
        status: "healthy",
        timestamp: new Date().toISOString()
      });
    }

    if (req.method === "GET" && url.pathname === "/api/product-preview") {
      await consumeAuthThrottle(services.repository, `public-preview:${String(req.socket?.remoteAddress || "unknown")}`);
      const raw = String(url.searchParams.get("url") || "").trim();
      if (!raw) {
        throw createHttpError("product_preview_url_required", 400);
      }
      const normalized = normalizeProductPreviewUrl(raw);
      if (!normalized) {
        throw createHttpError("product_preview_url_invalid", 400);
      }
      const imageUrl = (await getCachedProductPreview(normalized)) || (await fetchFirstProductImage(normalized));
      if (!imageUrl) {
        throw createHttpError("product_preview_image_not_found", 404);
      }
      await setCachedProductPreview(normalized, imageUrl);
      return sendJson(res, 200, {
        item: {
          sourceUrl: normalized,
          imageUrl
        }
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/reports/shared/")) {
      let token = "";
      try {
        token = decodeURIComponent(url.pathname.replace("/api/reports/shared/", "")).trim();
      } catch (_error) {
        throw createHttpError("shared_report_not_found", 404);
      }
      if (!token) {
        throw createHttpError("shared_report_token_required", 400);
      }
      if (!/^[a-f0-9]{24}$/i.test(token)) {
        throw createHttpError("shared_report_not_found", 404);
      }
      enforceRateLimit(
        {
          tenantId: "public",
          actorId: `shared_report:${String(req.socket?.remoteAddress || "unknown")}`
        },
        "read"
      );
      const link = await services.repository.getSharedReportLinkByToken(token);
      const expiresMs = Date.parse(String(link?.expiresAt || ""));
      if (!link || !Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
        throw createHttpError("shared_report_not_found", 404);
      }
      const batchId = String(link.scope?.batchId || "all").trim();
      const [batchKpi, audits, tenant] = await Promise.all([
        services.repository.getContentUpgradeBatchKpi(link.tenantId, batchId === "all" ? "" : batchId),
        services.repository.listAuditEvents(link.tenantId, { limit: 200, resourceType: "content_upgrade" }),
        services.repository.getTenantById(link.tenantId)
      ]);
      const history = audits
        .filter((event) => isContentUpgradeHistoryAction(event?.action))
        .map((event) => normalizeContentUpgradeHistoryItem(event))
        .filter((item) => (batchId === "all" ? true : item.batchId === batchId))
        .slice(0, 20);
      const publicHistory = history.map((item) => ({
        id: item.id,
        packageId: item.packageId,
        title: item.title,
        action: item.action,
        appliedCount: item.appliedCount,
        draftCount: item.draftCount,
        taskCount: item.taskCount,
        batchId: item.batchId,
        industry: item.industry,
        createdAt: item.createdAt
      }));
      const requestId = String(req.headers["x-request-id"] || randomRequestId());
      const context = {
        actorId: "public_shared_link",
        role: "public",
        tenantId: link.tenantId,
        requestId,
        traceId: String(req.headers["x-trace-id"] || requestId),
        parentSpanId: String(req.headers["x-parent-span-id"] || "")
      };
      await writeAudit(
        services.repository,
        context,
        "reports.shared.view",
        "reports",
        token,
        {
          batchId,
          reportType: String(link.reportType || "content_upgrade_batch"),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        item: {
          token: link.token,
          reportType: link.reportType,
          tenantName: String(tenant?.name || "").trim(),
          batchId,
          expiresAt: link.expiresAt,
          createdAt: link.createdAt,
          batchKpi,
          history: publicHistory
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const remoteAddress = String(req.socket?.remoteAddress || "unknown");
      await consumeAuthThrottle(services.repository, `${remoteAddress}:register:${email || "unknown"}`);
      await consumeAuthThrottle(services.repository, `register-email:${email || "unknown"}`);
      if (!AUTH_REGISTER_ENABLED) {
        throw createHttpError("auth_register_disabled", 403);
      }
      if (AUTH_REGISTER_EMAIL_ALLOWLIST_EXACT.size > 0 && !AUTH_REGISTER_EMAIL_ALLOWLIST_EXACT.has(email)) {
        throw createHttpError("auth_register_email_not_allowed", 403);
      }
      if (AUTH_REGISTER_EMAIL_ALLOWLIST && !AUTH_REGISTER_EMAIL_ALLOWLIST.test(email)) {
        throw createHttpError("auth_register_email_not_allowed", 403);
      }
      const registered = await services.repository.registerUser({
        email,
        password: body.password,
        storeName: body.storeName,
        passwordMinLength: AUTH_PASSWORD_MIN_LENGTH
      });
      const items = await services.repository.listVisibleTenants(registered.actorId);
      const primaryTenant = items[0];
      if (primaryTenant?.tenantId) {
        await writeAudit(
          services.repository,
          {
            actorId: registered.actorId,
            role: String(primaryTenant.role || "owner"),
            tenantId: String(primaryTenant.tenantId),
            requestId: String(req.headers["x-request-id"] || randomRequestId()),
            traceId: String(req.headers["x-trace-id"] || req.headers["x-request-id"] || randomRequestId()),
            parentSpanId: String(req.headers["x-parent-span-id"] || "")
          },
          "auth.register",
          "auth",
          registered.actorId,
          {
            email,
            ...buildRequestMetadata(req, url)
          },
          req.socket?.remoteAddress || ""
        );
      }
      return sendJson(res, 201, await buildAuthResponse(services, registered.actorId, items));
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const remoteAddress = String(req.socket?.remoteAddress || "unknown");
      await consumeAuthThrottle(services.repository, `${remoteAddress}:login:${email || "unknown"}`);
      await consumeAuthThrottle(services.repository, `login-email:${email || "unknown"}`);
      const loggedIn = await services.repository.loginUser({
        email,
        password: body.password,
        passwordMinLength: AUTH_PASSWORD_MIN_LENGTH
      });
      const items = await services.repository.listVisibleTenants(loggedIn.actorId);
      const primaryTenant = items[0];
      if (primaryTenant?.tenantId) {
        await writeAudit(
          services.repository,
          {
            actorId: loggedIn.actorId,
            role: String(primaryTenant.role || "owner"),
            tenantId: String(primaryTenant.tenantId),
            requestId: String(req.headers["x-request-id"] || randomRequestId()),
            traceId: String(req.headers["x-trace-id"] || req.headers["x-request-id"] || randomRequestId()),
            parentSpanId: String(req.headers["x-parent-span-id"] || "")
          },
          "auth.login",
          "auth",
          loggedIn.actorId,
          {
            email,
            ...buildRequestMetadata(req, url)
          },
          req.socket?.remoteAddress || ""
        );
      }
      return sendJson(res, 200, await buildAuthResponse(services, loggedIn.actorId, items));
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const authHeader = String(req.headers.authorization || "").trim();
      if (!authHeader) {
        throw createHttpError("missing_bearer_token", 401);
      }
      if (typeof services?.authProvider?.revokeToken === "function") {
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        const actorId = await services.authProvider.resolveActor(req);
        const items = await services.repository.listVisibleTenants(actorId);
        const primaryTenant = items[0];
        await services.authProvider.revokeToken(token);
        if (primaryTenant?.tenantId) {
          await writeAudit(
            services.repository,
            {
              actorId,
              role: String(primaryTenant.role || "owner"),
              tenantId: String(primaryTenant.tenantId),
              requestId: String(req.headers["x-request-id"] || randomRequestId()),
              traceId: String(req.headers["x-trace-id"] || req.headers["x-request-id"] || randomRequestId()),
              parentSpanId: String(req.headers["x-parent-span-id"] || "")
            },
            "auth.logout",
            "auth",
            actorId,
            buildRequestMetadata(req, url),
            req.socket?.remoteAddress || ""
          );
        }
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/tenants") {
      const actorId = await services.authProvider.resolveActor(req);
      const visible = await services.repository.listVisibleTenants(actorId);
      const requestId = String(req.headers["x-request-id"] || randomRequestId());
      const traceId = String(req.headers["x-trace-id"] || requestId);
      for (const tenant of visible) {
        const context = {
          actorId,
          role: String(tenant.role || "membership_resolver"),
          tenantId: String(tenant.tenantId),
          requestId,
          traceId,
          parentSpanId: String(req.headers["x-parent-span-id"] || "")
        };
        await writeAudit(
          services.repository,
          context,
          "tenants.list",
          "tenants",
          "visible_scope",
          {
            count: visible.length,
            ...buildRequestMetadata(req, url)
          },
          req.socket?.remoteAddress || ""
        );
      }
      return sendJson(res, 200, { items: visible });
    }

    if (url.pathname === "/api/onboarding/state" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const state = await services.repository.getOnboardingState(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "onboarding.state.get",
        "onboarding",
        "state",
        {
          completedCount: Number(state.completedCount || 0),
          totalCount: Number(state.totalCount || 0),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: state
      });
    }

    if (url.pathname === "/api/onboarding/step-complete" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const stepKey = String(body.stepKey || "").trim();
      if (!stepKey) {
        throw createHttpError("onboarding_step_key_required", 400);
      }
      const state = await services.repository.completeOnboardingStep(context.tenantId, stepKey);
      await writeAudit(
        services.repository,
        context,
        "onboarding.step.complete",
        "onboarding",
        stepKey,
        {
          completedCount: Number(state.completedCount || 0),
          totalCount: Number(state.totalCount || 0),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: state
      });
    }

    if (url.pathname === "/api/templates" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const items = await services.repository.listTemplates();
      await writeAudit(
        services.repository,
        context,
        "templates.list",
        "templates",
        "*",
        {
          count: items.length,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        items
      });
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/templates/") && url.pathname.endsWith("/apply")) {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      await readJsonBody(req);
      const templateId = decodeURIComponent(url.pathname.replace("/api/templates/", "").replace("/apply", "")).trim();
      if (!templateId) {
        throw createHttpError("template_id_required", 400);
      }
      const result = await services.repository.applyTemplate(context.tenantId, templateId);
      await writeAudit(
        services.repository,
        context,
        "templates.apply",
        "templates",
        templateId,
        {
          appliedCount: Number(result.appliedCount || 0),
          templateName: String(result.templateName || ""),
          createdPostIds: Array.isArray(result.createdPostIds) ? result.createdPostIds : [],
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (url.pathname === "/api/dm/classify-intent" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const body = await readJsonBody(req);
      const postId = String(body.postId || "").trim();
      if (!postId) {
        throw createHttpError("dm_post_id_required", 400);
      }
      const selectedIntent = normalizeDmIntent(body.selectedIntent);
      const question = String(body.question || "").trim();
      if (question.length > 500) {
        throw createHttpError("dm_question_too_long", 400);
      }
      const result = await services.repository.classifyDmIntent(context.tenantId, {
        postId,
        question,
        selectedIntent
      });
      await writeAudit(
        services.repository,
        context,
        "dm.classify_intent",
        "dm",
        postId,
        {
          postId,
          intent: String(result.intent || "other"),
          confidence: Number(result.confidence || 0),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (url.pathname === "/api/dm/reply-playbook" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const body = await readJsonBody(req);
      const postId = String(body.postId || "").trim();
      if (!postId) {
        throw createHttpError("dm_post_id_required", 400);
      }
      const intent = normalizeDmIntent(body.intent);
      const selectedIntent = normalizeDmIntent(body.selectedIntent);
      const question = String(body.question || "").trim();
      if (question.length > 500) {
        throw createHttpError("dm_question_too_long", 400);
      }
      const postTitle = String(body.postTitle || "").trim();
      if (postTitle.length > 160) {
        throw createHttpError("dm_post_title_too_long", 400);
      }
      const postLink = String(body.postLink || "").trim();
      if (postLink.length > 512) {
        throw createHttpError("dm_post_link_too_long", 400);
      }
      const result = await services.repository.generateDmReplyPlaybook(context.tenantId, {
        postId,
        postTitle,
        postLink,
        question,
        intent,
        selectedIntent
      });
      await writeAudit(
        services.repository,
        context,
        "dm.reply_playbook",
        "dm",
        postId,
        {
          postId,
          intent: String(result.intent || "other"),
          confidence: Number(result.confidence || 0),
          recommendedCount: Array.isArray(result.recommendedProducts) ? result.recommendedProducts.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (url.pathname === "/api/alerts" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const payload = await services.repository.listAlerts(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "alerts.list",
        "alerts",
        "*",
        {
          itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
          ruleCount: Array.isArray(payload.rules) ? payload.rules.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: payload
      });
    }

    if (url.pathname === "/api/alerts/rules" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const rule = await services.repository.upsertAlertRule(context.tenantId, {
        id: String(body.id || "").trim(),
        metricKey: String(body.metricKey || "").trim().toLowerCase(),
        operator: String(body.operator || "").trim().toLowerCase(),
        threshold: body.threshold,
        isActive: body.isActive !== false
      });
      await writeAudit(
        services.repository,
        context,
        "alerts.rule.upsert",
        "alerts",
        String(rule.id || ""),
        {
          metricKey: String(rule.metricKey || ""),
          operator: String(rule.operator || ""),
          threshold: Number(rule.threshold || 0),
          isActive: rule.isActive !== false,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: rule
      });
    }

    if (url.pathname === "/api/workspace/daily" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const workspace = await services.repository.getDailyWorkspace(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "workspace.daily.list",
        "workspace",
        "daily",
        {
          taskCount: Array.isArray(workspace?.tasks) ? workspace.tasks.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: workspace
      });
    }

    if (url.pathname === "/api/content-upgrade" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const payload = await services.repository.getContentUpgradePackage(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "content_upgrade.view",
        "content_upgrade",
        "*",
        {
          packageCount: Array.isArray(payload?.packages) ? payload.packages.length : 0,
          industry: String(payload?.industry?.key || "general"),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: payload
      });
    }

    if (url.pathname === "/api/content-upgrade/apply" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const packageId = String(body.packageId || "").trim();
      if (!packageId) {
        throw createHttpError("content_upgrade_package_id_required", 400);
      }
      if (packageId.length > 80) {
        throw createHttpError("content_upgrade_package_id_too_long", 400);
      }
      const result = await services.repository.applyContentUpgradePackage(context.tenantId, packageId);
      await writeAudit(
        services.repository,
        context,
        "content_upgrade.apply",
        "content_upgrade",
        packageId,
        {
          actionCount: Array.isArray(result?.actions) ? result.actions.length : 0,
          deliverableCount: Array.isArray(result?.deliverables) ? result.deliverables.length : 0,
          taskCount: Array.isArray(result?.generatedTasks) ? result.generatedTasks.length : 0,
          draftCount: Array.isArray(result?.draftPosts) ? result.draftPosts.length : 0,
          appliedCount: Number(result?.appliedCount || 0),
          createdPostIds: Array.isArray(result?.createdPostIds)
            ? result.createdPostIds.map((item) => String(item || "")).filter(Boolean)
            : [],
          batchId: String(result?.batchId || "").trim(),
          industry: String(result?.industry?.key || "general"),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (url.pathname === "/api/content-upgrade/history" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const limitCandidate = Number(url.searchParams.get("limit") || 10);
      const limitRaw = Number.isFinite(limitCandidate) ? limitCandidate : 10;
      const limit = Math.min(Math.max(limitRaw, 1), 50);
      const batchId = String(url.searchParams.get("batchId") || "").trim();
      const audits = await services.repository.listAuditEvents(context.tenantId, {
        limit: Math.min(Math.max(limit * 3, 10), 200),
        resourceType: "content_upgrade"
      });
      const items = audits
        .filter((event) => isContentUpgradeHistoryAction(event?.action))
        .map((event) => normalizeContentUpgradeHistoryItem(event))
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .filter((item) => (batchId ? item.batchId === batchId : true))
        .slice(0, limit);
      await writeAudit(
        services.repository,
        context,
        "content_upgrade.history.list",
        "content_upgrade",
        "*",
        {
          itemCount: items.length,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        items
      });
    }

    if (url.pathname === "/api/content-upgrade/batch-kpi" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      let batchId = String(url.searchParams.get("batchId") || "").trim();
      if (batchId === "all") {
        batchId = "";
      }
      if (batchId.length > 120) {
        throw createHttpError("content_upgrade_batch_id_too_long", 400);
      }
      const item = await services.repository.getContentUpgradeBatchKpi(context.tenantId, batchId);
      await writeAudit(
        services.repository,
        context,
        "content_upgrade.batch_kpi.view",
        "content_upgrade",
        batchId || "*",
        {
          batchId: batchId || "all",
          batchCount: Number(item?.batchCount || 0),
          postCount: Number(item?.postCount || 0),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item
      });
    }

    if (url.pathname === "/api/content-upgrade/monthly-mission" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const month = normalizeMissionMonthQuery(url.searchParams.get("month"));
      const item = await services.repository.getContentUpgradeMonthlyMission(context.tenantId, month);
      await writeAudit(
        services.repository,
        context,
        "content_upgrade.monthly_mission.view",
        "content_upgrade",
        month,
        {
          month,
          checklistCount: Array.isArray(item?.checklist) ? item.checklist.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item
      });
    }

    if (url.pathname === "/api/content-upgrade/monthly-mission/apply" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const month = normalizeMissionMonthQuery(body.month);
      const result = await services.repository.applyContentUpgradeMonthlyMission(context.tenantId, month);
      await writeAudit(
        services.repository,
        context,
        "content_upgrade.monthly_mission.apply",
        "content_upgrade",
        month,
        {
          month,
          appliedCount: Number(result?.appliedCount || 0),
          batchId: String(result?.batchId || "").trim(),
          createdPostIds: Array.isArray(result?.createdPostIds)
            ? result.createdPostIds.map((item) => String(item || "")).filter(Boolean)
            : [],
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (url.pathname === "/api/content-upgrade/replay" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const sourceRequestId = String(body.sourceRequestId || "").trim();
      const sourceHistoryId = String(body.sourceHistoryId || "").trim();
      if (!sourceRequestId && !sourceHistoryId) {
        throw createHttpError("content_upgrade_replay_source_required", 400);
      }
      let sourceEvent = null;
      if (sourceRequestId) {
        const hits = await services.repository.listAuditEvents(context.tenantId, {
          limit: 1,
          resourceType: "content_upgrade",
          requestId: sourceRequestId
        });
        sourceEvent = hits.find((item) => isReplayableContentUpgradeAction(item?.action)) || null;
      }
      if (!sourceEvent) {
        const audits = await services.repository.listAuditEvents(context.tenantId, {
          limit: 200,
          resourceType: "content_upgrade"
        });
        sourceEvent =
          audits.find((item) => {
            if (!isReplayableContentUpgradeAction(item?.action)) {
              return false;
            }
            if (sourceHistoryId && String(item?.id || "").trim() === sourceHistoryId) {
              return true;
            }
            if (sourceRequestId && String(item?.requestId || "").trim() === sourceRequestId) {
              return true;
            }
            return false;
          }) || null;
      }
      if (!sourceEvent) {
        throw createHttpError("content_upgrade_replay_source_not_found", 404);
      }
      const sourcePostIds = extractCreatedPostIdsFromAudit(sourceEvent);
      if (sourcePostIds.length === 0) {
        throw createHttpError("content_upgrade_replay_source_posts_missing", 409);
      }
      const sourceBatchId = String(sourceEvent?.metadata?.batchId || "").trim();
      const replayBatchId = buildContentUpgradeBatchId("replay");
      const existingPosts = await services.repository.listPosts(context.tenantId);
      const byId = new Map(existingPosts.map((item) => [String(item.id || ""), item]));
      const sourcePosts = sourcePostIds.map((id) => byId.get(id)).filter(Boolean);
      if (sourcePosts.length === 0) {
        throw createHttpError("content_upgrade_replay_posts_not_found", 404);
      }

      const createdPosts = [];
      for (const post of sourcePosts) {
        const replayed = await services.repository.createPost(context.tenantId, {
          date: "",
          week: String(post.week || "W1").trim() || "W1",
          type: String(post.type || "feed").trim() || "feed",
          status: "草稿",
          title: `${String(post.title || "內容升級草稿").trim()}（Replay）`,
          script: String(post.script || "").trim(),
          cta: String(post.cta || "").trim(),
          link: String(post.link || "").trim(),
          triggerTags: Array.isArray(post.triggerTags)
            ? [...post.triggerTags, "replay", `batch:${replayBatchId}`]
                .map((item) => String(item || "").trim())
                .filter(Boolean)
                .slice(0, 12)
            : ["replay", `batch:${replayBatchId}`],
          metrics: {
            reach: 0,
            saves: 0,
            dms: 0,
            clicks: 0,
            orders: 0
          }
        });
        createdPosts.push(replayed);
      }

      const result = {
        sourceRequestId: String(sourceEvent.requestId || "").trim(),
        sourceHistoryId: String(sourceEvent.id || "").trim(),
        packageId: String(sourceEvent.resourceId || "").trim(),
        batchId: replayBatchId,
        sourceBatchId,
        replayCount: createdPosts.length,
        createdPostIds: createdPosts.map((item) => item.id),
        generatedAt: new Date().toISOString()
      };
      await writeAudit(
        services.repository,
        context,
        "content_upgrade.replay",
        "content_upgrade",
        result.packageId || result.sourceRequestId || result.sourceHistoryId,
        {
          sourceRequestId: result.sourceRequestId,
          sourceHistoryId: result.sourceHistoryId,
          sourceBatchId: result.sourceBatchId,
          batchId: result.batchId,
          replayCount: result.replayCount,
          createdPostIds: result.createdPostIds.slice(0, 20),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (url.pathname === "/api/brand-strategy/intake" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const item = await services.repository.getBrandStrategyIntake(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "brand_strategy.intake.get",
        "brand_strategy",
        item?.id || "intake",
        {
          hasIntake: Boolean(item),
          keywordCount: Array.isArray(item?.keywords) ? item.keywords.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item
      });
    }

    if (url.pathname === "/api/brand-strategy/intake" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const intake = await services.repository.saveBrandStrategyIntake(context.tenantId, normalizeBrandStrategyIntakeBody(body));
      await writeAudit(
        services.repository,
        context,
        "brand_strategy.intake.save",
        "brand_strategy",
        intake.id,
        {
          brandName: intake.brandName,
          industry: intake.industry,
          keywordCount: Array.isArray(intake.keywords) ? intake.keywords.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: intake
      });
    }

    if (url.pathname === "/api/brand-strategy/generate" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const intakeId = String(body.intakeId || "").trim();
      if (intakeId.length > 80) {
        throw createHttpError("brand_strategy_intake_id_too_long", 400);
      }
      const item = await services.repository.generateBrandStrategyPlan(context.tenantId, {
        intakeId,
        actorId: context.actorId
      });
      await writeAudit(
        services.repository,
        context,
        "brand_strategy.plan.generate",
        "brand_strategy",
        item.id,
        {
          intakeId: item.intakeId,
          pillarCount: Array.isArray(item.contentPillars) ? item.contentPillars.length : 0,
          promptCount: Array.isArray(item.imagePromptFramework?.prompts) ? item.imagePromptFramework.prompts.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item
      });
    }

    if (url.pathname === "/api/brand-strategy/plan" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const item = await services.repository.getBrandStrategyPlan(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "brand_strategy.plan.get",
        "brand_strategy",
        item?.id || "plan",
        {
          hasPlan: Boolean(item),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item
      });
    }

    if (url.pathname === "/api/reports/share" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const batchId = String(body.batchId || "").trim();
      const expiresInDays = body.expiresInDays;
      const link = await services.repository.createSharedReportLink(context.tenantId, {
        batchId,
        expiresInDays,
        createdBy: context.actorId
      });
      await writeAudit(
        services.repository,
        context,
        "reports.share.create",
        "reports",
        link.id,
        {
          batchId: String(link.scope?.batchId || "all"),
          reportType: String(link.reportType || "content_upgrade_batch"),
          expiresAt: link.expiresAt,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 201, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: {
          id: link.id,
          token: link.token,
          reportType: link.reportType,
          batchId: String(link.scope?.batchId || "all"),
          expiresAt: link.expiresAt,
          createdAt: link.createdAt
        }
      });
    }

    if (url.pathname === "/api/comments" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const resourceType = String(url.searchParams.get("resourceType") || "").trim().toLowerCase();
      if (resourceType && !(resourceType === "post" || resourceType === "product")) {
        throw createHttpError("comment_resource_type_invalid", 400);
      }
      const resourceId = String(url.searchParams.get("resourceId") || "").trim();
      const items = await services.repository.listComments(context.tenantId, { resourceType, resourceId });
      await writeAudit(
        services.repository,
        context,
        "comments.list",
        "comments",
        resourceId || "*",
        {
          resourceType,
          itemCount: items.length,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        items
      });
    }

    if (url.pathname === "/api/comments" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const commentBody = String(body.body || "").trim();
      if (commentBody.length > 2000) {
        throw createHttpError("comment_body_too_long", 400);
      }
      const comment = await services.repository.createComment(context.tenantId, {
        resourceType: String(body.resourceType || "").trim().toLowerCase(),
        resourceId: String(body.resourceId || "").trim(),
        body: commentBody,
        authorId: context.actorId
      });
      await writeAudit(
        services.repository,
        context,
        "comments.create",
        "comments",
        comment.id,
        {
          resourceType: comment.resourceType,
          resourceId: comment.resourceId,
          mentionCount: Array.isArray(comment.mentions) ? comment.mentions.length : 0,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 201, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: comment
      });
    }

    if (url.pathname === "/api/posts" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const items = await services.repository.listPosts(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "posts.list",
        "posts",
        "*",
        {
          count: items.length,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        items
      });
    }

    if (url.pathname === "/api/posts" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      if (!String(body.title || "").trim()) {
        throw createHttpError("title_required", 400);
      }
      const created = await services.repository.createPost(context.tenantId, body);
      await writeAudit(
        services.repository,
        context,
        "posts.create",
        "posts",
        created.id,
        {
          title: created.title,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 201, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: created
      });
    }

    if (url.pathname === "/api/posts/batch" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const result = await services.repository.batchUpdatePostsStatus(context.tenantId, {
        ids: body.ids,
        status: body.status
      });
      await writeAudit(
        services.repository,
        context,
        "posts.batch_update",
        "posts",
        "batch",
        {
          requestedCount: Number(result.requestedCount || 0),
          successCount: Number(result.successCount || 0),
          failedCount: Number(result.failedCount || 0),
          targetStatus: String(result.targetStatus || ""),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/posts/")) {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const postId = decodeURIComponent(url.pathname.replace("/api/posts/", "")).trim();
      if (!postId) {
        throw createHttpError("post_id_required", 400);
      }
      const body = await readJsonBody(req);
      if (!String(body.title || "").trim()) {
        throw createHttpError("title_required", 400);
      }
      const updated = await services.repository.updatePost(context.tenantId, postId, body);
      await writeAudit(
        services.repository,
        context,
        "posts.update",
        "posts",
        updated.id,
        {
          title: updated.title,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: updated
      });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/posts/")) {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const postId = decodeURIComponent(url.pathname.replace("/api/posts/", "")).trim();
      if (!postId) {
        throw createHttpError("post_id_required", 400);
      }
      const deleted = await services.repository.deletePost(context.tenantId, postId);
      await writeAudit(
        services.repository,
        context,
        "posts.delete",
        "posts",
        deleted.id,
        {
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: deleted
      });
    }

    if (url.pathname === "/api/products" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const items = await services.repository.listProducts(context.tenantId);
      await writeAudit(
        services.repository,
        context,
        "products.list",
        "products",
        "*",
        {
          count: items.length,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        items
      });
    }

    if (url.pathname === "/api/products" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      if (!String(body.name || "").trim()) {
        throw createHttpError("product_name_required", 400);
      }
      const created = await services.repository.createProduct(context.tenantId, body);
      await writeAudit(
        services.repository,
        context,
        "products.create",
        "products",
        created.id,
        {
          name: created.name,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 201, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: created
      });
    }

    if (url.pathname === "/api/products/batch" && req.method === "POST") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const body = await readJsonBody(req);
      const result = await services.repository.batchUpdateProductsStatus(context.tenantId, {
        ids: body.ids,
        status: body.status
      });
      await writeAudit(
        services.repository,
        context,
        "products.batch_update",
        "products",
        "batch",
        {
          requestedCount: Number(result.requestedCount || 0),
          successCount: Number(result.successCount || 0),
          failedCount: Number(result.failedCount || 0),
          targetStatus: String(result.targetStatus || ""),
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: result
      });
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/products/")) {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const productId = decodeURIComponent(url.pathname.replace("/api/products/", "")).trim();
      if (!productId) {
        throw createHttpError("product_id_required", 400);
      }
      const body = await readJsonBody(req);
      if (!String(body.name || "").trim()) {
        throw createHttpError("product_name_required", 400);
      }
      const updated = await services.repository.updateProduct(context.tenantId, productId, body);
      await writeAudit(
        services.repository,
        context,
        "products.update",
        "products",
        updated.id,
        {
          name: updated.name,
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: updated
      });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/products/")) {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "write_posts");
      enforceRateLimit(context, "write");
      const productId = decodeURIComponent(url.pathname.replace("/api/products/", "")).trim();
      if (!productId) {
        throw createHttpError("product_id_required", 400);
      }
      const deleted = await services.repository.deleteProduct(context.tenantId, productId);
      await writeAudit(
        services.repository,
        context,
        "products.delete",
        "products",
        deleted.id,
        {
          ...buildRequestMetadata(req, url)
        },
        req.socket?.remoteAddress || ""
      );
      return sendJson(res, 200, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        item: deleted
      });
    }

    if (url.pathname === "/api/audit-events" && req.method === "GET") {
      const context = await resolveTenantContext(req, services);
      requirePermission(context, "read_posts");
      enforceRateLimit(context, "read");
      const query = normalizeAuditQuery(url);
      const items = await services.repository.listAuditEvents(context.tenantId, query);
      return sendJson(res, 200, { tenantId: context.tenantId, requestId: context.requestId, items });
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    const normalized = normalizeError(error);
    return sendJson(res, normalized.statusCode, {
      error: normalized.code,
      errorDetail: {
        code: normalized.code,
        message: normalized.message,
        retryAfterMs: normalized.retryAfterMs
      }
    });
  }
});

server.listen(PORT, () => {
  console.log(`IG Growth OS Core API (${services.repository.kind}/${services.authProvider.kind}) listening on :${PORT}`);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Shutting down due to ${signal}...`);

  server.close(async () => {
    try {
      await services.repository.close();
    } catch (error) {
      console.error("Repository close failed", error);
    } finally {
      process.exit(0);
    }
  });
}

function buildRequestMetadata(req, url) {
  return {
    method: String(req.method || "GET"),
    path: url.pathname,
    authProvider: services.authProvider.kind,
    repository: services.repository.kind,
    userAgent: String(req.headers["user-agent"] || "")
  };
}

function normalizeDmIntent(value) {
  const intent = String(value || "").trim().toLowerCase();
  if (DM_INTENT_ALLOWLIST.has(intent)) {
    return intent;
  }
  return "other";
}

function randomRequestId() {
  return `req_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAuditQuery(url) {
  const limitRaw = Number(url.searchParams.get("limit") || 20);
  const limit = Math.min(Math.max(limitRaw, 1), 100);
  const action = String(url.searchParams.get("action") || "").trim();
  const actorId = String(url.searchParams.get("actorId") || "").trim();
  const resourceType = String(url.searchParams.get("resourceType") || "").trim();
  const requestId = String(url.searchParams.get("requestId") || "").trim();
  const traceId = String(url.searchParams.get("traceId") || "").trim();
  const since = String(url.searchParams.get("since") || "").trim();

  return {
    limit,
    action: action || undefined,
    actorId: actorId || undefined,
    resourceType: resourceType || undefined,
    requestId: requestId || undefined,
    traceId: traceId || undefined,
    since: since || undefined
  };
}

function normalizeContentUpgradeHistoryItem(event) {
  const metadata = event?.metadata || {};
  const eventMeta = metadata?.event || {};
  const createdPostIds = Array.isArray(metadata?.createdPostIds)
    ? metadata.createdPostIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const action = String(event?.action || "content_upgrade.apply").trim() || "content_upgrade.apply";
  return {
    id: String(event?.id || "").trim(),
    packageId: String(event?.resourceId || "").trim(),
    title: action === "content_upgrade.monthly_mission.apply" ? `月任務 ${String(event?.resourceId || "").trim()} 套用` : String(event?.resourceId || "").trim(),
    action,
    actorId: String(event?.actorId || "").trim(),
    appliedCount: Number(metadata?.appliedCount || 0),
    draftCount: Number(metadata?.draftCount ?? metadata?.appliedCount ?? 0),
    taskCount: Number(metadata?.taskCount || 0),
    batchId: String(metadata?.batchId || "").trim(),
    industry: String(metadata?.industry || "general").trim() || "general",
    createdPostIds,
    requestId: String(event?.requestId || "").trim(),
    traceId: String(eventMeta?.traceId || "").trim(),
    createdAt: event?.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString()
  };
}

function extractCreatedPostIdsFromAudit(event) {
  const metadata = event?.metadata || {};
  if (!Array.isArray(metadata?.createdPostIds)) {
    return [];
  }
  return metadata.createdPostIds.map((item) => String(item || "").trim()).filter(Boolean);
}

function isContentUpgradeHistoryAction(action) {
  const value = String(action || "").trim();
  return value === "content_upgrade.apply" || value === "content_upgrade.monthly_mission.apply";
}

function isReplayableContentUpgradeAction(action) {
  return isContentUpgradeHistoryAction(action);
}

function buildContentUpgradeBatchId(prefix = "batch") {
  return `cu_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMissionMonthQuery(value) {
  const month = String(value || "").trim();
  if (!month) {
    return String(new Date().getMonth() + 1).padStart(2, "0");
  }
  if (/^(0[1-9]|1[0-2])$/.test(month)) {
    return month;
  }
  throw createHttpError("content_upgrade_month_invalid", 400);
}

function normalizeBrandStrategyIntakeBody(body) {
  const brandName = String(body?.brandName || "").trim();
  if (!brandName) {
    throw createHttpError("brand_strategy_brand_name_required", 400);
  }
  if (brandName.length > 120) {
    throw createHttpError("brand_strategy_brand_name_too_long", 400);
  }
  const industry = String(body?.industry || "general").trim() || "general";
  if (industry.length > 80) {
    throw createHttpError("brand_strategy_industry_too_long", 400);
  }
  const targetAudience = String(body?.targetAudience || "").trim();
  if (targetAudience.length > 200) {
    throw createHttpError("brand_strategy_target_audience_too_long", 400);
  }
  const businessGoal = String(body?.businessGoal || "").trim();
  if (businessGoal.length > 300) {
    throw createHttpError("brand_strategy_business_goal_too_long", 400);
  }
  const tone = String(body?.tone || "專業親切").trim() || "專業親切";
  if (tone.length > 80) {
    throw createHttpError("brand_strategy_tone_too_long", 400);
  }
  const constraints = String(body?.constraints || "").trim();
  if (constraints.length > 400) {
    throw createHttpError("brand_strategy_constraints_too_long", 400);
  }
  const notes = String(body?.notes || "").trim();
  if (notes.length > 1000) {
    throw createHttpError("brand_strategy_notes_too_long", 400);
  }
  const keywords = normalizeBrandStrategyKeywords(body?.keywords);
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

function normalizeBrandStrategyKeywords(raw) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || "")
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

async function buildAuthResponse(services, actorId, items) {
  const token = typeof services?.authProvider?.issueToken === "function"
    ? await services.authProvider.issueToken(actorId)
    : `dev_user_${actorId}`;
  return {
    actorId,
    token,
    items: Array.isArray(items) ? items : []
  };
}

function applyCorsHeaders(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (!CORS_ALLOWED_ORIGINS.length) {
    res.setHeader("access-control-allow-origin", origin || "*");
    res.setHeader("vary", "Origin");
  } else if (origin && CORS_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "content-type,authorization,x-tenant-id,x-request-id,x-trace-id,x-parent-span-id"
  );
  res.setHeader("access-control-max-age", "86400");
}

function buildOriginAllowlist(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function applySecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "DENY");
}

async function consumeAuthThrottle(repository, identifier) {
  if (repository && typeof repository.consumeAuthThrottle === "function") {
    await repository.consumeAuthThrottle(identifier, 8, AUTH_WINDOW_MS);
  }
}

function parseEnvBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return Boolean(fallback);
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return Boolean(fallback);
}

function buildEmailAllowlistMatcher(pattern) {
  const source = String(pattern || "").trim();
  if (!source) {
    return null;
  }
  try {
    return new RegExp(source, "i");
  } catch (_error) {
    throw createHttpError("auth_register_email_allowlist_regex_invalid", 500);
  }
}

function buildExactEmailAllowlist(rawValue) {
  return new Set(
    String(rawValue || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeProductPreviewUrl(input) {
  try {
    const parsed = new URL(String(input || "").trim());
    const host = String(parsed.hostname || "").toLowerCase();
    if (host !== "shopee.tw" && !host.endsWith(".shopee.tw")) {
      return "";
    }
    if (parsed.protocol !== "https:") {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

async function fetchFirstProductImage(url) {
  const apiImage = await fetchShopeeItemImage(url);
  if (apiImage) {
    return apiImage;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36"
      }
    });
    if (!response.ok) {
      return "";
    }
    const html = await response.text();
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      return String(ogMatch[1]).trim();
    }
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) {
      return String(imgMatch[1]).trim();
    }
    return "";
  } catch (_error) {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchShopeeItemImage(url) {
  const parsed = parseShopeeProductIds(url);
  if (!parsed) {
    return "";
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const endpoint = `https://shopee.tw/api/v4/item/get?itemid=${parsed.itemId}&shopid=${parsed.shopId}`;
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        referer: `https://shopee.tw/product/${parsed.shopId}/${parsed.itemId}`,
        "x-api-source": "pc"
      }
    });
    if (!response.ok) {
      return "";
    }
    const payload = await response.json().catch(() => ({}));
    const imageId = String(payload?.data?.image || payload?.data?.images?.[0] || "").trim();
    if (!imageId) {
      return "";
    }
    return `https://down-tw.img.susercontent.com/file/${imageId}`;
  } catch (_error) {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseShopeeProductIds(url) {
  const text = String(url || "").trim();
  const matchA = text.match(/\/product\/(\d+)\/(\d+)/i);
  if (matchA) {
    return {
      shopId: matchA[1],
      itemId: matchA[2]
    };
  }
  const matchB = text.match(/\/i\.(\d+)\.(\d+)/i);
  if (matchB) {
    return {
      shopId: matchB[1],
      itemId: matchB[2]
    };
  }
  return null;
}

async function ensureProductPreviewCacheLoaded() {
  if (productPreviewCacheLoaded) {
    return;
  }
  productPreviewCacheLoaded = true;
  try {
    const raw = await readFile(PRODUCT_PREVIEW_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.entries(parsed).forEach(([key, value]) => {
        const k = String(key || "").trim();
        const v = String(value || "").trim();
        if (k && v) {
          productPreviewCache.set(k, v);
        }
      });
    }
  } catch (_error) {
  }
}

async function getCachedProductPreview(url) {
  await ensureProductPreviewCacheLoaded();
  return String(productPreviewCache.get(url) || "").trim();
}

async function setCachedProductPreview(url, imageUrl) {
  const key = String(url || "").trim();
  const value = String(imageUrl || "").trim();
  if (!key || !value) {
    return;
  }
  await ensureProductPreviewCacheLoaded();
  if (productPreviewCache.get(key) === value) {
    return;
  }
  productPreviewCache.set(key, value);
  const payload = Object.fromEntries(productPreviewCache.entries());
  const filePath = fileURLToPath(PRODUCT_PREVIEW_CACHE_FILE);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const DM_INTENT_ALLOWLIST = new Set(["price", "size", "material", "shipping", "style", "other"]);
