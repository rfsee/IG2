import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createHttpError } from "../errors.js";
import { buildDailyWorkspacePayload } from "../workspace/dailyWorkspace.js";

const tenants = [
  { id: "tenant_default", name: "Default Store" },
  { id: "tenant_kilikuru", name: "kilikuru2k7" }
];

const memberships = [
  { userId: "u_owner", tenantId: "tenant_default", role: "owner" },
  { userId: "u_owner", tenantId: "tenant_kilikuru", role: "owner" },
  { userId: "u_editor", tenantId: "tenant_kilikuru", role: "editor" },
  { userId: "u_viewer", tenantId: "tenant_default", role: "viewer" }
];

const postStore = new Map([
  [
    "tenant_default",
    [
      {
        id: "p_default_001",
        date: "",
        week: "W1",
        title: "Default store launch reels",
        type: "reels",
        status: "draft",
        script: "",
        cta: "",
        link: "",
        triggerTags: [],
        metrics: { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 }
      }
    ]
  ],
  [
    "tenant_kilikuru",
    [
      {
        id: "p_kilikuru_001",
        date: "",
        week: "W1",
        title: "Kilikuru Friday night coffee campaign",
        type: "feed",
        status: "shooting",
        script: "",
        cta: "",
        link: "",
        triggerTags: [],
        metrics: { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 }
      }
    ]
  ]
]);

const productStore = new Map([
  [
    "tenant_default",
    [
      {
        id: "g_default_001",
        name: "INS蘑菇邊几",
        price: 1999,
        size: "小號",
        material: "烤漆桌面/金屬底座",
        selling: "3坪小空間友好，床邊客廳都可用",
        photoName: "",
        link: "https://shopee.tw/product/179481064/13191474219",
        scene: "床邊/客廳角落",
        status: "active"
      },
      {
        id: "g_default_002",
        name: "櫻桃色北歐小圓桌",
        price: 2490,
        size: "圓桌",
        material: "木紋桌面/鋼腳",
        selling: "租屋質感升級，低預算高顏值",
        photoName: "",
        link: "https://shopee.tw/product/179481064/15358800572",
        scene: "客廳/租屋會客區",
        status: "active"
      },
      {
        id: "g_default_003",
        name: "北歐麻布餐椅",
        price: 2280,
        size: "餐椅",
        material: "麻布/木腳",
        selling: "工作餐桌兩用椅，租屋首選",
        photoName: "",
        link: "https://shopee.tw/product/179481064/14056487318",
        scene: "工作區/餐區",
        status: "active"
      },
      {
        id: "g_default_004",
        name: "復古實木邊几",
        price: 2799,
        size: "小號",
        material: "做舊實木",
        selling: "小坪數萬用邊几，可當床邊桌/花台/展示台",
        photoName: "",
        link: "https://shopee.tw/product/179481064/11587344766",
        scene: "床邊/客廳角落",
        status: "active"
      },
      {
        id: "g_default_005",
        name: "實木年輪圓桌",
        price: 2999,
        size: "圓桌",
        material: "實木",
        selling: "WFH與用餐共用，一桌多用",
        photoName: "",
        link: "https://shopee.tw/product/179481064/14879946813",
        scene: "客廳/工作區",
        status: "active"
      }
    ]
  ],
  [
    "tenant_kilikuru",
    [
      {
        id: "g_kilikuru_001",
        name: "Smoky Espresso Tonic",
        price: 180,
        size: "16oz",
        material: "espresso + tonic",
        selling: "苦甜層次與氣泡口感",
        photoName: "",
        link: "",
        scene: "咖啡吧台",
        status: "active"
      }
    ]
  ]
]);

const sharedReportLinks = [];

const auditEvents = [];
const credentialStore = new Map();
const authSessionStore = new Map();
const authThrottleStore = new Map();
const onboardingStateStore = new Map();
const alertRuleStore = new Map();
const commentStore = new Map();
const mentionNotificationStore = new Map();
const brandStrategyIntakeStore = new Map();
const brandStrategyPlanStore = new Map();

const MAIN_EMAIL = "main@gmail.com";
const MAIN_ACTOR_ID = "u_main";
const MAIN_TENANT_ID = "tenant_default";

bootstrapMainAccountBinding();

export function createMemoryRepository() {
  return {
    kind: "memory",
    async healthCheck() {
      return { ok: true, provider: "memory" };
    },
    async listVisibleTenants(actorId) {
      return memberships
        .filter((item) => item.userId === actorId)
        .map((item) => ({
          tenantId: item.tenantId,
          role: item.role,
          tenantName: tenants.find((tenant) => tenant.id === item.tenantId)?.name || item.tenantId
        }));
    },
    async getTenantById(tenantId) {
      return tenants.find((item) => item.id === tenantId) || null;
    },
    async findMembership(actorId, tenantId) {
      return memberships.find((item) => item.userId === actorId && item.tenantId === tenantId) || null;
    },
    async listPosts(tenantId) {
      return (postStore.get(tenantId) || []).map((item) => clonePost(item));
    },
    async getOnboardingState(tenantId) {
      const existing = onboardingStateStore.get(tenantId);
      if (existing) {
        return cloneOnboardingState(existing);
      }
      const seeded = buildDefaultOnboardingState(tenantId);
      onboardingStateStore.set(tenantId, seeded);
      return cloneOnboardingState(seeded);
    },
    async completeOnboardingStep(tenantId, stepKey) {
      const existing = onboardingStateStore.get(tenantId) || buildDefaultOnboardingState(tenantId);
      const stepIndex = existing.steps.findIndex((item) => item.key === stepKey);
      if (stepIndex < 0) {
        throw createHttpError("onboarding_step_not_found", 404);
      }
      if (!existing.steps[stepIndex].completedAt) {
        existing.steps[stepIndex] = {
          ...existing.steps[stepIndex],
          completedAt: new Date().toISOString()
        };
      }
      const next = normalizeOnboardingState(existing);
      onboardingStateStore.set(tenantId, next);
      return cloneOnboardingState(next);
    },
    async listTemplates() {
      return listDefaultTemplates();
    },
    async applyTemplate(tenantId, templateId) {
      const template = DEFAULT_TEMPLATE_CATALOG.find((item) => item.id === templateId);
      if (!template) {
        throw createHttpError("template_not_found", 404);
      }
      const existing = postStore.get(tenantId) || [];
      const createdPosts = template.posts.map((item) =>
        normalizePostInput(
          {
            ...item,
            id: randomUUID(),
            status: item.status || "草稿"
          },
          {}
        )
      );
      postStore.set(tenantId, [...createdPosts, ...existing]);
      return {
        templateId: template.id,
        templateName: template.name,
        appliedCount: createdPosts.length,
        createdPostIds: createdPosts.map((item) => item.id)
      };
    },
    async classifyDmIntent(_tenantId, input) {
      return classifyIntentFromText(String(input.question || ""), String(input.selectedIntent || ""));
    },
    async generateDmReplyPlaybook(tenantId, input) {
      const question = String(input.question || "").trim();
      const postTitle = String(input.postTitle || "").trim();
      const postLink = String(input.postLink || "").trim();
      const intentResult = classifyIntentFromText(question, String(input.intent || input.selectedIntent || ""));
      const products = (productStore.get(tenantId) || []).map((item) => ({ ...item }));
      const recommendedProducts = pickRecommendedProducts(products, intentResult.intent);
      return {
        intent: intentResult.intent,
        intentLabel: mapIntentLabel(intentResult.intent),
        confidence: intentResult.confidence,
        recommendedProducts,
        script: buildReplyScript({ question, postTitle, postLink, intent: intentResult.intent, recommendedProducts })
      };
    },
    async listAlertRules(tenantId) {
      return (alertRuleStore.get(tenantId) || []).map((item) => ({ ...item }));
    },
    async upsertAlertRule(tenantId, input) {
      const existing = alertRuleStore.get(tenantId) || [];
      const nextRule = normalizeAlertRuleInput(input);
      if (nextRule.id) {
        const index = existing.findIndex((item) => item.id === nextRule.id);
        if (index >= 0) {
          existing[index] = {
            ...existing[index],
            ...nextRule,
            updatedAt: new Date().toISOString()
          };
          alertRuleStore.set(tenantId, existing);
          return { ...existing[index] };
        }
      }
      const created = {
        id: randomUUID(),
        metricKey: nextRule.metricKey,
        operator: nextRule.operator,
        threshold: nextRule.threshold,
        isActive: nextRule.isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      alertRuleStore.set(tenantId, [created, ...existing]);
      return { ...created };
    },
    async listAlerts(tenantId) {
      const rules = (alertRuleStore.get(tenantId) || []).map((item) => ({ ...item }));
      const metrics = summarizeTenantMetrics(postStore.get(tenantId) || []);
      const events = rules
        .filter((item) => item.isActive !== false)
        .map((rule) => evaluateAlertRule(rule, metrics))
        .filter(Boolean)
        .map((event) => ({ ...event }));
      return {
        rules,
        metrics,
        items: events
      };
    },
    async getDailyWorkspace(tenantId) {
      const posts = (postStore.get(tenantId) || []).map((item) => ({ ...item }));
      const products = (productStore.get(tenantId) || []).map((item) => ({ ...item }));
      const alerts = await this.listAlerts(tenantId);
      return buildDailyWorkspacePayload({ posts, products, alerts });
    },
    async getContentUpgradePackage(tenantId) {
      const posts = (postStore.get(tenantId) || []).map((item) => ({ ...item }));
      const products = (productStore.get(tenantId) || []).map((item) => ({ ...item }));
      const industryKey = inferIndustryKey({ tenantId, posts, products });
      return buildContentUpgradePackagePayload({
        industryKey,
        posts,
        products
      });
    },
    async getContentUpgradeBatchKpi(tenantId, batchId = "") {
      const posts = (postStore.get(tenantId) || []).map((item) => ({ ...item, triggerTags: [...(item.triggerTags || [])] }));
      return buildContentUpgradeBatchKpiPayload(posts, batchId);
    },
    async getContentUpgradeMonthlyMission(tenantId, month = "") {
      const payload = await this.getContentUpgradePackage(tenantId);
      return buildContentUpgradeMonthlyMissionPayload(payload, month);
    },
    async getBrandStrategyIntake(tenantId) {
      const item = brandStrategyIntakeStore.get(tenantId);
      return item ? cloneBrandStrategyIntake(item) : null;
    },
    async saveBrandStrategyIntake(tenantId, input = {}) {
      const previous = brandStrategyIntakeStore.get(tenantId);
      const normalized = normalizeBrandStrategyIntakeInput(input, previous || null);
      const nowIso = new Date().toISOString();
      const next = {
        id: previous?.id || randomUUID(),
        tenantId,
        brandName: normalized.brandName,
        industry: normalized.industry,
        targetAudience: normalized.targetAudience,
        businessGoal: normalized.businessGoal,
        tone: normalized.tone,
        keywords: [...normalized.keywords],
        constraints: normalized.constraints,
        notes: normalized.notes,
        createdAt: previous?.createdAt || nowIso,
        updatedAt: nowIso
      };
      brandStrategyIntakeStore.set(tenantId, next);
      return cloneBrandStrategyIntake(next);
    },
    async generateBrandStrategyPlan(tenantId, input = {}) {
      const intakeId = String(input.intakeId || "").trim();
      const createdBy = String(input.actorId || "system").trim() || "system";
      const intake = brandStrategyIntakeStore.get(tenantId);
      if (!intake) {
        throw createHttpError("brand_strategy_intake_not_found", 404);
      }
      if (intakeId && intake.id !== intakeId) {
        throw createHttpError("brand_strategy_intake_not_found", 404);
      }
      const posts = (postStore.get(tenantId) || []).map((item) => clonePost(item));
      const products = (productStore.get(tenantId) || []).map((item) => ({ ...item }));
      const payload = buildBrandStrategyPlanPayload({
        tenantId,
        intake,
        posts,
        products
      });
      const nowIso = new Date().toISOString();
      const plan = {
        id: randomUUID(),
        tenantId,
        intakeId: intake.id,
        ...payload,
        generatedAt: nowIso,
        createdAt: nowIso,
        createdBy
      };
      brandStrategyPlanStore.set(tenantId, plan);
      return cloneBrandStrategyPlan(plan);
    },
    async getBrandStrategyPlan(tenantId) {
      const item = brandStrategyPlanStore.get(tenantId);
      return item ? cloneBrandStrategyPlan(item) : null;
    },
    async createSharedReportLink(tenantId, input = {}) {
      const batchId = normalizeSharedReportBatchId(input.batchId);
      const expiresAt = buildSharedReportExpiry(input.expiresInDays);
      const token = buildSharedReportToken();
      const item = {
        id: randomUUID(),
        tenantId,
        token,
        reportType: "content_upgrade_batch",
        scope: { batchId: batchId || "all" },
        expiresAt,
        createdBy: String(input.createdBy || "system").trim() || "system",
        createdAt: new Date().toISOString()
      };
      sharedReportLinks.unshift(item);
      if (sharedReportLinks.length > 1000) {
        sharedReportLinks.length = 1000;
      }
      return { ...item, scope: { ...item.scope } };
    },
    async getSharedReportLinkByToken(token) {
      const normalized = String(token || "").trim();
      const item = sharedReportLinks.find((entry) => entry.token === normalized);
      return item ? { ...item, scope: { ...item.scope } } : null;
    },
    async applyContentUpgradeMonthlyMission(tenantId, month = "") {
      const payload = await this.getContentUpgradePackage(tenantId);
      const mission = buildContentUpgradeMonthlyMissionPayload(payload, month);
      const existing = postStore.get(tenantId) || [];
      const batchId = buildContentUpgradeBatchId("mission");
      const createdPosts = buildMonthlyMissionDraftPosts(mission).map((item) =>
        normalizePostInput(
          {
            ...item,
            id: randomUUID(),
            status: item.status || "草稿",
            triggerTags: Array.isArray(item.triggerTags)
              ? [...item.triggerTags, `batch:${batchId}`]
              : [`batch:${batchId}`]
          },
          {}
        )
      );
      postStore.set(tenantId, [...createdPosts, ...existing]);
      return {
        month: mission.month,
        batchId,
        checklist: mission.checklist.map((item) => String(item)),
        objective: mission.objective,
        topic: { ...mission.topic },
        recommendedPackage: mission.recommendedPackage ? { ...mission.recommendedPackage } : null,
        draftPosts: createdPosts.map((item) => clonePost(item)),
        createdPostIds: createdPosts.map((item) => item.id),
        appliedCount: createdPosts.length,
        generatedAt: new Date().toISOString()
      };
    },
    async applyContentUpgradePackage(tenantId, packageId) {
      const payload = await this.getContentUpgradePackage(tenantId);
      const selectedId = String(packageId || "").trim();
      const selected = payload.packages.find((item) => item.id === selectedId);
      if (!selected) {
        throw createHttpError("content_upgrade_package_not_found", 404);
      }
      const existing = postStore.get(tenantId) || [];
      const plan = buildAppliedUpgradePlan(selected, payload);
      const batchId = buildContentUpgradeBatchId("apply");
      const createdPosts = plan.draftPosts.map((item) =>
        normalizePostInput(
          {
            ...item,
            id: randomUUID(),
            status: item.status || "草稿",
            triggerTags: Array.isArray(item.triggerTags)
              ? [...item.triggerTags, `batch:${batchId}`]
              : [`batch:${batchId}`]
          },
          {}
        )
      );
      postStore.set(tenantId, [...createdPosts, ...existing]);
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
      return {
        ...plan,
        generatedTasks,
        draftPosts: createdPosts.map((item) => clonePost(item)),
        createdPostIds: createdPosts.map((item) => item.id),
        appliedCount: createdPosts.length,
        batchId,
        executionSummary: {
          ...plan.executionSummary,
          draftCount: createdPosts.length,
          batchId
        }
      };
    },
    async listComments(tenantId, query = {}) {
      const resourceType = String(query.resourceType || "").trim().toLowerCase();
      const resourceId = String(query.resourceId || "").trim();
      const source = commentStore.get(tenantId) || [];
      return source
        .filter((item) => (resourceType ? item.resourceType === resourceType : true))
        .filter((item) => (resourceId ? item.resourceId === resourceId : true))
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .map((item) => ({ ...item, mentions: [...(item.mentions || [])] }));
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
      const now = new Date().toISOString();
      const comment = {
        id: randomUUID(),
        tenantId,
        resourceType,
        resourceId,
        authorId,
        body,
        mentions,
        createdAt: now
      };
      const existing = commentStore.get(tenantId) || [];
      commentStore.set(tenantId, [comment, ...existing]);

      if (mentions.length > 0) {
        const notifications = mentionNotificationStore.get(tenantId) || [];
        const created = mentions.map((mentionedUserId) => ({
          id: randomUUID(),
          tenantId,
          commentId: comment.id,
          mentionedUserId,
          isRead: false,
          createdAt: now
        }));
        mentionNotificationStore.set(tenantId, [...created, ...notifications]);
      }

      return { ...comment, mentions: [...mentions] };
    },
    async createPost(tenantId, input) {
      const existing = postStore.get(tenantId) || [];
      const next = normalizePostInput(input, { id: randomUUID() });
      postStore.set(tenantId, [next, ...existing]);
      return clonePost(next);
    },
    async updatePost(tenantId, postId, input) {
      const existing = postStore.get(tenantId) || [];
      const index = existing.findIndex((item) => item.id === postId);
      if (index < 0) {
        throw createHttpError("post_not_found", 404);
      }
      const current = existing[index];
      const next = normalizePostInput(input, current);
      existing[index] = next;
      postStore.set(tenantId, existing);
      return clonePost(next);
    },
    async batchUpdatePostsStatus(tenantId, input = {}) {
      const ids = normalizeBatchIds(input.ids);
      const status = normalizePostBatchStatus(input.status);
      const existing = postStore.get(tenantId) || [];
      const results = ids.map((id) => {
        const index = existing.findIndex((item) => item.id === id);
        if (index < 0) {
          return { id, ok: false, error: "post_not_found" };
        }
        existing[index] = normalizePostInput({ status }, existing[index]);
        return { id, ok: true, status: existing[index].status };
      });
      postStore.set(tenantId, existing);
      return buildBatchMutationSummary(results, status);
    },
    async deletePost(tenantId, postId) {
      const existing = postStore.get(tenantId) || [];
      const next = existing.filter((item) => item.id !== postId);
      if (next.length === existing.length) {
        throw createHttpError("post_not_found", 404);
      }
      postStore.set(tenantId, next);
      return { id: postId };
    },
    async listProducts(tenantId) {
      return [...(productStore.get(tenantId) || [])];
    },
    async createProduct(tenantId, input) {
      const existing = productStore.get(tenantId) || [];
      const next = {
        id: randomUUID(),
        name: String(input.name || "").trim(),
        price: Number(input.price || 0),
        size: String(input.size || "").trim(),
        material: String(input.material || "").trim(),
        selling: String(input.selling || "").trim(),
        photoName: String(input.photoName || "").trim(),
        link: String(input.link || "").trim(),
        scene: String(input.scene || "").trim(),
        status: String(input.status || "active").trim() || "active"
      };
      productStore.set(tenantId, [next, ...existing]);
      return next;
    },
    async updateProduct(tenantId, productId, input) {
      const existing = productStore.get(tenantId) || [];
      const index = existing.findIndex((item) => item.id === productId);
      if (index < 0) {
        throw createHttpError("product_not_found", 404);
      }
      const current = existing[index];
      const next = {
        ...current,
        name: String(input.name || current.name || "").trim(),
        price: Number(input.price ?? current.price ?? 0),
        size: String(input.size ?? current.size ?? "").trim(),
        material: String(input.material ?? current.material ?? "").trim(),
        selling: String(input.selling ?? current.selling ?? "").trim(),
        photoName: String(input.photoName ?? current.photoName ?? "").trim(),
        link: String(input.link ?? current.link ?? "").trim(),
        scene: String(input.scene ?? current.scene ?? "").trim(),
        status: String(input.status ?? current.status ?? "active").trim() || "active"
      };
      existing[index] = next;
      productStore.set(tenantId, existing);
      return next;
    },
    async batchUpdateProductsStatus(tenantId, input = {}) {
      const ids = normalizeBatchIds(input.ids);
      const status = normalizeProductBatchStatus(input.status);
      const existing = productStore.get(tenantId) || [];
      const results = ids.map((id) => {
        const index = existing.findIndex((item) => item.id === id);
        if (index < 0) {
          return { id, ok: false, error: "product_not_found" };
        }
        existing[index] = {
          ...existing[index],
          status
        };
        return { id, ok: true, status: existing[index].status };
      });
      productStore.set(tenantId, existing);
      return buildBatchMutationSummary(results, status);
    },
    async deleteProduct(tenantId, productId) {
      const existing = productStore.get(tenantId) || [];
      const next = existing.filter((item) => item.id !== productId);
      if (next.length === existing.length) {
        throw createHttpError("product_not_found", 404);
      }
      productStore.set(tenantId, next);
      return { id: productId };
    },
    async registerUser(input) {
      const email = normalizeEmail(input.email);
      const password = String(input.password || "");
      const passwordMinLength = Math.max(Number(input.passwordMinLength || 10), 8);
      const storeName = String(input.storeName || "").trim();
      if (!email) {
        throw createHttpError("email_required", 400);
      }
      if (!isValidEmail(email)) {
        throw createHttpError("email_invalid", 400);
      }
      if (password.length < passwordMinLength) {
        throw createHttpError("password_too_short", 400);
      }
      if (!storeName) {
        throw createHttpError("store_name_required", 400);
      }
      if (storeName.length > 80) {
        throw createHttpError("store_name_too_long", 400);
      }
      if (email === MAIN_EMAIL) {
        credentialStore.set(email, {
          actorId: MAIN_ACTOR_ID,
          passwordHash: hashPassword(password)
        });
        ensureMembership(MAIN_ACTOR_ID, MAIN_TENANT_ID, "owner");
        return {
          actorId: MAIN_ACTOR_ID,
          tenantId: MAIN_TENANT_ID
        };
      }

      if (credentialStore.has(email)) {
        throw createHttpError("email_already_exists", 409);
      }

      const actorId = `u_${randomUUID().slice(0, 8)}`;
      const tenantId = `tenant_${randomUUID().slice(0, 8)}`;
      const tenantName = storeName;

      credentialStore.set(email, {
        actorId,
        passwordHash: hashPassword(password)
      });

      tenants.push({ id: tenantId, name: tenantName });
      memberships.push({ userId: actorId, tenantId, role: "owner" });
      postStore.set(tenantId, []);
      productStore.set(tenantId, []);

      return {
        actorId,
        tenantId
      };
    },
    async loginUser(input) {
      const email = normalizeEmail(input.email);
      const password = String(input.password || "");
      const passwordMinLength = Math.max(Number(input.passwordMinLength || 10), 8);
      if (!email || !password || password.length < Math.min(passwordMinLength, 8)) {
        throw createHttpError("invalid_credentials", 401);
      }

      const hit = credentialStore.get(email);
      if (!hit || !verifyPassword(password, hit.passwordHash)) {
        throw createHttpError("invalid_credentials", 401);
      }
      if (needsPasswordRehash(hit.passwordHash)) {
        credentialStore.set(email, {
          ...hit,
          passwordHash: hashPassword(password)
        });
      }

      return {
        actorId: hit.actorId
      };
    },
    async createAuthSession(input = {}) {
      authSessionStore.set(String(input.tokenHash || ""), {
        actorId: String(input.actorId || "").trim(),
        expiresAt: String(input.expiresAt || "")
      });
    },
    async resolveAuthSession(tokenHash) {
      const hit = authSessionStore.get(String(tokenHash || ""));
      if (!hit) {
        return null;
      }
      const expiresAtMs = Date.parse(String(hit.expiresAt || ""));
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        authSessionStore.delete(String(tokenHash || ""));
        return null;
      }
      return { actorId: String(hit.actorId || "").trim(), expiresAt: hit.expiresAt };
    },
    async deleteAuthSession(tokenHash) {
      authSessionStore.delete(String(tokenHash || ""));
    },
    async consumeAuthThrottle(identifier, limit, windowMs) {
      const key = String(identifier || "unknown");
      const now = Date.now();
      const existing = authThrottleStore.get(key);
      if (!existing || now >= existing.resetAt) {
        authThrottleStore.set(key, { count: 1, resetAt: now + Number(windowMs || 60_000) });
        return;
      }
      existing.count += 1;
      if (existing.count > Number(limit || 10)) {
        const err = createHttpError("rate_limited", 429);
        err.retryAfterMs = Math.max(0, existing.resetAt - now);
        throw err;
      }
    },
    async appendAuditEvent(event) {
      auditEvents.unshift({ ...event, id: randomUUID(), createdAt: new Date().toISOString() });
      if (auditEvents.length > 1000) {
        auditEvents.length = 1000;
      }
    },
    async listAuditEvents(tenantId, query = {}) {
      const normalized = normalizeAuditQuery(query);
      return auditEvents
        .filter((item) => item.tenantId === tenantId)
        .filter((item) => (normalized.action ? item.action === normalized.action : true))
        .filter((item) => (normalized.actorId ? item.actorId === normalized.actorId : true))
        .filter((item) => (normalized.resourceType ? item.resourceType === normalized.resourceType : true))
        .filter((item) => (normalized.requestId ? item.requestId === normalized.requestId : true))
        .filter((item) => (normalized.traceId ? String(item.metadata?.event?.traceId || "") === normalized.traceId : true))
        .filter((item) => (normalized.since ? Date.parse(item.createdAt) >= Date.parse(normalized.since) : true))
        .slice(0, normalized.limit);
    },
    async close() {
      return;
    }
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(String(password || ""), salt, 64).toString("hex");
  return `s1$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  const normalized = String(storedHash || "");
  if (!normalized) {
    return false;
  }
  if (!normalized.startsWith("s1$")) {
    return timingSafeEqualHex(normalized, createHash("sha256").update(String(password || "")).digest("hex"));
  }
  const [, salt, expected] = normalized.split("$");
  if (!salt || !expected) {
    return false;
  }
  const actual = scryptSync(String(password || ""), salt, 64).toString("hex");
  return timingSafeEqualHex(expected, actual);
}

function needsPasswordRehash(storedHash) {
  return !String(storedHash || "").startsWith("s1$");
}

function timingSafeEqualHex(left, right) {
  const leftBuf = Buffer.from(String(left || ""), "utf8");
  const rightBuf = Buffer.from(String(right || ""), "utf8");
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}

function bootstrapMainAccountBinding() {
  credentialStore.set(MAIN_EMAIL, {
    actorId: MAIN_ACTOR_ID,
    passwordHash: hashPassword("123456")
  });
  ensureMembership(MAIN_ACTOR_ID, MAIN_TENANT_ID, "owner");
}

function ensureMembership(userId, tenantId, role) {
  const existing = memberships.find((item) => item.userId === userId && item.tenantId === tenantId);
  if (existing) {
    existing.role = role;
    return;
  }
  memberships.push({ userId, tenantId, role });
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
  return {
    limit: Math.min(Math.max(limit, 1), 1000),
    action: query.action,
    actorId: query.actorId,
    resourceType: query.resourceType,
    requestId: query.requestId,
    traceId: query.traceId,
    since: isValidDateInput(query.since) ? query.since : undefined
  };
}

function isValidDateInput(value) {
  if (!value) {
    return false;
  }
  return Number.isFinite(Date.parse(String(value)));
}

function normalizePostInput(input, current = {}) {
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
    triggerTags: normalizeStringArray(source.triggerTags, current.triggerTags),
    metrics: normalizePostMetrics(mergedMetrics)
  };
}

function normalizeStringArray(inputValue, fallbackValue = []) {
  if (Array.isArray(inputValue)) {
    return inputValue.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (Array.isArray(fallbackValue)) {
    return fallbackValue.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return [];
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

function clonePost(post) {
  return {
    ...post,
    triggerTags: [...(post.triggerTags || [])],
    metrics: normalizePostMetrics(post.metrics)
  };
}

function buildDefaultOnboardingState(tenantId) {
  return normalizeOnboardingState({
    tenantId,
    steps: DEFAULT_ONBOARDING_STEPS.map((item) => ({ ...item, completedAt: null }))
  });
}

function normalizeOnboardingState(state) {
  const steps = Array.isArray(state?.steps)
    ? state.steps.map((item) => ({
        key: String(item?.key || "").trim(),
        label: String(item?.label || "").trim(),
        completedAt: item?.completedAt ? String(item.completedAt) : null
      }))
    : [];
  const safeSteps = steps.filter((item) => item.key && item.label);
  const completedCount = safeSteps.filter((item) => Boolean(item.completedAt)).length;
  return {
    tenantId: String(state?.tenantId || "").trim(),
    completedCount,
    totalCount: safeSteps.length,
    isComplete: safeSteps.length > 0 && completedCount === safeSteps.length,
    steps: safeSteps
  };
}

function cloneOnboardingState(state) {
  return {
    ...state,
    steps: (state.steps || []).map((item) => ({ ...item }))
  };
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

function normalizeBrandStrategyIntakeInput(input, current = null) {
  const brandName = String(input?.brandName ?? current?.brandName ?? "").trim();
  if (!brandName) {
    throw createHttpError("brand_strategy_brand_name_required", 400);
  }
  if (brandName.length > 120) {
    throw createHttpError("brand_strategy_brand_name_too_long", 400);
  }
  const industry = String(input?.industry ?? current?.industry ?? "general").trim() || "general";
  const targetAudience = String(input?.targetAudience ?? current?.targetAudience ?? "").trim();
  const businessGoal = String(input?.businessGoal ?? current?.businessGoal ?? "").trim();
  const tone = String(input?.tone ?? current?.tone ?? "專業親切").trim() || "專業親切";
  const constraints = String(input?.constraints ?? current?.constraints ?? "").trim();
  const notes = String(input?.notes ?? current?.notes ?? "").trim();
  const keywords = normalizeBrandStrategyKeywords(input?.keywords ?? current?.keywords ?? []);
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

function cloneBrandStrategyIntake(item) {
  return {
    ...item,
    keywords: Array.isArray(item?.keywords) ? [...item.keywords] : []
  };
}

function cloneBrandStrategyPlan(item) {
  return {
    ...item,
    algorithmSignals: Array.isArray(item?.algorithmSignals)
      ? item.algorithmSignals.map((signal) => ({ ...signal }))
      : [],
    contentPillars: Array.isArray(item?.contentPillars)
      ? item.contentPillars.map((pillar) => ({ ...pillar }))
      : [],
    weeklyCadence: item?.weeklyCadence ? { ...item.weeklyCadence } : { reels: 0, feed: 0, story: 0 },
    copyFramework: {
      voice: String(item?.copyFramework?.voice || ""),
      hookTemplates: Array.isArray(item?.copyFramework?.hookTemplates)
        ? item.copyFramework.hookTemplates.map((value) => String(value || ""))
        : [],
      ctaTemplates: Array.isArray(item?.copyFramework?.ctaTemplates)
        ? item.copyFramework.ctaTemplates.map((value) => String(value || ""))
        : [],
      captionStructure: Array.isArray(item?.copyFramework?.captionStructure)
        ? item.copyFramework.captionStructure.map((value) => String(value || ""))
        : []
    },
    imagePromptFramework: {
      styleDirection: String(item?.imagePromptFramework?.styleDirection || ""),
      prompts: Array.isArray(item?.imagePromptFramework?.prompts)
        ? item.imagePromptFramework.prompts.map((prompt) => ({
            scenario: String(prompt?.scenario || ""),
            prompt: String(prompt?.prompt || "")
          }))
        : []
    },
    executionChecklist: Array.isArray(item?.executionChecklist)
      ? item.executionChecklist.map((value) => String(value || ""))
      : []
  };
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
      "每 7 天回顧 Reach/Saves/DMs，保留高表現主題並淘汰低效 Hook"
    ]
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
  return createHash("sha256").update(`${randomUUID()}_${Date.now()}`).digest("hex").slice(0, 24);
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

function summarizeTenantMetrics(posts) {
  const totals = {
    reach: 0,
    saves: 0,
    dms: 0,
    clicks: 0,
    orders: 0
  };
  for (const post of posts) {
    const metrics = post?.metrics || {};
    totals.reach += Number(metrics.reach || 0);
    totals.saves += Number(metrics.saves || 0);
    totals.dms += Number(metrics.dms || 0);
    totals.clicks += Number(metrics.clicks || 0);
    totals.orders += Number(metrics.orders || 0);
  }
  return totals;
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

function parseMentionsFromText(body) {
  const matches = String(body || "").match(/@([a-zA-Z0-9_]+)/g) || [];
  const values = matches
    .map((item) => String(item || "").replace(/^@/, "").trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("u_") ? item : `u_${item}`));
  return [...new Set(values)].slice(0, 10);
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
    hookScripts: ["3 坪也能做出高級感？先看這 1 個角落", "預算 3000 內，這組搭配最不踩雷"] ,
    monthlyThemePrefix: "家居"
  },
  coffee: {
    key: "coffee",
    label: "咖啡餐飲",
    strategy: "以風味教育 + 現場氛圍 + 限時活動，提高來店與回購。",
    pillars: ["風味知識", "吧台職人感", "檔期活動轉單"],
    topicPacks: ["豆單故事包", "特調製程包", "來店互動問答包"],
    hookScripts: ["同一支豆，為什麼今天喝起來更甜？", "這杯是熟客回購率最高的特調"] ,
    monthlyThemePrefix: "咖啡"
  },
  general: {
    key: "general",
    label: "通用零售",
    strategy: "以需求情境、使用成果與常見疑問回覆構成穩定轉換漏斗。",
    pillars: ["需求痛點", "使用成果", "成交引導"],
    topicPacks: ["新手入門包", "常見問題包", "限時活動包"],
    hookScripts: ["先別急著買，先看這 3 個判斷重點", "90% 新客都會先問這個問題"] ,
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
