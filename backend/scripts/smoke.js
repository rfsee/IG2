const BASE_URL = String(process.env.BASE_URL || "http://127.0.0.1:8793").replace(/\/+$/, "");
const MAIN_EMAIL = String(process.env.MAIN_EMAIL || "main@gmail.com").trim();
const MAIN_PASSWORD = String(process.env.MAIN_PASSWORD || "1234567890");
const ISOLATION_EMAIL = String(process.env.ISOLATION_EMAIL || "smoke_isolation@test.local").trim();
const ISOLATION_PASSWORD = String(process.env.ISOLATION_PASSWORD || "1234567890");
const ISOLATION_STORE_NAME = String(process.env.ISOLATION_STORE_NAME || "smoke_isolation_store").trim();
const AUTH_REGISTER_ENABLED = parseEnvBoolean(process.env.AUTH_REGISTER_ENABLED, true);
const AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX = String(process.env.AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX || "").trim();
const AUTH_REGISTER_EMAIL_ALLOWLIST = buildRegexOrNull(AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX);
const FORBIDDEN_REGISTER_EMAIL = String(process.env.FORBIDDEN_REGISTER_EMAIL || "external_forbidden@public.test").trim();

async function main() {
  let postId = "";
  let productId = "";
  let upgradeCreatedPostIds = [];
  let replayCreatedPostIds = [];
  let missionCreatedPostIds = [];
  const marker = `smoke_${Math.random().toString(36).slice(2, 9)}`;
  const traceId = `trace_${marker}`;
  const reqPostCreate = `req_${marker}_post_create`;
  const reqPostUpdate = `req_${marker}_post_update`;
  const reqProductCreate = `req_${marker}_product_create`;
  const reqProductUpdate = `req_${marker}_product_update`;
  const reqPostBatch = `req_${marker}_post_batch`;
  const reqProductBatch = `req_${marker}_product_batch`;
  const reqDmClassify = `req_${marker}_dm_classify`;
  const reqDmPlaybook = `req_${marker}_dm_playbook`;
  const reqAlertRule = `req_${marker}_alert_rule`;
  const reqAlertsList = `req_${marker}_alerts_list`;
  const reqWorkspaceDaily = `req_${marker}_workspace_daily`;
  const reqContentUpgradeView = `req_${marker}_content_upgrade_view`;
  const reqContentUpgradeApply = `req_${marker}_content_upgrade_apply`;
  const reqContentUpgradeApplyMissing = `req_${marker}_content_upgrade_apply_missing`;
  const reqContentUpgradeHistory = `req_${marker}_content_upgrade_history`;
  const reqContentUpgradeBatchKpi = `req_${marker}_content_upgrade_batch_kpi`;
  const reqContentUpgradeMonthlyMission = `req_${marker}_content_upgrade_monthly_mission`;
  const reqContentUpgradeMonthlyMissionApply = `req_${marker}_content_upgrade_monthly_mission_apply`;
  const reqContentUpgradeMonthlyMissionInvalid = `req_${marker}_content_upgrade_monthly_mission_invalid`;
  const reqContentUpgradeReplay = `req_${marker}_content_upgrade_replay`;
  const reqBrandStrategyIntakeSave = `req_${marker}_brand_strategy_intake_save`;
  const reqBrandStrategyIntakeSaveInvalid = `req_${marker}_brand_strategy_intake_save_invalid`;
  const reqBrandStrategyIntakeGet = `req_${marker}_brand_strategy_intake_get`;
  const reqBrandStrategyGenerate = `req_${marker}_brand_strategy_generate`;
  const reqBrandStrategyGenerateWrongIntake = `req_${marker}_brand_strategy_generate_wrong_intake`;
  const reqBrandStrategyPlanGet = `req_${marker}_brand_strategy_plan_get`;
  const reqBrandStrategyGenerateCrossTenant = `req_${marker}_brand_strategy_generate_cross_tenant`;
  const reqReportShare = `req_${marker}_report_share`;
  const reqReportSharedView = `req_${marker}_report_shared_view`;
  const reqCommentCreate = `req_${marker}_comment_create`;
  const reqCommentTooLong = `req_${marker}_comment_too_long`;
  const reqCommentsList = `req_${marker}_comments_list`;
  const reqPostDelete = `req_${marker}_post_delete`;
  const reqProductDelete = `req_${marker}_product_delete`;
  const reqTenantsList = `req_${marker}_tenants_list`;
  const health = await fetchJson("/health");
  assert(health.status === 200, `health check failed: ${health.status}`);

  if (AUTH_REGISTER_ENABLED && AUTH_REGISTER_EMAIL_ALLOWLIST) {
    const deniedRegister = await postJson("/api/auth/register", {
      email: FORBIDDEN_REGISTER_EMAIL,
      password: "123456",
      storeName: `forbidden_${marker}`
    });
    assert(deniedRegister.status === 403, `forbidden register expected 403: ${deniedRegister.status}`);
    assert(
      String(deniedRegister.json.error || "") === "auth_register_email_not_allowed",
      "forbidden register error mismatch"
    );
    assert(
      AUTH_REGISTER_EMAIL_ALLOWLIST.test(ISOLATION_EMAIL),
      "ISOLATION_EMAIL does not match AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX"
    );
  }

  const mainLogin = await postJson("/api/auth/login", { email: MAIN_EMAIL, password: MAIN_PASSWORD });
  let mainAuthPayload = mainLogin;
  if (mainLogin.status === 401) {
    const mainRegister = await postJson("/api/auth/register", {
      email: MAIN_EMAIL,
      password: MAIN_PASSWORD,
      storeName: "Smoke Main Store"
    });
    assert(mainRegister.status === 201, `main register failed after login miss: ${mainRegister.status}`);
    mainAuthPayload = {
      status: 200,
      json: mainRegister.json,
      headers: mainRegister.headers
    };
  }
  assert(mainAuthPayload.status === 200, `main login failed: ${mainAuthPayload.status}`);
  const mainCookie = buildSessionCookie(mainAuthPayload.headers || mainLogin.headers);
  const mainToken = String(mainAuthPayload.json.token || mainCookie || "");
  const mainTenantId =
    mainAuthPayload.json.items?.find((item) => item.tenantId === "tenant_default")?.tenantId ||
    mainAuthPayload.json.items?.[0]?.tenantId;
  assert((mainToken || mainCookie) && mainTenantId, "main auth payload missing session or tenant");

  try {
    const brandStrategyIntakeSave = await authedJson(mainToken, mainTenantId, "POST", "/api/brand-strategy/intake", {
      brandName: `Smoke Brand ${marker}`,
      industry: "furniture",
      targetAudience: "25-40 歲租屋族",
      businessGoal: "提升 IG 私訊詢單率",
      tone: "專業親切",
      keywords: ["小坪數", "改造", "收納"],
      constraints: "每週拍攝資源有限",
      notes: "主打可快速複製的場景方案"
    }, {
      "x-request-id": reqBrandStrategyIntakeSave,
      "x-trace-id": traceId
    });
    assert(brandStrategyIntakeSave.status === 200, `brand strategy intake save failed: ${brandStrategyIntakeSave.status}`);
    const brandStrategyIntakeId = String(brandStrategyIntakeSave.json.item?.id || "");
    assert(brandStrategyIntakeId.length > 0, "brand strategy intake save missing id");

    const brandStrategyIntakeGet = await authedJson(mainToken, mainTenantId, "GET", "/api/brand-strategy/intake", undefined, {
      "x-request-id": reqBrandStrategyIntakeGet,
      "x-trace-id": traceId
    });
    assert(brandStrategyIntakeGet.status === 200, `brand strategy intake get failed: ${brandStrategyIntakeGet.status}`);
    assert(String(brandStrategyIntakeGet.json.item?.id || "") === brandStrategyIntakeId, "brand strategy intake get id mismatch");
    assert(String(brandStrategyIntakeGet.json.item?.brandName || "").includes("Smoke Brand"), "brand strategy intake get brandName mismatch");

    const brandStrategyIntakeInvalid = await authedJson(mainToken, mainTenantId, "POST", "/api/brand-strategy/intake", {
      industry: "furniture",
      keywords: ["小坪數"]
    }, {
      "x-request-id": reqBrandStrategyIntakeSaveInvalid,
      "x-trace-id": traceId
    });
    assert(brandStrategyIntakeInvalid.status === 400, `brand strategy intake missing brandName expected 400: ${brandStrategyIntakeInvalid.status}`);
    assert(
      String(brandStrategyIntakeInvalid.json.error || "") === "brand_strategy_brand_name_required",
      "brand strategy intake missing brandName error mismatch"
    );

    const brandStrategyGenerate = await authedJson(mainToken, mainTenantId, "POST", "/api/brand-strategy/generate", {
      intakeId: brandStrategyIntakeId
    }, {
      "x-request-id": reqBrandStrategyGenerate,
      "x-trace-id": traceId
    });
    assert(brandStrategyGenerate.status === 200, `brand strategy generate failed: ${brandStrategyGenerate.status}`);
    assert(String(brandStrategyGenerate.json.item?.intakeId || "") === brandStrategyIntakeId, "brand strategy generate intakeId mismatch");
    assert(Array.isArray(brandStrategyGenerate.json.item?.contentPillars), "brand strategy generate contentPillars invalid");
    assert(Array.isArray(brandStrategyGenerate.json.item?.imagePromptFramework?.prompts), "brand strategy generate prompts invalid");

    const brandStrategyGenerateWrongIntake = await authedJson(mainToken, mainTenantId, "POST", "/api/brand-strategy/generate", {
      intakeId: `wrong_${marker}`
    }, {
      "x-request-id": reqBrandStrategyGenerateWrongIntake,
      "x-trace-id": traceId
    });
    assert(brandStrategyGenerateWrongIntake.status === 404, `brand strategy generate wrong intake expected 404: ${brandStrategyGenerateWrongIntake.status}`);
    assert(
      String(brandStrategyGenerateWrongIntake.json.error || "") === "brand_strategy_intake_not_found",
      "brand strategy generate wrong intake error mismatch"
    );

    const brandStrategyPlanGet = await authedJson(mainToken, mainTenantId, "GET", "/api/brand-strategy/plan", undefined, {
      "x-request-id": reqBrandStrategyPlanGet,
      "x-trace-id": traceId
    });
    assert(brandStrategyPlanGet.status === 200, `brand strategy plan get failed: ${brandStrategyPlanGet.status}`);
    assert(String(brandStrategyPlanGet.json.item?.id || "").length > 0, "brand strategy plan missing id");
    assert(String(brandStrategyPlanGet.json.item?.intakeId || "") === brandStrategyIntakeId, "brand strategy plan intakeId mismatch");

    const postCreate = await authedJson(mainToken, mainTenantId, "POST", "/api/posts", {
      title: `smoke post ${marker}`,
      type: "feed",
      status: "草稿",
      date: "03/18",
      week: "W3",
      script: "smoke script",
      cta: "smoke cta",
      link: `https://example.com/post/${marker}`,
      triggerTags: ["smoke", marker],
      metrics: { reach: 10, saves: 2, dms: 1, clicks: 3, orders: 0 }
    }, {
      "x-request-id": reqPostCreate,
      "x-trace-id": traceId
    });
    assert(postCreate.status === 201, `create post failed: ${postCreate.status}`);
    postId = String(postCreate.json.item?.id || "");
    assert(postId, "create post response missing id");

    const postUpdate = await authedJson(mainToken, mainTenantId, "PUT", `/api/posts/${encodeURIComponent(postId)}`, {
      title: "smoke post updated",
      status: "已發佈",
      metrics: { clicks: 99 }
    }, {
      "x-request-id": reqPostUpdate,
      "x-trace-id": traceId
    });
    assert(postUpdate.status === 200, `update post failed: ${postUpdate.status}`);
    assert(postUpdate.json.item?.metrics?.clicks === 99, "post metrics update not applied");

    const productCreate = await authedJson(mainToken, mainTenantId, "POST", "/api/products", {
      name: `smoke product ${marker}`,
      price: 456
    }, {
      "x-request-id": reqProductCreate,
      "x-trace-id": traceId
    });
    assert(productCreate.status === 201, `create product failed: ${productCreate.status}`);
    productId = String(productCreate.json.item?.id || "");
    assert(productId, "create product response missing id");

    const productUpdate = await authedJson(mainToken, mainTenantId, "PUT", `/api/products/${encodeURIComponent(productId)}`, {
      name: "smoke product updated",
      price: 789
    }, {
      "x-request-id": reqProductUpdate,
      "x-trace-id": traceId
    });
    assert(productUpdate.status === 200, `update product failed: ${productUpdate.status}`);

    const postBatch = await authedJson(mainToken, mainTenantId, "POST", "/api/posts/batch", {
      ids: [postId, "missing_post_for_batch"],
      status: "待上架"
    }, {
      "x-request-id": reqPostBatch,
      "x-trace-id": traceId
    });
    assert(postBatch.status === 200, `post batch failed: ${postBatch.status}`);
    assert(Number(postBatch.json.item?.requestedCount || 0) === 2, "post batch requestedCount mismatch");
    assert(Number(postBatch.json.item?.successCount || 0) === 1, "post batch successCount mismatch");
    assert(Number(postBatch.json.item?.failedCount || 0) === 1, "post batch failedCount mismatch");
    assert(postBatch.json.item?.results?.some((item) => item.id === postId && item.ok === true && item.status === "待上架"), "post batch success item missing");
    assert(postBatch.json.item?.results?.some((item) => item.id === "missing_post_for_batch" && item.ok === false), "post batch failure item missing");

    const productBatch = await authedJson(mainToken, mainTenantId, "POST", "/api/products/batch", {
      ids: [productId, "missing_product_for_batch"],
      status: "paused"
    }, {
      "x-request-id": reqProductBatch,
      "x-trace-id": traceId
    });
    assert(productBatch.status === 200, `product batch failed: ${productBatch.status}`);
    assert(Number(productBatch.json.item?.requestedCount || 0) === 2, "product batch requestedCount mismatch");
    assert(Number(productBatch.json.item?.successCount || 0) === 1, "product batch successCount mismatch");
    assert(Number(productBatch.json.item?.failedCount || 0) === 1, "product batch failedCount mismatch");
    assert(productBatch.json.item?.results?.some((item) => item.id === productId && item.ok === true && item.status === "paused"), "product batch success item missing");
    assert(productBatch.json.item?.results?.some((item) => item.id === "missing_product_for_batch" && item.ok === false), "product batch failure item missing");

    const dmClassify = await authedJson(mainToken, mainTenantId, "POST", "/api/dm/classify-intent", {
      postId,
      question: "這個價格多少？",
      selectedIntent: "price"
    }, {
      "x-request-id": reqDmClassify,
      "x-trace-id": traceId
    });
    assert(dmClassify.status === 200, `dm classify failed: ${dmClassify.status}`);
    assert(String(dmClassify.json.item?.intent || "") === "price", "dm classify intent mismatch");

    const dmPlaybook = await authedJson(mainToken, mainTenantId, "POST", "/api/dm/reply-playbook", {
      postId,
      postTitle: "smoke post updated",
      postLink: `https://example.com/post/${marker}`,
      question: "這個價格多少？",
      intent: "price"
    }, {
      "x-request-id": reqDmPlaybook,
      "x-trace-id": traceId
    });
    assert(dmPlaybook.status === 200, `dm playbook failed: ${dmPlaybook.status}`);
    assert(String(dmPlaybook.json.item?.script || "").length > 0, "dm playbook missing script");

    const alertRule = await authedJson(mainToken, mainTenantId, "POST", "/api/alerts/rules", {
      metricKey: "reach",
      operator: "gt",
      threshold: 1,
      isActive: true
    }, {
      "x-request-id": reqAlertRule,
      "x-trace-id": traceId
    });
    assert(alertRule.status === 200, `alert rule upsert failed: ${alertRule.status}`);
    assert(String(alertRule.json.item?.id || "").length > 0, "alert rule missing id");

    const inactiveAlertRule = await authedJson(mainToken, mainTenantId, "POST", "/api/alerts/rules", {
      metricKey: "orders",
      operator: "gt",
      threshold: 0,
      isActive: false
    }, {
      "x-request-id": `${reqAlertRule}_inactive`,
      "x-trace-id": traceId
    });
    assert(inactiveAlertRule.status === 200, `inactive alert rule upsert failed: ${inactiveAlertRule.status}`);

    const alerts = await authedJson(mainToken, mainTenantId, "GET", "/api/alerts", undefined, {
      "x-request-id": reqAlertsList,
      "x-trace-id": traceId
    });
    assert(alerts.status === 200, `alerts list failed: ${alerts.status}`);
    assert(Array.isArray(alerts.json.item?.rules), "alerts rules payload invalid");
    assert(Array.isArray(alerts.json.item?.items), "alerts events payload invalid");
    assert(alerts.json.item.rules.length >= 2, "alerts expected active + inactive rules in list");
    assert(alerts.json.item.rules.some((rule) => rule.isActive === false), "alerts expected at least one inactive rule");
    assert(alerts.json.item.items.length >= 1, "alerts expected at least one triggered event");

    const workspace = await authedJson(mainToken, mainTenantId, "GET", "/api/workspace/daily", undefined, {
      "x-request-id": reqWorkspaceDaily,
      "x-trace-id": traceId
    });
    assert(workspace.status === 200, `workspace daily failed: ${workspace.status}`);
    assert(Array.isArray(workspace.json.item?.tasks), "workspace tasks payload invalid");
    assert(typeof workspace.json.item?.summary?.pendingPosts === "number", "workspace summary pendingPosts invalid");
    assert(typeof workspace.json.item?.summary?.alertCount === "number", "workspace summary alertCount invalid");

    const contentUpgrade = await authedJson(mainToken, mainTenantId, "GET", "/api/content-upgrade", undefined, {
      "x-request-id": reqContentUpgradeView,
      "x-trace-id": traceId
    });
    assert(contentUpgrade.status === 200, `content upgrade view failed: ${contentUpgrade.status}`);
    assert(Array.isArray(contentUpgrade.json.item?.packages), "content upgrade packages payload invalid");
    assert(contentUpgrade.json.item.packages.length >= 4, "content upgrade expected at least 4 packages");
    const selectedUpgradePackageId = String(contentUpgrade.json.item.packages?.[0]?.id || "");
    assert(selectedUpgradePackageId.length > 0, "content upgrade missing package id");

    const contentUpgradeApply = await authedJson(mainToken, mainTenantId, "POST", "/api/content-upgrade/apply", {
      packageId: selectedUpgradePackageId
    }, {
      "x-request-id": reqContentUpgradeApply,
      "x-trace-id": traceId
    });
    assert(contentUpgradeApply.status === 200, `content upgrade apply failed: ${contentUpgradeApply.status}`);
    assert(String(contentUpgradeApply.json.item?.packageId || "") === selectedUpgradePackageId, "content upgrade apply package mismatch");
    assert(Array.isArray(contentUpgradeApply.json.item?.actions), "content upgrade apply actions payload invalid");
    assert(contentUpgradeApply.json.item.actions.length >= 1, "content upgrade apply expected actions");
    assert(Array.isArray(contentUpgradeApply.json.item?.generatedTasks), "content upgrade apply generatedTasks payload invalid");
    assert(contentUpgradeApply.json.item.generatedTasks.length >= 1, "content upgrade apply expected generated tasks");
    assert(Array.isArray(contentUpgradeApply.json.item?.draftPosts), "content upgrade apply draftPosts payload invalid");
    assert(contentUpgradeApply.json.item.draftPosts.length >= 1, "content upgrade apply expected draft posts");
    assert(Array.isArray(contentUpgradeApply.json.item?.createdPostIds), "content upgrade apply createdPostIds payload invalid");
    assert(contentUpgradeApply.json.item.createdPostIds.length === contentUpgradeApply.json.item.draftPosts.length, "content upgrade apply createdPostIds count mismatch");
    assert(Number(contentUpgradeApply.json.item?.appliedCount || 0) === contentUpgradeApply.json.item.draftPosts.length, "content upgrade apply appliedCount mismatch");
    assert(String(contentUpgradeApply.json.item?.batchId || "").length > 0, "content upgrade apply batchId missing");
    upgradeCreatedPostIds = contentUpgradeApply.json.item.createdPostIds.map((id) => String(id || "").trim()).filter(Boolean);
    assert(upgradeCreatedPostIds.length >= 1, "content upgrade apply expected at least 1 created post");
    assert(typeof contentUpgradeApply.json.item?.executionSummary?.draftCount === "number", "content upgrade apply executionSummary invalid");
    assert(
      Number(contentUpgradeApply.json.item.executionSummary?.taskCount || 0) === contentUpgradeApply.json.item.generatedTasks.length,
      "content upgrade apply executionSummary taskCount mismatch"
    );
    assert(
      Number(contentUpgradeApply.json.item.executionSummary?.draftCount || 0) === contentUpgradeApply.json.item.draftPosts.length,
      "content upgrade apply executionSummary draftCount mismatch"
    );

    const contentUpgradeApplyMissing = await authedJson(mainToken, mainTenantId, "POST", "/api/content-upgrade/apply", {}, {
      "x-request-id": reqContentUpgradeApplyMissing,
      "x-trace-id": traceId
    });
    assert(contentUpgradeApplyMissing.status === 400, `content upgrade apply missing packageId expected 400: ${contentUpgradeApplyMissing.status}`);
    assert(
      String(contentUpgradeApplyMissing.json.error || "") === "content_upgrade_package_id_required",
      "content upgrade apply missing packageId error mismatch"
    );

    const contentUpgradeHistory = await authedJson(mainToken, mainTenantId, "GET", "/api/content-upgrade/history?limit=10", undefined, {
      "x-request-id": reqContentUpgradeHistory,
      "x-trace-id": traceId
    });
    assert(contentUpgradeHistory.status === 200, `content upgrade history failed: ${contentUpgradeHistory.status}`);
    assert(Array.isArray(contentUpgradeHistory.json.items), "content upgrade history payload invalid");
    assert(
      contentUpgradeHistory.json.items.some((item) => item.requestId === reqContentUpgradeApply),
      "content upgrade history missing latest apply by requestId"
    );
    const historyHit = contentUpgradeHistory.json.items.find((item) => item.requestId === reqContentUpgradeApply);
    assert(historyHit, "content upgrade history missing latest apply item");
    assert(Number(historyHit.appliedCount || 0) >= 1, "content upgrade history missing appliedCount");
    assert(Array.isArray(historyHit.createdPostIds) && historyHit.createdPostIds.length >= 1, "content upgrade history missing createdPostIds");
    assert(
      contentUpgradeApply.json.item.createdPostIds.slice(0, 5).every((id) => historyHit.createdPostIds.includes(id)),
      "content upgrade history createdPostIds mismatch"
    );
    assert(String(historyHit.batchId || "").length > 0, "content upgrade history batchId missing");
    assert(String(historyHit.batchId || "") === String(contentUpgradeApply.json.item.batchId || ""), "content upgrade history batchId mismatch");

    const contentUpgradeHistoryByBatch = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/content-upgrade/history?limit=10&batchId=${encodeURIComponent(historyHit.batchId)}`,
      undefined,
      {
        "x-request-id": `${reqContentUpgradeHistory}_batch`,
        "x-trace-id": traceId
      }
    );
    assert(contentUpgradeHistoryByBatch.status === 200, `content upgrade history by batch failed: ${contentUpgradeHistoryByBatch.status}`);
    assert(
      contentUpgradeHistoryByBatch.json.items.every((item) => String(item.batchId || "") === String(historyHit.batchId || "")),
      "content upgrade history by batch returned mismatched batchId"
    );

    const contentUpgradeBatchKpi = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/content-upgrade/batch-kpi?batchId=${encodeURIComponent(historyHit.batchId)}`,
      undefined,
      {
        "x-request-id": reqContentUpgradeBatchKpi,
        "x-trace-id": traceId
      }
    );
    assert(contentUpgradeBatchKpi.status === 200, `content upgrade batch kpi failed: ${contentUpgradeBatchKpi.status}`);
    assert(String(contentUpgradeBatchKpi.json.item?.batchId || "") === String(historyHit.batchId || ""), "content upgrade batch kpi batchId mismatch");
    assert(Number(contentUpgradeBatchKpi.json.item?.postCount || 0) >= 1, "content upgrade batch kpi expected postCount");
    assert(typeof contentUpgradeBatchKpi.json.item?.metrics?.reach === "number", "content upgrade batch kpi metrics invalid");

    const reportShare = await authedJson(
      mainToken,
      mainTenantId,
      "POST",
      "/api/reports/share",
      { batchId: historyHit.batchId, expiresInDays: 7 },
      {
        "x-request-id": reqReportShare,
        "x-trace-id": traceId
      }
    );
    assert(reportShare.status === 201, `report share create failed: ${reportShare.status}`);
    assert(String(reportShare.json.item?.batchId || "") === String(historyHit.batchId || ""), "report share batchId mismatch");
    assert(String(reportShare.json.item?.token || "").length > 0, "report share token missing");

    const sharedReportView = await fetchJson(`/api/reports/shared/${encodeURIComponent(String(reportShare.json.item?.token || ""))}`, {
      headers: {
        "x-request-id": reqReportSharedView,
        "x-trace-id": traceId
      }
    });
    assert(sharedReportView.status === 200, `shared report view failed: ${sharedReportView.status}`);
    assert(String(sharedReportView.json.item?.batchId || "") === String(historyHit.batchId || ""), "shared report batchId mismatch");
    assert(typeof sharedReportView.json.item?.batchKpi?.metrics?.reach === "number", "shared report batchKpi invalid");
    assert(Array.isArray(sharedReportView.json.item?.history), "shared report history invalid");

    const contentUpgradeMonthlyMission = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      "/api/content-upgrade/monthly-mission?month=03",
      undefined,
      {
        "x-request-id": reqContentUpgradeMonthlyMission,
        "x-trace-id": traceId
      }
    );
    assert(contentUpgradeMonthlyMission.status === 200, `content upgrade monthly mission failed: ${contentUpgradeMonthlyMission.status}`);
    assert(String(contentUpgradeMonthlyMission.json.item?.month || "") === "03", "content upgrade monthly mission month mismatch");
    assert(Array.isArray(contentUpgradeMonthlyMission.json.item?.checklist), "content upgrade monthly mission checklist payload invalid");
    assert(contentUpgradeMonthlyMission.json.item.checklist.length >= 1, "content upgrade monthly mission expected checklist");
    assert(typeof contentUpgradeMonthlyMission.json.item?.topic?.hook === "string", "content upgrade monthly mission topic hook invalid");

    const contentUpgradeMonthlyMissionApply = await authedJson(
      mainToken,
      mainTenantId,
      "POST",
      "/api/content-upgrade/monthly-mission/apply",
      { month: "03" },
      {
        "x-request-id": reqContentUpgradeMonthlyMissionApply,
        "x-trace-id": traceId
      }
    );
    assert(contentUpgradeMonthlyMissionApply.status === 200, `content upgrade monthly mission apply failed: ${contentUpgradeMonthlyMissionApply.status}`);
    assert(String(contentUpgradeMonthlyMissionApply.json.item?.month || "") === "03", "content upgrade monthly mission apply month mismatch");
    assert(String(contentUpgradeMonthlyMissionApply.json.item?.batchId || "").length > 0, "content upgrade monthly mission apply batchId missing");
    assert(Array.isArray(contentUpgradeMonthlyMissionApply.json.item?.createdPostIds), "content upgrade monthly mission apply createdPostIds invalid");
    assert(Number(contentUpgradeMonthlyMissionApply.json.item?.appliedCount || 0) === contentUpgradeMonthlyMissionApply.json.item.createdPostIds.length, "content upgrade monthly mission apply count mismatch");
    missionCreatedPostIds = contentUpgradeMonthlyMissionApply.json.item.createdPostIds.map((id) => String(id || "").trim()).filter(Boolean);
    assert(missionCreatedPostIds.length >= 1, "monthly mission apply expected at least 1 created post");

    const contentUpgradeHistoryAfterMission = await authedJson(mainToken, mainTenantId, "GET", "/api/content-upgrade/history?limit=20", undefined, {
      "x-request-id": `${reqContentUpgradeHistory}_after_mission`,
      "x-trace-id": traceId
    });
    assert(contentUpgradeHistoryAfterMission.status === 200, `content upgrade history after mission failed: ${contentUpgradeHistoryAfterMission.status}`);
    const missionHistoryHit = contentUpgradeHistoryAfterMission.json.items.find((item) => item.requestId === reqContentUpgradeMonthlyMissionApply);
    assert(missionHistoryHit, "content upgrade history missing monthly mission apply item");
    assert(String(missionHistoryHit.action || "") === "content_upgrade.monthly_mission.apply", "monthly mission history action mismatch");
    assert(String(missionHistoryHit.batchId || "") === String(contentUpgradeMonthlyMissionApply.json.item?.batchId || ""), "monthly mission history batchId mismatch");

    const contentUpgradeMonthlyMissionInvalid = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      "/api/content-upgrade/monthly-mission?month=13",
      undefined,
      {
        "x-request-id": reqContentUpgradeMonthlyMissionInvalid,
        "x-trace-id": traceId
      }
    );
    assert(
      contentUpgradeMonthlyMissionInvalid.status === 400,
      `invalid monthly mission month expected 400: ${contentUpgradeMonthlyMissionInvalid.status}`
    );
    assert(
      String(contentUpgradeMonthlyMissionInvalid.json.error || "") === "content_upgrade_month_invalid",
      "invalid monthly mission month error mismatch"
    );

    const contentUpgradeReplay = await authedJson(mainToken, mainTenantId, "POST", "/api/content-upgrade/replay", {
      sourceRequestId: reqContentUpgradeMonthlyMissionApply
    }, {
      "x-request-id": reqContentUpgradeReplay,
      "x-trace-id": traceId
    });
    assert(contentUpgradeReplay.status === 200, `content upgrade replay failed: ${contentUpgradeReplay.status}`);
    assert(Number(contentUpgradeReplay.json.item?.replayCount || 0) >= 1, "content upgrade replay expected replayCount");
    assert(Array.isArray(contentUpgradeReplay.json.item?.createdPostIds), "content upgrade replay createdPostIds payload invalid");
    assert(contentUpgradeReplay.json.item.createdPostIds.length >= 1, "content upgrade replay expected createdPostIds");
    assert(
      Number(contentUpgradeReplay.json.item?.replayCount || 0) === contentUpgradeReplay.json.item.createdPostIds.length,
      "content upgrade replay replayCount mismatch"
    );
    assert(
      String(contentUpgradeReplay.json.item?.sourceRequestId || "") === reqContentUpgradeMonthlyMissionApply,
      "content upgrade replay sourceRequestId mismatch"
    );
    assert(String(contentUpgradeReplay.json.item?.sourceHistoryId || "").length > 0, "content upgrade replay missing sourceHistoryId");
    assert(String(contentUpgradeReplay.json.item?.batchId || "").length > 0, "content upgrade replay batchId missing");
    assert(String(contentUpgradeReplay.json.item?.sourceBatchId || "") === String(missionHistoryHit.batchId || ""), "content upgrade replay sourceBatchId mismatch");
    replayCreatedPostIds = contentUpgradeReplay.json.item.createdPostIds.map((id) => String(id || "").trim()).filter(Boolean);

    const commentCreate = await authedJson(mainToken, mainTenantId, "POST", "/api/comments", {
      resourceType: "post",
      resourceId: postId,
      body: "@u_owner 這篇 CTA 再加強一下"
    }, {
      "x-request-id": reqCommentCreate,
      "x-trace-id": traceId
    });
    assert(commentCreate.status === 201, `comment create failed: ${commentCreate.status}`);
    assert(String(commentCreate.json.item?.id || "").length > 0, "comment missing id");
    assert(Array.isArray(commentCreate.json.item?.mentions), "comment mentions payload invalid");
    assert(commentCreate.json.item.mentions.includes("u_owner"), "comment mentions missing u_owner");

    const commentTooLong = await authedJson(mainToken, mainTenantId, "POST", "/api/comments", {
      resourceType: "post",
      resourceId: postId,
      body: "x".repeat(2001)
    }, {
      "x-request-id": reqCommentTooLong,
      "x-trace-id": traceId
    });
    assert(commentTooLong.status === 400, `comment too long expected 400: ${commentTooLong.status}`);
    assert(String(commentTooLong.json.error || "") === "comment_body_too_long", "comment too long error mismatch");

    const commentsList = await authedJson(mainToken, mainTenantId, "GET", `/api/comments?resourceType=post&resourceId=${encodeURIComponent(postId)}`, undefined, {
      "x-request-id": reqCommentsList,
      "x-trace-id": traceId
    });
    assert(commentsList.status === 200, `comments list failed: ${commentsList.status}`);
    assert(Array.isArray(commentsList.json.items), "comments list payload invalid");
    assert(commentsList.json.items.some((item) => item.id === commentCreate.json.item.id), "comments list missing created comment");

    const postsAfterUpgrade = await authedJson(mainToken, mainTenantId, "GET", "/api/posts", undefined, {
      "x-request-id": `${reqContentUpgradeApply}_posts`,
      "x-trace-id": traceId
    });
    assert(postsAfterUpgrade.status === 200, `posts after content upgrade failed: ${postsAfterUpgrade.status}`);
    assert(
      contentUpgradeApply.json.item.createdPostIds.every((createdId) => postsAfterUpgrade.json.items.some((item) => item.id === createdId)),
      "content upgrade apply created posts not found in posts list"
    );
    assert(
      contentUpgradeReplay.json.item.createdPostIds.every((createdId) => postsAfterUpgrade.json.items.some((item) => item.id === createdId)),
      "content upgrade replay created posts not found in posts list"
    );
    assert(
      contentUpgradeMonthlyMissionApply.json.item.createdPostIds.every((createdId) => postsAfterUpgrade.json.items.some((item) => item.id === createdId)),
      "content upgrade monthly mission apply created posts not found in posts list"
    );

    const tenants = await authJson(mainToken, "GET", "/api/tenants", undefined, {
      "x-request-id": reqTenantsList,
      "x-trace-id": traceId
    });
    assert(tenants.status === 200, `tenants list failed: ${tenants.status}`);
    assert(Array.isArray(tenants.json.items), "tenants list payload invalid");

    const audits = await authedJson(mainToken, mainTenantId, "GET", "/api/audit-events?limit=100");
    assert(audits.status === 200, `audit events query failed: ${audits.status}`);
    assert(Array.isArray(audits.json.items), "audit events payload invalid");
    assert(
      audits.json.items.some((item) => item.action === "posts.create" && item.resourceId === postId),
      "audit missing posts.create"
    );
    assert(
      audits.json.items.some((item) => item.action === "posts.update" && item.resourceId === postId),
      "audit missing posts.update"
    );
    assert(
      audits.json.items.some((item) => item.action === "products.create" && item.resourceId === productId),
      "audit missing products.create"
    );
    assert(
      audits.json.items.some((item) => item.action === "products.update" && item.resourceId === productId),
      "audit missing products.update"
    );
    assert(
      audits.json.items.some((item) => item.action === "posts.batch_update"),
      "audit missing posts.batch_update"
    );
    assert(
      audits.json.items.some((item) => item.action === "products.batch_update"),
      "audit missing products.batch_update"
    );
    assert(
      audits.json.items.some((item) => item.action === "dm.classify_intent"),
      "audit missing dm.classify_intent"
    );
    assert(
      audits.json.items.some((item) => item.action === "dm.reply_playbook"),
      "audit missing dm.reply_playbook"
    );
    assert(
      audits.json.items.some((item) => item.action === "alerts.rule.upsert"),
      "audit missing alerts.rule.upsert"
    );
    assert(
      audits.json.items.some((item) => item.action === "alerts.list"),
      "audit missing alerts.list"
    );
    assert(
      audits.json.items.some((item) => item.action === "workspace.daily.list"),
      "audit missing workspace.daily.list"
    );
    assert(
      audits.json.items.some((item) => item.action === "brand_strategy.intake.save"),
      "audit missing brand_strategy.intake.save"
    );
    assert(
      audits.json.items.some((item) => item.action === "brand_strategy.intake.get"),
      "audit missing brand_strategy.intake.get"
    );
    assert(
      audits.json.items.some((item) => item.action === "brand_strategy.plan.generate"),
      "audit missing brand_strategy.plan.generate"
    );
    assert(
      audits.json.items.some((item) => item.action === "brand_strategy.plan.get"),
      "audit missing brand_strategy.plan.get"
    );
    assert(
      audits.json.items.some((item) => item.action === "content_upgrade.view"),
      "audit missing content_upgrade.view"
    );
    assert(
      audits.json.items.some((item) => item.action === "content_upgrade.apply"),
      "audit missing content_upgrade.apply"
    );
    assert(
      audits.json.items.some((item) => item.action === "content_upgrade.history.list"),
      "audit missing content_upgrade.history.list"
    );
    assert(
      audits.json.items.some((item) => item.action === "content_upgrade.batch_kpi.view"),
      "audit missing content_upgrade.batch_kpi.view"
    );
    assert(
      audits.json.items.some((item) => item.action === "reports.share.create"),
      "audit missing reports.share.create"
    );
    assert(
      audits.json.items.some((item) => item.action === "reports.shared.view"),
      "audit missing reports.shared.view"
    );
    assert(
      audits.json.items.some((item) => item.action === "content_upgrade.monthly_mission.view"),
      "audit missing content_upgrade.monthly_mission.view"
    );
    assert(
      audits.json.items.some((item) => item.action === "content_upgrade.monthly_mission.apply"),
      "audit missing content_upgrade.monthly_mission.apply"
    );
    assert(
      audits.json.items.some((item) => item.action === "content_upgrade.replay"),
      "audit missing content_upgrade.replay"
    );
    assert(
      audits.json.items.some((item) => item.action === "comments.create"),
      "audit missing comments.create"
    );
    assert(
      audits.json.items.some((item) => item.action === "comments.list"),
      "audit missing comments.list"
    );

    const postCreateAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqPostCreate)}&limit=20`
    );
    assert(postCreateAudit.status === 200, `audit requestId filter failed: ${postCreateAudit.status}`);
    assert(
      postCreateAudit.json.items.some((item) => item.action === "posts.create" && item.resourceId === postId),
      "audit requestId filter missing posts.create"
    );

    const dmClassifyAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqDmClassify)}&action=dm.classify_intent&limit=20`
    );
    assert(dmClassifyAudit.status === 200, `dm classify audit check failed: ${dmClassifyAudit.status}`);
    assert(
      dmClassifyAudit.json.items.some((item) => item.action === "dm.classify_intent"),
      "audit requestId filter missing dm.classify_intent"
    );

    const dmPlaybookAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqDmPlaybook)}&action=dm.reply_playbook&limit=20`
    );
    assert(dmPlaybookAudit.status === 200, `dm playbook audit check failed: ${dmPlaybookAudit.status}`);
    assert(
      dmPlaybookAudit.json.items.some((item) => item.action === "dm.reply_playbook"),
      "audit requestId filter missing dm.reply_playbook"
    );

    const alertRuleAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqAlertRule)}&action=alerts.rule.upsert&limit=20`
    );
    assert(alertRuleAudit.status === 200, `alert rule audit check failed: ${alertRuleAudit.status}`);
    assert(
      alertRuleAudit.json.items.some((item) => item.action === "alerts.rule.upsert"),
      "audit requestId filter missing alerts.rule.upsert"
    );

    const alertsListAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqAlertsList)}&action=alerts.list&limit=20`
    );
    assert(alertsListAudit.status === 200, `alerts list audit check failed: ${alertsListAudit.status}`);
    assert(
      alertsListAudit.json.items.some((item) => item.action === "alerts.list"),
      "audit requestId filter missing alerts.list"
    );

    const workspaceAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqWorkspaceDaily)}&action=workspace.daily.list&limit=20`
    );
    assert(workspaceAudit.status === 200, `workspace audit check failed: ${workspaceAudit.status}`);
    assert(
      workspaceAudit.json.items.some((item) => item.action === "workspace.daily.list"),
      "audit requestId filter missing workspace.daily.list"
    );

    const brandStrategyIntakeSaveAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqBrandStrategyIntakeSave)}&action=brand_strategy.intake.save&limit=20`
    );
    assert(brandStrategyIntakeSaveAudit.status === 200, `brand strategy intake save audit check failed: ${brandStrategyIntakeSaveAudit.status}`);
    assert(
      brandStrategyIntakeSaveAudit.json.items.some((item) => item.action === "brand_strategy.intake.save"),
      "audit requestId filter missing brand_strategy.intake.save"
    );

    const brandStrategyIntakeGetAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqBrandStrategyIntakeGet)}&action=brand_strategy.intake.get&limit=20`
    );
    assert(brandStrategyIntakeGetAudit.status === 200, `brand strategy intake get audit check failed: ${brandStrategyIntakeGetAudit.status}`);
    assert(
      brandStrategyIntakeGetAudit.json.items.some((item) => item.action === "brand_strategy.intake.get"),
      "audit requestId filter missing brand_strategy.intake.get"
    );

    const brandStrategyGenerateAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqBrandStrategyGenerate)}&action=brand_strategy.plan.generate&limit=20`
    );
    assert(brandStrategyGenerateAudit.status === 200, `brand strategy generate audit check failed: ${brandStrategyGenerateAudit.status}`);
    assert(
      brandStrategyGenerateAudit.json.items.some((item) => item.action === "brand_strategy.plan.generate"),
      "audit requestId filter missing brand_strategy.plan.generate"
    );

    const brandStrategyPlanGetAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqBrandStrategyPlanGet)}&action=brand_strategy.plan.get&limit=20`
    );
    assert(brandStrategyPlanGetAudit.status === 200, `brand strategy plan get audit check failed: ${brandStrategyPlanGetAudit.status}`);
    assert(
      brandStrategyPlanGetAudit.json.items.some((item) => item.action === "brand_strategy.plan.get"),
      "audit requestId filter missing brand_strategy.plan.get"
    );

    const contentUpgradeViewAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqContentUpgradeView)}&action=content_upgrade.view&limit=20`
    );
    assert(contentUpgradeViewAudit.status === 200, `content upgrade view audit check failed: ${contentUpgradeViewAudit.status}`);
    assert(
      contentUpgradeViewAudit.json.items.some((item) => item.action === "content_upgrade.view"),
      "audit requestId filter missing content_upgrade.view"
    );

    const contentUpgradeApplyAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqContentUpgradeApply)}&action=content_upgrade.apply&limit=20`
    );
    assert(contentUpgradeApplyAudit.status === 200, `content upgrade apply audit check failed: ${contentUpgradeApplyAudit.status}`);
    assert(
      contentUpgradeApplyAudit.json.items.some((item) => item.action === "content_upgrade.apply"),
      "audit requestId filter missing content_upgrade.apply"
    );
    assert(
      contentUpgradeApplyAudit.json.items.some((item) => Number(item.metadata?.taskCount || 0) >= 1),
      "content upgrade apply audit missing taskCount"
    );
    assert(
      contentUpgradeApplyAudit.json.items.some((item) => Number(item.metadata?.draftCount || 0) >= 1),
      "content upgrade apply audit missing draftCount"
    );
    assert(
      contentUpgradeApplyAudit.json.items.some((item) => Number(item.metadata?.appliedCount || 0) >= 1),
      "content upgrade apply audit missing appliedCount"
    );
    assert(
      contentUpgradeApplyAudit.json.items.some(
        (item) => Array.isArray(item.metadata?.createdPostIds) && item.metadata.createdPostIds.length >= 1
      ),
      "content upgrade apply audit missing createdPostIds"
    );
    assert(
      contentUpgradeApplyAudit.json.items.some((item) => String(item.metadata?.batchId || "").length > 0),
      "content upgrade apply audit missing batchId"
    );

    const contentUpgradeHistoryAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqContentUpgradeHistory)}&action=content_upgrade.history.list&limit=20`
    );
    assert(contentUpgradeHistoryAudit.status === 200, `content upgrade history audit check failed: ${contentUpgradeHistoryAudit.status}`);
    assert(
      contentUpgradeHistoryAudit.json.items.some((item) => item.action === "content_upgrade.history.list"),
      "audit requestId filter missing content_upgrade.history.list"
    );

    const contentUpgradeBatchKpiAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqContentUpgradeBatchKpi)}&action=content_upgrade.batch_kpi.view&limit=20`
    );
    assert(contentUpgradeBatchKpiAudit.status === 200, `content upgrade batch kpi audit check failed: ${contentUpgradeBatchKpiAudit.status}`);
    assert(
      contentUpgradeBatchKpiAudit.json.items.some((item) => item.action === "content_upgrade.batch_kpi.view"),
      "audit requestId filter missing content_upgrade.batch_kpi.view"
    );

    const reportShareAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqReportShare)}&action=reports.share.create&limit=20`
    );
    assert(reportShareAudit.status === 200, `report share audit check failed: ${reportShareAudit.status}`);
    assert(
      reportShareAudit.json.items.some((item) => item.action === "reports.share.create"),
      "audit requestId filter missing reports.share.create"
    );

    const reportSharedViewAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqReportSharedView)}&action=reports.shared.view&limit=20`
    );
    assert(reportSharedViewAudit.status === 200, `shared report view audit check failed: ${reportSharedViewAudit.status}`);
    assert(
      reportSharedViewAudit.json.items.some((item) => item.action === "reports.shared.view"),
      "audit requestId filter missing reports.shared.view"
    );

    const contentUpgradeMonthlyMissionAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqContentUpgradeMonthlyMission)}&action=content_upgrade.monthly_mission.view&limit=20`
    );
    assert(
      contentUpgradeMonthlyMissionAudit.status === 200,
      `content upgrade monthly mission audit check failed: ${contentUpgradeMonthlyMissionAudit.status}`
    );
    assert(
      contentUpgradeMonthlyMissionAudit.json.items.some((item) => item.action === "content_upgrade.monthly_mission.view"),
      "audit requestId filter missing content_upgrade.monthly_mission.view"
    );
    assert(
      contentUpgradeMonthlyMissionAudit.json.items.some(
        (item) => String(item.resourceId || "") === "03" && String(item.metadata?.month || "") === "03"
      ),
      "monthly mission audit missing resourceId/month metadata"
    );

    const contentUpgradeMonthlyMissionApplyAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqContentUpgradeMonthlyMissionApply)}&action=content_upgrade.monthly_mission.apply&limit=20`
    );
    assert(
      contentUpgradeMonthlyMissionApplyAudit.status === 200,
      `content upgrade monthly mission apply audit check failed: ${contentUpgradeMonthlyMissionApplyAudit.status}`
    );
    assert(
      contentUpgradeMonthlyMissionApplyAudit.json.items.some((item) => item.action === "content_upgrade.monthly_mission.apply"),
      "audit requestId filter missing content_upgrade.monthly_mission.apply"
    );
    assert(
      contentUpgradeMonthlyMissionApplyAudit.json.items.some(
        (item) => String(item.resourceId || "") === "03" && Number(item.metadata?.appliedCount || 0) >= 1
      ),
      "monthly mission apply audit missing resourceId/appliedCount"
    );
    assert(
      contentUpgradeMonthlyMissionApplyAudit.json.items.some((item) => String(item.metadata?.batchId || "").length > 0),
      "monthly mission apply audit missing batchId"
    );
    assert(
      contentUpgradeMonthlyMissionApplyAudit.json.items.some(
        (item) => Array.isArray(item.metadata?.createdPostIds) && item.metadata.createdPostIds.length >= 1
      ),
      "monthly mission apply audit missing createdPostIds"
    );

    const contentUpgradeReplayAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqContentUpgradeReplay)}&action=content_upgrade.replay&limit=20`
    );
    assert(contentUpgradeReplayAudit.status === 200, `content upgrade replay audit check failed: ${contentUpgradeReplayAudit.status}`);
    assert(
      contentUpgradeReplayAudit.json.items.some((item) => item.action === "content_upgrade.replay"),
      "audit requestId filter missing content_upgrade.replay"
    );
    assert(
      contentUpgradeReplayAudit.json.items.some((item) => Number(item.metadata?.replayCount || 0) >= 1),
      "content upgrade replay audit missing replayCount"
    );
    assert(
      contentUpgradeReplayAudit.json.items.some((item) => String(item.metadata?.batchId || "").length > 0),
      "content upgrade replay audit missing batchId"
    );
    assert(
      contentUpgradeReplayAudit.json.items.some(
        (item) => String(item.metadata?.sourceBatchId || "") === String(missionHistoryHit.batchId || "")
      ),
      "content upgrade replay audit sourceBatchId mismatch"
    );

    const commentCreateAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqCommentCreate)}&action=comments.create&limit=20`
    );
    assert(commentCreateAudit.status === 200, `comment create audit check failed: ${commentCreateAudit.status}`);
    assert(
      commentCreateAudit.json.items.some((item) => item.action === "comments.create"),
      "audit requestId filter missing comments.create"
    );
    assert(
      commentCreateAudit.json.items.some((item) => Number(item.metadata?.mentionCount || 0) >= 1),
      "comments.create audit missing mentionCount"
    );

    const commentsListAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqCommentsList)}&action=comments.list&limit=20`
    );
    assert(commentsListAudit.status === 200, `comments list audit check failed: ${commentsListAudit.status}`);
    assert(
      commentsListAudit.json.items.some((item) => item.action === "comments.list"),
      "audit requestId filter missing comments.list"
    );

    const traceAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?traceId=${encodeURIComponent(traceId)}&limit=100`
    );
    assert(traceAudit.status === 200, `audit traceId filter failed: ${traceAudit.status}`);
    assert(
      traceAudit.json.items.some((item) => item.action === "posts.update" && item.resourceId === postId),
      "audit traceId filter missing posts.update"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "products.update" && item.resourceId === productId),
      "audit traceId filter missing products.update"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "posts.batch_update"),
      "audit traceId filter missing posts.batch_update"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "products.batch_update"),
      "audit traceId filter missing products.batch_update"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "dm.classify_intent"),
      "audit traceId filter missing dm.classify_intent"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "dm.reply_playbook"),
      "audit traceId filter missing dm.reply_playbook"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "alerts.rule.upsert"),
      "audit traceId filter missing alerts.rule.upsert"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "alerts.list"),
      "audit traceId filter missing alerts.list"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "workspace.daily.list"),
      "audit traceId filter missing workspace.daily.list"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "brand_strategy.intake.save"),
      "audit traceId filter missing brand_strategy.intake.save"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "brand_strategy.intake.get"),
      "audit traceId filter missing brand_strategy.intake.get"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "brand_strategy.plan.generate"),
      "audit traceId filter missing brand_strategy.plan.generate"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "brand_strategy.plan.get"),
      "audit traceId filter missing brand_strategy.plan.get"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "content_upgrade.view"),
      "audit traceId filter missing content_upgrade.view"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "content_upgrade.apply"),
      "audit traceId filter missing content_upgrade.apply"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "content_upgrade.history.list"),
      "audit traceId filter missing content_upgrade.history.list"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "content_upgrade.batch_kpi.view"),
      "audit traceId filter missing content_upgrade.batch_kpi.view"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "reports.share.create"),
      "audit traceId filter missing reports.share.create"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "reports.shared.view"),
      "audit traceId filter missing reports.shared.view"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "content_upgrade.monthly_mission.view"),
      "audit traceId filter missing content_upgrade.monthly_mission.view"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "content_upgrade.monthly_mission.apply"),
      "audit traceId filter missing content_upgrade.monthly_mission.apply"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "content_upgrade.replay"),
      "audit traceId filter missing content_upgrade.replay"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "comments.create"),
      "audit traceId filter missing comments.create"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "comments.list"),
      "audit traceId filter missing comments.list"
    );
    assert(
      traceAudit.json.items.some((item) => item.action === "tenants.list"),
      "audit traceId filter missing tenants.list"
    );

    const tenantsAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqTenantsList)}&action=tenants.list&limit=20`
    );
    assert(tenantsAudit.status === 200, `tenants.list audit check failed: ${tenantsAudit.status}`);
    assert(
      tenantsAudit.json.items.some((item) => item.action === "tenants.list"),
      "audit missing tenants.list"
    );
    assert(
      tenantsAudit.json.items.some(
        (item) => item.requestId === reqTenantsList && String(item.metadata?.event?.traceId || "") === traceId
      ),
      "audit tenants.list requestId/traceId mismatch"
    );

    const isolationAuth = await ensureIsolationAccount();
    const isolateToken = isolationAuth.token;
    const isolateTenantId = isolationAuth.tenantId;
    assert(isolateToken && isolateTenantId, "isolation user payload missing token or tenant");

    const isolatePosts = await authedJson(isolateToken, isolateTenantId, "GET", "/api/posts");
    assert(isolatePosts.status === 200, `isolation posts list failed: ${isolatePosts.status}`);
    assert(Array.isArray(isolatePosts.json.items), "isolation posts list invalid payload");
    assert(!isolatePosts.json.items.some((item) => String(item.title || "").includes(marker)), "tenant isolation failed for posts");
    assert(
      !upgradeCreatedPostIds.some((id) => isolatePosts.json.items.some((item) => String(item?.id || "") === id)),
      "tenant isolation failed for content upgrade apply created posts"
    );
    assert(
      !replayCreatedPostIds.some((id) => isolatePosts.json.items.some((item) => String(item?.id || "") === id)),
      "tenant isolation failed for content upgrade replay created posts"
    );
    assert(
      !missionCreatedPostIds.some((id) => isolatePosts.json.items.some((item) => String(item?.id || "") === id)),
      "tenant isolation failed for monthly mission apply created posts"
    );

    const isolateProducts = await authedJson(isolateToken, isolateTenantId, "GET", "/api/products");
    assert(isolateProducts.status === 200, `isolation products list failed: ${isolateProducts.status}`);
    assert(Array.isArray(isolateProducts.json.items), "isolation products list invalid payload");
    assert(!isolateProducts.json.items.some((item) => String(item.name || "").includes(marker)), "tenant isolation failed for products");

    const brandStrategyCrossTenant = await authedJson(
      isolateToken,
      isolateTenantId,
      "POST",
      "/api/brand-strategy/generate",
      { intakeId: brandStrategyIntakeId },
      {
        "x-request-id": reqBrandStrategyGenerateCrossTenant,
        "x-trace-id": traceId
      }
    );
    assert(brandStrategyCrossTenant.status === 404, `brand strategy cross-tenant generate expected 404: ${brandStrategyCrossTenant.status}`);
    assert(
      String(brandStrategyCrossTenant.json.error || "") === "brand_strategy_intake_not_found",
      "brand strategy cross-tenant generate error mismatch"
    );

    const deletePost = await authedJson(
      mainToken,
      mainTenantId,
      "DELETE",
      `/api/posts/${encodeURIComponent(postId)}`,
      undefined,
      {
        "x-request-id": reqPostDelete,
        "x-trace-id": traceId
      }
    );
    assert(deletePost.status === 200, `delete post failed: ${deletePost.status}`);

    const deleteProduct = await authedJson(
      mainToken,
      mainTenantId,
      "DELETE",
      `/api/products/${encodeURIComponent(productId)}`,
      undefined,
      {
        "x-request-id": reqProductDelete,
        "x-trace-id": traceId
      }
    );
    assert(deleteProduct.status === 200, `delete product failed: ${deleteProduct.status}`);

    const postDeleteAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqPostDelete)}&action=posts.delete&limit=20`
    );
    assert(postDeleteAudit.status === 200, `posts.delete audit check failed: ${postDeleteAudit.status}`);
    assert(
      postDeleteAudit.json.items.some(
        (item) => item.action === "posts.delete" && item.resourceId === postId && String(item.metadata?.event?.traceId || "") === traceId
      ),
      "audit missing posts.delete"
    );

    const productDeleteAudit = await authedJson(
      mainToken,
      mainTenantId,
      "GET",
      `/api/audit-events?requestId=${encodeURIComponent(reqProductDelete)}&action=products.delete&limit=20`
    );
    assert(productDeleteAudit.status === 200, `products.delete audit check failed: ${productDeleteAudit.status}`);
    assert(
      productDeleteAudit.json.items.some(
        (item) => item.action === "products.delete" && item.resourceId === productId && String(item.metadata?.event?.traceId || "") === traceId
      ),
      "audit missing products.delete"
    );

    postId = "";
    productId = "";

    console.log(`SMOKE OK base=${BASE_URL}`);
  } finally {
    if (postId) {
      await authedJson(mainToken, mainTenantId, "DELETE", `/api/posts/${encodeURIComponent(postId)}`);
    }
    if (productId) {
      await authedJson(mainToken, mainTenantId, "DELETE", `/api/products/${encodeURIComponent(productId)}`);
    }
  }
}

async function ensureIsolationAccount() {
  const login = await postJson("/api/auth/login", {
    email: ISOLATION_EMAIL,
    password: ISOLATION_PASSWORD
  });
  if (login.status === 200) {
    return {
      token: String(login.json.token || buildSessionCookie(login.headers) || ""),
      cookie: buildSessionCookie(login.headers),
      tenantId: login.json.items?.[0]?.tenantId
    };
  }

  const register = await postJson("/api/auth/register", {
    email: ISOLATION_EMAIL,
    password: ISOLATION_PASSWORD,
    storeName: ISOLATION_STORE_NAME
  });
  assert(register.status === 201, `register isolation user failed: ${register.status}`);
  return {
    token: String(register.json.token || buildSessionCookie(register.headers) || ""),
    cookie: buildSessionCookie(register.headers),
    tenantId: register.json.items?.[0]?.tenantId
  };
}

async function authedJson(token, tenantId, method, path, body, extraHeaders = {}, cookie = "") {
  const headers = {
    "x-tenant-id": String(tenantId),
    ...extraHeaders
  };
  if (cookie) {
    headers.cookie = cookie;
  }
  if (token && String(token).startsWith("ig2_session=")) {
    headers.cookie = String(token);
  } else if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return fetchJson(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function authJson(token, method, path, body, extraHeaders = {}) {
  const headers = {
    ...extraHeaders
  };
  if (token && String(token).startsWith("ig2_session=")) {
    headers.cookie = String(token);
  } else if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return fetchJson(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function postJson(path, body) {
  return fetchJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json, headers: Object.fromEntries(response.headers.entries()) };
}

function buildSessionCookie(headers) {
  const raw = String(headers?.["set-cookie"] || "").trim();
  return raw ? raw.split(";")[0] : "";
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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

function buildRegexOrNull(value) {
  const source = String(value || "").trim();
  if (!source) {
    return null;
  }
  return new RegExp(source, "i");
}

main().catch((error) => {
  console.error("SMOKE FAILED", error.message || error);
  process.exit(1);
});
