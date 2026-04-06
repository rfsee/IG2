const STORAGE_KEY = "ig_ops_frontend_v2";
const STORAGE_SCHEMA_VERSION = 2;
const BACKUP_KEY_PREFIX = `${STORAGE_KEY}__backup__`;
const MAX_BACKUP_SNAPSHOTS = 12;
const INITIAL_POSTS_CSV_PATH = "assets/google_sheets/posts_import.csv";
const INITIAL_PRODUCTS_CSV_PATH = "assets/google_sheets/products_import.csv";
const PRODUCT_COVERS_JSON_PATH = "assets/product_covers.json";
const PRODUCT_COVER_CACHE_KEY = "ig_ops_product_cover_cache_v1";
const BRAND_STRATEGY_API_BASE_STORAGE_KEY = "ig_ops_backend_api_base_v1";
const BRAND_STRATEGY_AUTH_SESSION_KEY = "ig_ops_auth_session_v1";
const TENANT_SELECTION_STORAGE_KEY = "ig_ops_tenants_v1";
const BRAND_STRATEGY_API_BASE_DEFAULT = "http://127.0.0.1:8793";
const RUNTIME_CONFIG = typeof window !== "undefined" ? window.__IG2_RUNTIME_CONFIG__ || {} : {};
const SHOPEE_SHOP_ID = "179481064";
const STATUS_ORDER = ["草稿", "待拍", "待上架", "已發佈"];
const LEGACY_PRODUCT_TERMS = ["超薄鞋櫃", "翻斗鞋櫃", "羊羔絨椅", "泰迪熊羊羔絨椅"];
const PRODUCT_CATEGORY_RULES = [
  { token: "邊几", limit: 2 },
  { token: "圓桌", limit: 1 },
  { token: "竹凳", limit: 1 },
  { token: "餐椅", limit: 2 },
  { token: "鞋櫃", limit: 1 },
  { token: "邊桌", limit: 1 },
  { token: "茶几", limit: 1 }
];
const DAILY_SOP_ITEMS = [
  "更新今天要發布的貼文狀態（至少 1 篇往前推進）",
  "回填昨天貼文成效（觸及/收藏/私訊/點擊/下單）",
  "處理新 DM 並把 thread 階段推進到 qualified 或 offer_sent",
  "檢查今日貼文 CTA 是否明確可執行（私訊/留言關鍵字）",
  "生成一次週報，確認本週高表現題材",
  "新增或調整 1 則明日內容（腳本 + prompt + CTA）"
];

const seedPosts = [
  {
    id: "p1",
    date: "03/03",
    type: "reels",
    week: "W1",
    status: "已發佈",
    title: "3坪救星：INS蘑菇邊几（$1999）",
    script: "Hook痛點 -> 5種用途快切 -> 價格尺寸字卡",
    cta: "收藏這篇",
    link: "https://shopee.tw/product/179481064/21168376084"
  },
  {
    id: "p2",
    date: "03/05",
    type: "reels",
    week: "W1",
    status: "待上架",
    title: "尺寸不踩雷：蝴蝶椅+麻布餐椅",
    script: "錯誤示例1/2/3 -> 正確量測提示",
    cta: "留言 尺寸",
    link: "https://shopee.tw/product/179481064/25339990818"
  },
  {
    id: "p3",
    date: "03/07",
    type: "feed",
    week: "W1",
    status: "草稿",
    title: "北歐小圓桌輪播（櫻桃色）",
    script: "情境 -> 細節 -> 尺寸對照 -> CTA",
    cta: "點連結看規格",
    link: "https://shopee.tw/product/179481064/18301564375"
  },
  {
    id: "p4",
    date: "03/10",
    type: "reels",
    week: "W2",
    status: "待拍",
    title: "1800-3800實品清單：邊几/圓桌/休閒竹凳子",
    script: "實品3價位段展示 -> 搭配建議",
    cta: "點連結看清單",
    link: "https://shopee.tw/product/179481064/20726208953"
  }
];

const seedProducts = [
  {
    id: "g1",
    name: "INS蘑菇邊几",
    price: 1999,
    size: "40x40x52cm",
    material: "烤漆鐵件+木板",
    selling: "小坪數多用途邊几",
    link: "https://shopee.tw/product/179481064/21168376084",
    scene: "床邊/沙發側"
  },
  {
    id: "g2",
    name: "北歐小圓桌（櫻桃色）",
    price: 2999,
    size: "80x80x75cm",
    material: "實木貼皮",
    selling: "工作餐桌一桌兩用",
    link: "https://shopee.tw/product/179481064/18301564375",
    scene: "客廳/餐區"
  },
  {
    id: "g3",
    name: "復古實木邊几",
    price: 2799,
    size: "小號",
    material: "做舊實木",
    selling: "小坪數萬用邊几，可當床邊桌/花台/展示台",
    link: "https://shopee.tw/product/179481064/11587344766",
    scene: "床邊/客廳角落"
  }
];

const hasStoredState = hasPersistedState();
const loadResult = loadState();
const state = loadResult.state;
const productCoverMap = new Map();
const productCoverLookupInFlight = new Set();
const productCoverLookupRetryAt = new Map();
let brandStrategyIntakeState = null;
let brandStrategyPlanState = null;

const refs = {
  kpiGrid: document.getElementById("kpi-grid"),
  weeklyProductsTitle: document.getElementById("weekly-products-title"),
  weeklyProducts: document.getElementById("weekly-products"),
  weeklyPlanOverview: document.getElementById("weekly-plan-overview"),
  boardProgressFill: document.getElementById("board-progress-fill"),
  boardProgressText: document.getElementById("board-progress-text"),
  postsTbody: document.getElementById("posts-tbody"),
  productsTbody: document.getElementById("products-tbody"),
  filterWeek: document.getElementById("filter-week"),
  filterType: document.getElementById("filter-type"),
  filterStatus: document.getElementById("filter-status"),
  filterPostSearch: document.getElementById("filter-post-search"),
  postDialog: document.getElementById("post-dialog"),
  productDialog: document.getElementById("product-dialog"),
  postForm: document.getElementById("post-form"),
  productForm: document.getElementById("product-form"),
  postFormTitle: document.getElementById("post-form-title"),
  productFormTitle: document.getElementById("product-form-title"),
  postCancel: document.getElementById("post-cancel"),
  productCancel: document.getElementById("product-cancel"),
  addPostBtn: document.getElementById("add-post-btn"),
  addProductBtn: document.getElementById("add-product-btn"),
  backupStateBtn: document.getElementById("backup-state-btn"),
  restoreStateBtn: document.getElementById("restore-state-btn"),
  exportPostsBtn: document.getElementById("export-posts-btn"),
  exportProductsBtn: document.getElementById("export-products-btn"),
  importPostsInput: document.getElementById("import-posts"),
  importProductsInput: document.getElementById("import-products"),
  postId: document.getElementById("post-id"),
  postDate: document.getElementById("post-date"),
  postType: document.getElementById("post-type"),
  postWeek: document.getElementById("post-week"),
  postStatus: document.getElementById("post-status"),
  postTitle: document.getElementById("post-title"),
  postScript: document.getElementById("post-script"),
  postCta: document.getElementById("post-cta"),
  postLink: document.getElementById("post-link"),
  postTriggerTags: document.getElementById("post-trigger-tags"),
  postAutoCaption: document.getElementById("post-auto-caption"),
  postImagePrompt: document.getElementById("post-image-prompt"),
  copyCaptionBtn: document.getElementById("copy-caption-btn"),
  copyImagePromptBtn: document.getElementById("copy-image-prompt-btn"),
  dmPostSelect: document.getElementById("dm-post-select"),
  dmIntentSelect: document.getElementById("dm-intent-select"),
  dmUserQuestion: document.getElementById("dm-user-question"),
  dmGenerateBtn: document.getElementById("dm-generate-btn"),
  dmCopyBtn: document.getElementById("dm-copy-btn"),
  dmScriptOutput: document.getElementById("dm-script-output"),
  dmThreadsTbody: document.getElementById("dm-threads-tbody"),
  brandStrategyPanel: document.getElementById("brand-strategy-panel"),
  brandStrategySummary: document.getElementById("brand-strategy-summary"),
  brandStrategyRefreshBtn: document.getElementById("brand-strategy-refresh-btn"),
  brandStrategyGenerateBtn: document.getElementById("brand-strategy-generate-btn"),
  brandStrategyBrandName: document.getElementById("brand-strategy-brand-name"),
  brandStrategyIndustry: document.getElementById("brand-strategy-industry"),
  brandStrategyTargetAudience: document.getElementById("brand-strategy-target-audience"),
  brandStrategyBusinessGoal: document.getElementById("brand-strategy-business-goal"),
  brandStrategyTone: document.getElementById("brand-strategy-tone"),
  brandStrategyKeywords: document.getElementById("brand-strategy-keywords"),
  brandStrategyMoodSlider: document.getElementById("brand-strategy-mood-slider"),
  brandStrategyMoodValue: document.getElementById("brand-strategy-mood-value"),
  brandStrategyConstraints: document.getElementById("brand-strategy-constraints"),
  brandStrategyNotes: document.getElementById("brand-strategy-notes"),
  brandStrategyOutput: document.getElementById("brand-strategy-output"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authStoreName: document.getElementById("auth-store-name"),
  authRegisterBtn: document.getElementById("auth-register-btn"),
  authLoginBtn: document.getElementById("auth-login-btn"),
  authDisconnectBtn: document.getElementById("login-disconnect-btn"),
  loginStatus: document.getElementById("login-status"),
  tenantRoleBadge: document.getElementById("tenant-role-badge"),
  activeTenantName: document.getElementById("active-tenant-name"),
  weeklyReportBtn: document.getElementById("weekly-report-btn"),
  weeklyReportCopyBtn: document.getElementById("weekly-report-copy-btn"),
  weeklyReportKpiCards: document.getElementById("weekly-report-kpi-cards"),
  weeklyReportOutput: document.getElementById("weekly-report-output"),
  weeklyActions: document.getElementById("weekly-actions"),
  sopChecklist: document.getElementById("sop-checklist"),
  sopResetBtn: document.getElementById("sop-reset-btn"),
  productId: document.getElementById("product-id"),
  productName: document.getElementById("product-name"),
  productPrice: document.getElementById("product-price"),
  productSize: document.getElementById("product-size"),
  productMaterial: document.getElementById("product-material"),
  productPhotoName: document.getElementById("product-photo-name"),
  productSelling: document.getElementById("product-selling"),
  productLink: document.getElementById("product-link"),
  productScene: document.getElementById("product-scene")
};

loadProductCoverCache();
bindEvents();
initAuthUi();
rehydrateAuthSessionFromBackend();
if (loadResult.needsPersist) {
  persistStateSnapshot(state);
}
syncDraftTitlesWithProducts(true);
renderAll();
if (hasConnectedAuthSession()) {
  syncBrandStrategyFromBackend().catch(() => {
    if (refs.brandStrategySummary) {
      refs.brandStrategySummary.textContent = "品牌策略暫時離線，請確認登入狀態與後端服務。";
    }
    renderBrandStrategyPanel();
  });
} else if (refs.brandStrategySummary) {
  refs.brandStrategySummary.textContent = "請先登入以讀取品牌策略與雲端資料。";
}
if (!hasStoredState) {
  hydrateFromCsvOnFirstLoad();
}
sanitizeStoredLinks();
migrateLegacyShoeCabinetToSideTable();
migrateLegacyTeddyChairToBambooStool();
reconcileProductLinksFromCsv();
hydrateProductCoverMap();

function hasPersistedState() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch (_error) {
    return false;
  }
}

function bindEvents() {
  refs.addPostBtn.addEventListener("click", openCreatePostDialog);
  refs.addProductBtn.addEventListener("click", openCreateProductDialog);
  refs.backupStateBtn.addEventListener("click", () => {
    createStateBackup("manual");
    alert("已建立本機備份快照");
  });
  refs.restoreStateBtn.addEventListener("click", restoreLatestStateBackup);
  refs.postCancel.addEventListener("click", () => refs.postDialog.close());
  refs.productCancel.addEventListener("click", () => refs.productDialog.close());

  refs.postForm.addEventListener("submit", onSubmitPost);
  refs.productForm.addEventListener("submit", onSubmitProduct);
  [
    refs.postDate,
    refs.postType,
    refs.postWeek,
    refs.postStatus,
    refs.postTitle,
    refs.postScript,
    refs.postCta,
    refs.postLink,
    refs.postTriggerTags
  ].forEach((node) => {
    node.addEventListener("input", updatePostAutomationPreview);
    node.addEventListener("change", updatePostAutomationPreview);
  });

  refs.copyCaptionBtn.addEventListener("click", () => copyTextFromField(refs.postAutoCaption));
  refs.copyImagePromptBtn.addEventListener("click", () => copyTextFromField(refs.postImagePrompt));
  refs.dmGenerateBtn.addEventListener("click", onGenerateDmScript);
  refs.dmCopyBtn.addEventListener("click", () => copyTextFromField(refs.dmScriptOutput));
  refs.dmThreadsTbody.addEventListener("click", onDmThreadsClick);
  refs.dmThreadsTbody.addEventListener("change", onDmStageChange);
  refs.weeklyReportBtn.addEventListener("click", generateWeeklyReport);
  refs.weeklyReportCopyBtn.addEventListener("click", () => copyTextFromField(refs.weeklyReportOutput));
  refs.sopChecklist.addEventListener("change", onSopChecklistChange);
  refs.sopResetBtn.addEventListener("click", resetTodaySop);

  refs.postsTbody.addEventListener("click", onPostsTableClick);
  refs.productsTbody.addEventListener("click", onProductsTableClick);
  refs.postsTbody.addEventListener("change", onPostStatusChange);
  refs.postsTbody.addEventListener("change", onPostMetricChange);

  refs.authRegisterBtn?.addEventListener("click", onAuthRegister);
  refs.authLoginBtn?.addEventListener("click", onAuthLogin);
  refs.authDisconnectBtn?.addEventListener("click", onAuthDisconnect);

  refs.filterWeek.addEventListener("change", renderAll);
  refs.filterType.addEventListener("change", renderAll);
  refs.filterStatus.addEventListener("change", renderAll);
  if (refs.filterPostSearch) {
    refs.filterPostSearch.addEventListener("input", renderAll);
  }

  refs.exportPostsBtn.addEventListener("click", () => exportPostsCsv(state.posts));
  refs.exportProductsBtn.addEventListener("click", () => exportProductsCsv(state.products));

  refs.importPostsInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    withAutoBackup("before_import_posts", () => importPostsCsv(text));
    refs.importPostsInput.value = "";
  });

  refs.importProductsInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    withAutoBackup("before_import_products", () => importProductsCsv(text));
    refs.importProductsInput.value = "";
  });

  if (refs.brandStrategyRefreshBtn) {
    refs.brandStrategyRefreshBtn.addEventListener("click", async () => {
      try {
        await syncBrandStrategyFromBackend();
      } catch (error) {
        alert(`品牌策略同步失敗：${String(error.message || error)}`);
      }
    });
  }

  if (refs.brandStrategyGenerateBtn) {
    refs.brandStrategyGenerateBtn.addEventListener("click", async () => {
      try {
        await saveAndGenerateBrandStrategy();
      } catch (error) {
        alert(`品牌策略生成失敗：${String(error.message || error)}`);
      }
    });
  }

  if (refs.brandStrategyOutput) {
    refs.brandStrategyOutput.addEventListener("click", onBrandStrategyOutputClick);
  }

  if (refs.brandStrategyMoodSlider) {
    refs.brandStrategyMoodSlider.addEventListener("input", () => {
      renderBrandStrategyMoodLabel();
    });
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        state: createDefaultState(),
        needsPersist: true
      };
    }

    const parsed = JSON.parse(raw);
    const migrated = migrateStateShape(parsed);
    return {
      state: sanitizeStateShape(migrated.state),
      needsPersist: migrated.needsPersist
    };
  } catch (_error) {
    return {
      state: createDefaultState(),
      needsPersist: true
    };
  }
}

function createDefaultState() {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    posts: [...seedPosts].map((post) => normalizePost(post)),
    products: [...seedProducts],
    dmThreads: [],
    sopDaily: {},
    metadata: {
      updatedAt: new Date().toISOString()
    }
  };
}

function sanitizeStateShape(source) {
  const safe = source && typeof source === "object" ? source : {};
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    posts: Array.isArray(safe.posts) ? safe.posts.map((post) => normalizePost(post)) : [...seedPosts].map((post) => normalizePost(post)),
    products: Array.isArray(safe.products) ? safe.products : [...seedProducts],
    dmThreads: Array.isArray(safe.dmThreads) ? safe.dmThreads : [],
    sopDaily: safe.sopDaily && typeof safe.sopDaily === "object" ? safe.sopDaily : {},
    metadata: {
      updatedAt: String(safe.metadata?.updatedAt || new Date().toISOString())
    }
  };
}

function migrateStateShape(parsed) {
  const safe = parsed && typeof parsed === "object" ? parsed : {};
  let needsPersist = false;

  if (!safe.schemaVersion) {
    needsPersist = true;
  }

  if (Number(safe.schemaVersion || 1) < STORAGE_SCHEMA_VERSION) {
    needsPersist = true;
  }

  const migratedState = {
    ...safe,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    metadata: {
      updatedAt: String(safe.metadata?.updatedAt || new Date().toISOString())
    }
  };

  return {
    state: migratedState,
    needsPersist
  };
}

function buildSerializableStateSnapshot(sourceState) {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    posts: sourceState.posts,
    products: sourceState.products,
    dmThreads: sourceState.dmThreads,
    sopDaily: sourceState.sopDaily,
    metadata: {
      updatedAt: new Date().toISOString()
    }
  };
}

function persistStateSnapshot(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSerializableStateSnapshot(nextState)));
}

function saveState() {
  persistStateSnapshot(state);
}

function getBackupStorageKeys() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(BACKUP_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    return keys.sort((a, b) => b.localeCompare(a));
  } catch (_error) {
    return [];
  }
}

function trimBackupSnapshots() {
  const keys = getBackupStorageKeys();
  if (keys.length <= MAX_BACKUP_SNAPSHOTS) {
    return;
  }
  keys.slice(MAX_BACKUP_SNAPSHOTS).forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (_error) {
    }
  });
}

function createStateBackup(reason) {
  try {
    const payload = {
      createdAt: new Date().toISOString(),
      reason: String(reason || "manual"),
      schemaVersion: STORAGE_SCHEMA_VERSION,
      state: buildSerializableStateSnapshot(state)
    };
    const key = `${BACKUP_KEY_PREFIX}${Date.now()}`;
    localStorage.setItem(key, JSON.stringify(payload));
    trimBackupSnapshots();
  } catch (_error) {
  }
}

function withAutoBackup(reason, action) {
  createStateBackup(reason);
  action();
}

function restoreLatestStateBackup() {
  const keys = getBackupStorageKeys();
  if (keys.length === 0) {
    alert("目前沒有可還原的備份");
    return;
  }

  const confirmed = confirm("將還原最近一次備份，現在未儲存變更會被覆蓋。是否繼續？");
  if (!confirmed) {
    return;
  }

  try {
    const raw = localStorage.getItem(keys[0]);
    if (!raw) {
      alert("備份內容不存在，請重新建立備份");
      return;
    }
    const parsed = JSON.parse(raw);
    const next = sanitizeStateShape(parsed.state || {});
    state.posts = next.posts;
    state.products = next.products;
    state.dmThreads = next.dmThreads;
    state.sopDaily = next.sopDaily;
    state.schemaVersion = STORAGE_SCHEMA_VERSION;
    state.metadata = next.metadata;
    saveState();
    renderAll();
    alert(`已還原備份（${formatDateTime(parsed.createdAt || new Date().toISOString())}）`);
  } catch (_error) {
    alert("還原失敗，請先重新建立備份後再試");
  }
}

async function hydrateFromCsvOnFirstLoad() {
  try {
    const [postsResponse, productsResponse] = await Promise.all([
      fetch(INITIAL_POSTS_CSV_PATH, { cache: "no-store" }),
      fetch(INITIAL_PRODUCTS_CSV_PATH, { cache: "no-store" })
    ]);

    if (!postsResponse.ok || !productsResponse.ok) {
      return;
    }

    const [postsCsvText, productsCsvText] = await Promise.all([
      postsResponse.text(),
      productsResponse.text()
    ]);

    const importedPosts = parseInitialPostsCsv(postsCsvText);
    const importedProducts = parseInitialProductsCsv(productsCsvText);

    if (importedPosts.length > 0) {
      state.posts = importedPosts.map((post) => normalizePost(post));
    }
    if (importedProducts.length > 0) {
      state.products = importedProducts;
    }

    syncDraftTitlesWithProducts(false);
    saveState();
    renderAll();
  } catch (_error) {
  }
}

async function reconcileProductLinksFromCsv() {
  try {
    const response = await fetch(INITIAL_PRODUCTS_CSV_PATH, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const csvText = await response.text();
    const sourceProducts = parseInitialProductsCsv(csvText);
    if (sourceProducts.length === 0) {
      return;
    }

    const linkByName = new Map(
      sourceProducts
        .filter((item) => item.name && item.link)
        .map((item) => [item.name.trim(), toCanonicalShopeeLink(item.link.trim()) || item.link.trim()])
    );

    let changed = false;
    state.products = state.products.map((product) => {
      const key = String(product.name || "").trim();
      const csvLink = linkByName.get(key);
      if (!csvLink) {
        return product;
      }
      if (toCanonicalShopeeLink(product.link) === csvLink) {
        return product;
      }
      changed = true;
      return {
        ...product,
        link: csvLink
      };
    });

    if (changed) {
      syncDraftTitlesWithProducts(false);
      saveState();
      renderAll();
    }
  } catch (_error) {
  }
}

async function hydrateProductCoverMap() {
  try {
    const response = await fetch(PRODUCT_COVERS_JSON_PATH, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) {
      return;
    }
    rows.forEach((row) => {
      const linkKey = toCanonicalShopeeLink(row.product_link || "");
      const idKey = String(row.product_id || "").trim();
      const cover = String(row.cover_url || "").trim();
      if (!cover) {
        return;
      }
      if (linkKey) {
        productCoverMap.set(`link:${linkKey}`, cover);
      }
      if (idKey) {
        productCoverMap.set(`id:${idKey}`, cover);
      }
    });
    saveProductCoverCache();
    renderWeeklyProducts();
    renderProductsTable();
  } catch (_error) {
  }
}

function isLikelyShopeeProductUrl(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.includes("shopee.tw/product/");
}

function sanitizeStoredLinks() {
  let changed = false;

  const nextProducts = state.products.map((product) => {
    const canonical = toCanonicalShopeeLink(product.link);
    if (!canonical || canonical === product.link) {
      return product;
    }
    changed = true;
    return {
      ...product,
      link: canonical
    };
  });

  const nextPosts = state.posts.map((post) => {
    const canonical = toCanonicalShopeeLink(post.link);
    if (!canonical || canonical === post.link) {
      return post;
    }
    changed = true;
    return {
      ...post,
      link: canonical
    };
  });

  if (changed) {
    state.products = nextProducts;
    state.posts = nextPosts;
    saveState();
    renderAll();
  }
}

function migrateLegacyShoeCabinetToSideTable() {
  const oldIds = new Set(["10298192300", "25339990818"]);
  const newLink = "https://shopee.tw/product/179481064/11587344766";
  const newName = "復古實木邊几";

  let changed = false;

  state.products = state.products.map((product) => {
    const id = extractProductIdFromLink(product.link || "");
    const name = String(product.name || "");
    const isLegacy = oldIds.has(id) || name.includes("鞋櫃") || name.includes("翻斗");
    if (!isLegacy) {
      return product;
    }
    changed = true;
    return {
      ...product,
      name: newName,
      price: Number(product.price || 2799),
      size: product.size || "小號",
      material: product.material || "做舊實木",
      selling: "小坪數萬用邊几，可當床邊桌/花台/展示台",
      scene: product.scene || "床邊/客廳角落",
      link: newLink
    };
  });

  state.posts = state.posts.map((post) => {
    const id = extractProductIdFromLink(post.link || "");
    if (!oldIds.has(id)) {
      return post;
    }
    changed = true;
    return {
      ...post,
      link: newLink,
      title: String(post.title || "").replaceAll("鞋櫃", "邊几").replaceAll("翻斗", "")
    };
  });

  if (changed) {
    saveState();
    renderAll();
  }
}

function migrateLegacyTeddyChairToBambooStool() {
  const oldId = "12296135937";
  const newId = "20893008743";
  const newLink = `https://shopee.tw/product/${SHOPEE_SHOP_ID}/${newId}`;
  let changed = false;

  state.products = state.products.map((product) => {
    const id = extractProductIdFromLink(product.link || "");
    const name = String(product.name || "");
    if (id !== oldId && !name.includes("羊羔絨") && !name.includes("泰迪熊")) {
      return product;
    }
    changed = true;
    return {
      ...product,
      name: "休閒竹凳子",
      price: 1999,
      size: "矮凳",
      material: "竹編/木質結構",
      selling: "日系休閒感，小空間可當換鞋凳或展示凳",
      scene: "玄關/客廳角落",
      link: newLink
    };
  });

  state.posts = state.posts.map((post) => {
    const id = extractProductIdFromLink(post.link || "");
    const title = String(post.title || "");
    if (id !== oldId && !title.includes("羊羔絨椅")) {
      return post;
    }
    changed = true;
    return {
      ...post,
      link: newLink,
      title: title.replaceAll("羊羔絨椅", "休閒竹凳子")
    };
  });

  if (changed) {
    saveState();
    renderAll();
  }
}

function toCanonicalShopeeLink(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const productMatch = text.match(/\/product\/\d+\/(\d+)/i);
  if (productMatch) {
    return `https://shopee.tw/product/${SHOPEE_SHOP_ID}/${productMatch[1]}`;
  }

  const itemMatch = text.match(/\/i\.\d+\.(\d+)/i);
  if (itemMatch) {
    return `https://shopee.tw/product/${SHOPEE_SHOP_ID}/${itemMatch[1]}`;
  }

  return "";
}

function parseInitialPostsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return [];
  }

  const map = indexMap(rows[0]);
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim().length > 0))
    .map((row, index) => {
      const rawType = pick(row, map, ["類型", "type"]).toLowerCase();
      const rawStatus = pick(row, map, ["狀態", "status"]);
      const rawPublishTime = pick(row, map, ["發布時間", "publish_time"]);
      const rawId = pick(row, map, ["Post ID", "id"]);
      return {
        id: rawId || createId(`p${index}`),
        date: toMonthDay(rawPublishTime),
        type: rawType === "feed" ? "feed" : "reels",
        week: inferWeek(rawId, rawPublishTime),
        status: STATUS_ORDER.includes(rawStatus) ? rawStatus : "草稿",
        title: pick(row, map, ["主題", "title"]),
        script: pick(row, map, ["內容腳本", "script"]),
        cta: pick(row, map, ["CTA", "cta"]),
        triggerTags: parseTagInput(pick(row, map, ["觸發標籤", "trigger_tags"])),
        link: toCanonicalShopeeLink(pick(row, map, ["商品連結", "link"])) || pick(row, map, ["商品連結", "link"]),
        metrics: {
          reach: Number(pick(row, map, ["成效-觸及", "reach"]) || 0),
          saves: Number(pick(row, map, ["成效-收藏", "saves"]) || 0),
          dms: Number(pick(row, map, ["成效-私訊", "dms"]) || 0),
          clicks: Number(pick(row, map, ["成效-點擊", "clicks"]) || 0),
          orders: Number(pick(row, map, ["成效-下單", "orders"]) || 0)
        }
      };
    });
}

function parseInitialProductsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return [];
  }

  const map = indexMap(rows[0]);
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim().length > 0))
    .map((row, index) => {
      return {
        id: createId(`g${index}`),
        name: pick(row, map, ["商品名稱", "name"]),
        price: Number(pick(row, map, ["價格", "price"]) || 0),
        size: pick(row, map, ["尺寸", "size"]),
        material: pick(row, map, ["材質/顏色", "材質", "material"]),
        selling: pick(row, map, ["賣點", "selling"]),
        photoName: pick(row, map, ["照片名稱", "主圖檔名", "photo_name", "photoName"]),
        link:
          toCanonicalShopeeLink(pick(row, map, ["主圖", "商品連結", "連結", "link"])) ||
          pick(row, map, ["主圖", "商品連結", "連結", "link"]),
        scene: pick(row, map, ["場景建議", "scene"])
      };
    });
}

function inferWeek(postId, publishTime) {
  const idMatch = String(postId || "").match(/W([1-4])/i);
  if (idMatch) {
    return `W${idMatch[1]}`;
  }

  const dateMatch = String(publishTime || "").match(/\d{4}-(\d{2})-(\d{2})/);
  if (!dateMatch) {
    return "W1";
  }
  const day = Number(dateMatch[2]);
  if (day <= 7) {
    return "W1";
  }
  if (day <= 14) {
    return "W2";
  }
  if (day <= 21) {
    return "W3";
  }
  return "W4";
}

function toMonthDay(value) {
  const match = String(value || "").match(/\d{4}-(\d{2})-(\d{2})/);
  if (!match) {
    return "";
  }
  return `${match[1]}/${match[2]}`;
}

function sumPostMetrics() {
  return state.posts.reduce(
    (acc, post) => {
      const metrics = post.metrics || {};
      acc.reach += Number(metrics.reach || 0);
      acc.saves += Number(metrics.saves || 0);
      acc.dms += Number(metrics.dms || 0);
      acc.clicks += Number(metrics.clicks || 0);
      acc.orders += Number(metrics.orders || 0);
      return acc;
    },
    { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 }
  );
}

function summarizeDmThreads() {
  return state.dmThreads.reduce(
    (acc, thread) => {
      acc.total += 1;
      if (thread.stage === "qualified") {
        acc.qualified += 1;
      }
      if (thread.stage === "closed") {
        acc.closed += 1;
      }
      return acc;
    },
    { total: 0, qualified: 0, closed: 0 }
  );
}

function ratioText(numerator, denominator) {
  const num = Number(numerator || 0);
  const den = Number(denominator || 0);
  if (den <= 0) {
    return "0.0%";
  }
  return `${((num / den) * 100).toFixed(1)}%`;
}

function normalizePost(post) {
  const safe = post || {};
  return {
    ...safe,
    triggerTags: Array.isArray(safe.triggerTags)
      ? safe.triggerTags.filter(Boolean)
      : String(safe.triggerTags || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
    metrics: {
      reach: Number(safe.metrics?.reach || 0),
      saves: Number(safe.metrics?.saves || 0),
      dms: Number(safe.metrics?.dms || 0),
      clicks: Number(safe.metrics?.clicks || 0),
      orders: Number(safe.metrics?.orders || 0)
    }
  };
}

function renderAll() {
  renderBrandStrategyPanel();
  renderKpi();
  renderWeeklyProducts();
  renderWeeklyPlanOverview();
  renderPostsTable();
  renderProductsTable();
  renderDmPostOptions();
  renderDmThreads();
  generateWeeklyReport();
  renderSopChecklist();
}

function renderKpi() {
  const totalPosts = state.posts.length;
  const publishedPosts = state.posts.filter((item) => item.status === "已發佈").length;
  const pendingPosts = state.posts.filter((item) => item.status !== "已發佈").length;
  const totalProducts = state.products.length;
  const totals = sumPostMetrics();
  const saveRate = ratioText(totals.saves, totals.reach);
  const dmRate = ratioText(totals.dms, totals.reach);
  const clickRate = ratioText(totals.clicks, totals.reach);
  const orderRate = ratioText(totals.orders, totals.clicks);
  const dmStats = summarizeDmThreads();

  const cards = [
    { label: "貼文總數", value: String(totalPosts) },
    { label: "已發佈", value: String(publishedPosts) },
    { label: "待執行", value: String(pendingPosts) },
    { label: "商品數", value: String(totalProducts) },
    { label: "收藏率", value: saveRate },
    { label: "私訊率", value: dmRate },
    { label: "點擊率", value: clickRate },
    { label: "下單率", value: orderRate },
    { label: "DM 成交率", value: ratioText(dmStats.closed, dmStats.qualified || dmStats.total) }
  ];

  refs.kpiGrid.innerHTML = cards
    .map((card) => {
      return `<article class="kpi-card"><p class="kpi-label">${escapeHtml(card.label)}</p><p class="kpi-value">${escapeHtml(card.value)}</p></article>`;
    })
    .join("");
}

function renderWeeklyProducts() {
  const week = getPlanningWeekKey();
  refs.weeklyProductsTitle.textContent = `本週主推商品（${week}）`;

  const weeklyLinkedProducts = getWeeklyLinkedProducts(week);
  const cards = weeklyLinkedProducts
    .map(({ link, product }) => {
      const imageSrc = resolveProductImageSrc(product);
      return `
        <article class="w-product">
          ${imageSrc ? `<img src="${escapeAttribute(imageSrc)}" alt="${escapeAttribute(product.name || "商品圖片")}" loading="lazy" />` : '<div class="w-product-image-placeholder">🛍️</div>'}
          <h4>${escapeHtml(product.name || "未命名商品")}</h4>
          <p class="w-product-price">$${escapeHtml(Number(product.price || 0).toLocaleString("en-US"))}</p>
          <div class="w-product-actions"><a class="btn icon-btn icon-link-btn" href="${escapeAttribute(link)}" target="_blank" rel="noreferrer" title="開啟商品頁">🛒</a></div>
        </article>
      `;
    })
    .filter(Boolean);

  refs.weeklyProducts.innerHTML = cards.length > 0
    ? cards.join("")
    : '<article class="w-product placeholder-card"><div class="placeholder-frame">✨ 點擊開始規劃本週靈感</div><p>本週尚無已綁定商品的貼文。</p></article>';
}

function renderWeeklyPlanOverview() {
  const week = getPlanningWeekKey();
  const weeklyPosts = getFilteredPosts({ forceWeek: week });
  const weeklyLinkedProducts = getWeeklyLinkedProducts(week);

  if (weeklyPosts.length === 0) {
    refs.weeklyPlanOverview.innerHTML = '<article class="plan-card placeholder-card"><div class="placeholder-frame">✨ 點擊開始規劃本週靈感</div><h4>本週尚未規劃貼文</h4><p>先新增本週貼文與商品連結，系統就會自動生成 IG 方案總覽。</p></article>';
    renderBoardProgress(0, 0);
    return;
  }

  const reelsCount = weeklyPosts.filter((post) => post.type === "reels").length;
  const feedCount = weeklyPosts.length - reelsCount;
  const publishedCount = weeklyPosts.filter((post) => post.status === "已發佈").length;
  const pendingCount = weeklyPosts.length - publishedCount;

  const triggerCounter = new Map();
  weeklyPosts.forEach((post) => {
    (post.triggerTags || []).forEach((tag) => {
      const key = String(tag || "").trim();
      if (!key) {
        return;
      }
      triggerCounter.set(key, (triggerCounter.get(key) || 0) + 1);
    });
  });
  const topTriggers = [...triggerCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const ctaCounter = new Map();
  weeklyPosts.forEach((post) => {
    const key = String(post.cta || "").trim();
    if (!key) {
      return;
    }
    ctaCounter.set(key, (ctaCounter.get(key) || 0) + 1);
  });
  const primaryCta = [...ctaCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "私訊領取完整規格與搭配建議";

  const focusProductsText =
    weeklyLinkedProducts.map(({ product }) => product.name || "未命名商品").join("、") || "尚未綁定商品";
  const paceText = `本週共 ${weeklyPosts.length} 篇（Reels ${reelsCount} / Feed ${feedCount}），已發佈 ${publishedCount}、待執行 ${pendingCount}`;

  const scheduleItems = weeklyPosts
    .slice(0, 5)
    .map((post) => {
      const postType = post.type === "reels" ? "Reels" : "Feed";
      const product = findProductByLink(post.link);
      const title = buildLinkedTitle(post, product);
      return `<li><span class="plan-bullet">✨</span>${escapeHtml(post.date)}｜${escapeHtml(postType)}｜${escapeHtml(title)} <span class="plan-status-pill ${resolvePlanStatusClass(
        post.status
      )}">${escapeHtml(post.status)}</span></li>`;
    })
    .join("");

  refs.weeklyPlanOverview.innerHTML = `
    <article class="plan-card plan-highlight">
      <h4>${escapeHtml(week)} 行銷主軸</h4>
      <p><strong>主推商品：</strong>${escapeHtml(focusProductsText)}</p>
      <p><strong>內容節奏：</strong>${escapeHtml(paceText)}</p>
    </article>
    <article class="plan-card">
      <h4>內容策略</h4>
      <p>以「${escapeHtml(topTriggers.join("／") || "痛點／價值／安心")}"為核心觸發，先破除疑慮，再給使用情境與價格帶。</p>
      <p><strong>主 CTA：</strong>${escapeHtml(primaryCta)}</p>
    </article>
    <article class="plan-card">
      <h4>本週執行清單</h4>
      <ul class="plan-checklist">
        ${scheduleItems || "<li>尚未排定本週貼文</li>"}
      </ul>
    </article>
  `;

  renderBoardProgress(weeklyPosts.length, publishedCount);
}

function renderBoardProgress(totalCount, publishedCount) {
  if (!refs.boardProgressFill || !refs.boardProgressText) {
    return;
  }
  const total = Math.max(0, Number(totalCount || 0));
  const published = Math.max(0, Number(publishedCount || 0));
  const percent = total > 0 ? Math.round((published / total) * 100) : 0;
  refs.boardProgressFill.style.width = `${percent}%`;
  refs.boardProgressText.textContent = `本週完成度 ${percent}%`;
}

function resolvePlanStatusClass(status) {
  const value = String(status || "").trim();
  if (value === "已發佈") {
    return "is-published";
  }
  if (value === "待上架") {
    return "is-pending";
  }
  if (value === "待拍") {
    return "is-todo";
  }
  return "is-draft";
}

function getWeeklyLinkedProducts(week) {
  const links = [
    ...new Set(
      state.posts
        .filter((post) => post.week === week)
        .map((post) => toCanonicalShopeeLink(post.link) || post.link)
        .filter(Boolean)
    )
  ];

  return links
    .map((link) => {
      const product = state.products.find((item) => (toCanonicalShopeeLink(item.link) || item.link) === link);
      if (!product) {
        return null;
      }
      return { link, product };
    })
    .filter(Boolean);
}

function getPlanningWeekKey() {
  const selectedWeek = refs.filterWeek?.value;
  if (selectedWeek && selectedWeek !== "all") {
    return selectedWeek;
  }
  return getCurrentWeekKey();
}

function getFilteredPosts({ forceWeek } = {}) {
  const weekFilter = forceWeek || refs.filterWeek.value;
  const typeFilter = refs.filterType.value;
  const statusFilter = refs.filterStatus.value;
  const searchQuery = String(refs.filterPostSearch?.value || "").trim().toLowerCase();

  return state.posts
    .filter((post) => (weekFilter === "all" ? true : post.week === weekFilter))
    .filter((post) => (typeFilter === "all" ? true : post.type === typeFilter))
    .filter((post) => (statusFilter === "all" ? true : post.status === statusFilter))
    .filter((post) => {
      if (!searchQuery) {
        return true;
      }
      const product = findProductByLink(post.link);
      const text = [
        post.title,
        post.script,
        post.cta,
        post.link,
        product?.name
      ]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return text.includes(searchQuery);
    })
    .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
}

function renderPostsTable() {
  const rows = getFilteredPosts();

  refs.postsTbody.innerHTML = rows
    .map((post) => {
      const product = findProductByLink(post.link);
      const linkText = post.link ? "連結已設定" : "未設定連結";
      const linkedProductName = product?.name ? `${escapeHtml(product.name)}` : "未綁定商品";
      const statusSelect =
        `<select data-action="set-status" data-id="${escapeAttribute(post.id)}">` +
        `${STATUS_ORDER.map((option) => `<option value="${option}" ${post.status === option ? "selected" : ""}>${option}</option>`).join("")}` +
        "</select>";
      const metrics = post.metrics || { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 };
      const metricsInputs = [
        `<span class="metric-pill" title="觸及" aria-label="觸及">❤️ ${escapeHtml(formatMetricCompact(metrics.reach || 0))}</span>`,
        `<span class="metric-pill" title="收藏" aria-label="收藏">📥 ${escapeHtml(formatMetricCompact(metrics.saves || 0))}</span>`,
        `<span class="metric-pill" title="點擊" aria-label="點擊">🖱️ ${escapeHtml(formatMetricCompact(metrics.clicks || 0))}</span>`
      ].join(" ");

      return `
        <tr class="post-row-card">
          <td>${escapeHtml(post.date)}</td>
          <td>
            <div class="post-title-wrap"><strong>${escapeHtml(post.title)}</strong><span class="post-type-chip">${post.type === "reels" ? "Reels" : "Feed"}</span></div>
            <div class="post-cta-text">${escapeHtml(post.cta || "尚未設定 CTA")}</div>
          </td>
          <td class="post-product-cell">
            <div class="post-link-stack">
              <span class="post-link-chip">🔗 ${escapeHtml(linkText)}</span>
              <span class="post-product-name">🛍️ ${linkedProductName}</span>
            </div>
          </td>
          <td class="post-status-cell"><span class="badge ${escapeAttribute(post.status)}">${escapeHtml(post.status)}</span><div class="status-select-wrap">${statusSelect}</div></td>
          <td><div class="metric-grid metric-grid-card">${metricsInputs}</div></td>
          <td>
            <div class="actions-inline icon-action-row">
              <button class="btn icon-btn" type="button" title="編輯" data-action="edit-post" data-id="${escapeAttribute(post.id)}">✏️</button>
              <button class="btn icon-btn" type="button" title="刪除" data-action="delete-post" data-id="${escapeAttribute(post.id)}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderProductsTable() {
  const rows = [...state.products].sort((a, b) => Number(a.price) - Number(b.price));
  refs.productsTbody.innerHTML = rows
    .map((product) => {
      const imageSrc = resolveProductImageSrc(product);
      const specTags = [product.size, product.material]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .map((item) => `<span class="product-spec-chip">${escapeHtml(item)}</span>`)
        .join("");
      const sellingText = String(product.selling || "-").trim() || "-";
      const safeLink = product.link
        ? `<a class="btn icon-btn icon-link-btn" href="${escapeAttribute(product.link)}" target="_blank" rel="noreferrer" title="開啟商品頁">↗️</a>`
        : `<span class="btn icon-btn icon-link-btn is-disabled" title="尚未設定商品連結">↗️</span>`;
      return `
        <tr class="product-row-card">
          <td>
            <div class="product-main-cell">
              <div class="product-thumb-wrap">${imageSrc
                ? `<img src="${escapeAttribute(imageSrc)}" alt="${escapeAttribute(product.name || "商品圖片")}" class="product-thumb" loading="lazy" />`
                : '<div class="product-thumb placeholder">🪑</div>'}</div>
              <div>
                <strong class="product-name-strong">${escapeHtml(product.name)}</strong>
                <div class="product-price-sub"><span class="price-symbol">$</span>${escapeHtml(Number(product.price || 0).toLocaleString("en-US"))}</div>
              </div>
            </div>
          </td>
          <td><div class="product-spec-wrap">${specTags || '<span class="product-spec-chip">尚未設定規格</span>'}</div></td>
          <td><span class="product-selling-truncate" title="${escapeAttribute(sellingText)}">${escapeHtml(sellingText)}</span></td>
          <td>
            <div class="actions-inline icon-action-row product-actions-row">
              ${safeLink}
              <button class="btn icon-btn icon-btn-gradient" type="button" title="編輯" data-action="edit-product" data-id="${escapeAttribute(product.id)}">✏️</button>
              <button class="btn icon-btn icon-btn-gradient" type="button" title="刪除" data-action="delete-product" data-id="${escapeAttribute(product.id)}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDmPostOptions() {
  const currentValue = refs.dmPostSelect.value;
  const options = state.posts
    .map((post) => `<option value="${escapeAttribute(post.id)}">${escapeHtml(post.date)} | ${escapeHtml(post.title)}</option>`)
    .join("");
  refs.dmPostSelect.innerHTML = options;
  if (currentValue && state.posts.some((post) => post.id === currentValue)) {
    refs.dmPostSelect.value = currentValue;
  }
}

function renderDmThreads() {
  const rows = [...state.dmThreads].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  refs.dmThreadsTbody.innerHTML = rows
    .map((thread) => {
      const post = state.posts.find((item) => item.id === thread.postId);
      const postTitle = post?.title || "(已刪除貼文)";
      const stageSelect = `
        <select data-action="set-dm-stage" data-id="${escapeAttribute(thread.id)}">
          <option value="new" ${thread.stage === "new" ? "selected" : ""}>new</option>
          <option value="qualified" ${thread.stage === "qualified" ? "selected" : ""}>qualified</option>
          <option value="offer_sent" ${thread.stage === "offer_sent" ? "selected" : ""}>offer_sent</option>
          <option value="closed" ${thread.stage === "closed" ? "selected" : ""}>closed</option>
        </select>
      `;
      return `
        <tr>
          <td>${escapeHtml(formatDateTime(thread.createdAt))}</td>
          <td>${escapeHtml(postTitle)}</td>
          <td>${escapeHtml(thread.intent)}</td>
          <td>${escapeHtml((thread.recommendedProducts || []).join(" / ") || "-")}</td>
          <td><span class="dm-stage">${escapeHtml(thread.stage)}</span><div>${stageSelect}</div></td>
          <td><button class="btn" type="button" data-action="copy-dm-thread" data-id="${escapeAttribute(thread.id)}">複製</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderBrandStrategyPanel() {
  if (!refs.brandStrategySummary || !refs.brandStrategyOutput) {
    return;
  }
  const available = Boolean(refs.brandStrategyRefreshBtn && refs.brandStrategyGenerateBtn);
  if (!available) {
    refs.brandStrategySummary.textContent = "目前前台版本未載入品牌策略面板控制項。";
    refs.brandStrategyOutput.innerHTML = "";
    return;
  }

  renderBrandStrategyMoodLabel();
  refs.brandStrategySummary.textContent = "品牌策略引擎已就緒，可開始整理品牌靈感牆。";

  const keywords = Array.isArray(brandStrategyIntakeState?.keywords) ? brandStrategyIntakeState.keywords : [];

  if (!brandStrategyPlanState) {
    const previewCells = buildBrandStrategyIgPreviewCells(null);
    refs.brandStrategyOutput.innerHTML = `
      <div class="strategy-gallery brand-strategy-stack">
        <article class="strategy-card strategy-card--hero">
          <strong class="strategy-hero-title">品牌策略畫廊（等待生成）</strong>
          <div class="content-upgrade-meta">先填寫品牌資訊並點「儲存並產生策略」，生成後會顯示完整 AI 建議。</div>
          <div class="tag-cloud" aria-label="推薦標籤雲">${keywords
            .map((tag, index) => `<button class="tag-pill" style="--tag-index:${index % 6}" type="button">#${escapeHtml(tag)}</button>`)
            .join("") || '<span class="content-upgrade-meta">尚未輸入關鍵字</span>'}</div>
        </article>
        <article class="strategy-card brand-wall-card">
          <strong>你的專屬視覺牆（九宮格）</strong>
          <div class="ig-phone-shell"><div class="ig-preview-grid">${previewCells
            .map(
              (cell) => `<div class="ig-preview-cell ${resolveIgPreviewTypeClass(cell.type)}"><span class="ig-preview-type ${resolveIgPreviewTypeClass(cell.type)}">${escapeHtml(
                formatIgPreviewBadge(cell.type)
              )}</span><div class="ig-preview-content"><strong class="ig-preview-title">${escapeHtml(cell.title)}</strong><p class="ig-preview-caption">${escapeHtml(
                cell.caption
              )}</p></div><div class="ig-preview-actions"><button class="btn btn-secondary" type="button" data-action="brand-edit-cell" data-post-id="${escapeAttribute(
                cell.postId || ""
              )}" data-cell-title="${escapeAttribute(
                cell.title
              )}" data-cell-caption="${escapeAttribute(cell.caption)}">✍️ 編輯文字</button><button class="btn btn-secondary" type="button" data-action="brand-generate-image" data-post-id="${escapeAttribute(
                cell.postId || ""
              )}" data-cell-title="${escapeAttribute(
                cell.title
              )}" data-cell-caption="${escapeAttribute(cell.caption)}">🎨 生成圖片</button></div></div>`
            )
            .join("")}</div></div>
        </article>
      </div>
    `;
    return;
  }

  const plan = brandStrategyPlanState;
  const signals = Array.isArray(plan.algorithmSignals) ? plan.algorithmSignals : [];
  const pillars = Array.isArray(plan.contentPillars) ? plan.contentPillars : [];
  const hooks = Array.isArray(plan.copyFramework?.hookTemplates) ? plan.copyFramework.hookTemplates : [];
  const ctas = Array.isArray(plan.copyFramework?.ctaTemplates) ? plan.copyFramework.ctaTemplates : [];
  const prompts = Array.isArray(plan.imagePromptFramework?.prompts) ? plan.imagePromptFramework.prompts : [];
  const previewCells = buildBrandStrategyIgPreviewCells(plan);

  refs.brandStrategyOutput.innerHTML = `
    <div class="strategy-gallery brand-strategy-stack">
      <article class="strategy-card strategy-card--hero">
        <strong class="strategy-hero-title">${escapeHtml(plan.title || "品牌策略")}</strong>
        <div class="content-upgrade-meta">${escapeHtml(plan.summary || "")}</div>
        <div class="content-upgrade-meta">週節奏：Reels ${escapeHtml(String(plan.weeklyCadence?.reels || 0))} / Feed ${escapeHtml(String(
          plan.weeklyCadence?.feed || 0
        ))} / Story ${escapeHtml(String(plan.weeklyCadence?.story || 0))}</div>
        <div class="content-upgrade-meta">產生時間：${escapeHtml(formatDateTime(plan.generatedAt || plan.createdAt || ""))}</div>
        <div class="tag-cloud" aria-label="推薦標籤雲">${keywords
          .map((tag, index) => `<button class="tag-pill" style="--tag-index:${index % 6}" type="button">#${escapeHtml(tag)}</button>`)
          .join("")}</div>
      </article>

      <article class="strategy-card brand-wall-card">
        <strong>你的專屬視覺牆（九宮格）</strong>
        <div class="ig-phone-shell"><div class="ig-preview-grid">${previewCells
          .map(
            (cell) => `<div class="ig-preview-cell ${resolveIgPreviewTypeClass(cell.type)}"><span class="ig-preview-type ${resolveIgPreviewTypeClass(cell.type)}">${escapeHtml(
              formatIgPreviewBadge(cell.type)
            )}</span><div class="ig-preview-content"><strong class="ig-preview-title">${escapeHtml(cell.title)}</strong><p class="ig-preview-caption">${escapeHtml(
              cell.caption
            )}</p></div><div class="ig-preview-actions"><button class="btn btn-secondary" type="button" data-action="brand-edit-cell" data-post-id="${escapeAttribute(
              cell.postId || ""
            )}" data-cell-title="${escapeAttribute(
              cell.title
            )}" data-cell-caption="${escapeAttribute(cell.caption)}">✍️ 編輯文字</button><button class="btn btn-secondary" type="button" data-action="brand-generate-image" data-post-id="${escapeAttribute(
              cell.postId || ""
            )}" data-cell-title="${escapeAttribute(
              cell.title
            )}" data-cell-caption="${escapeAttribute(cell.caption)}">🎨 生成圖片</button></div></div>`
          )
          .join("")}</div></div>
      </article>
    </div>

    <div class="brand-insight-grid">
      <article class="strategy-card insight-card"><strong>💡 演算法密技</strong><ul class="content-upgrade-list insight-list">${signals
      .map(
        (item) => `<li class="content-upgrade-item"><strong>✨ ${escapeHtml(item.name || "signal")}</strong><div class="content-upgrade-meta">${escapeHtml(
          item.action || ""
        )}</div></li>`
      )
      .join("")}</ul></article>
      <article class="strategy-card insight-card"><strong>🏗️ 內容骨架</strong><ul class="content-upgrade-list insight-list">${pillars
      .map(
        (item) => `<li class="content-upgrade-item"><strong>${escapeHtml(item.name || "pillar")}</strong><div class="content-upgrade-meta">${escapeHtml(
          item.why || ""
        )}</div><div class="content-upgrade-meta">✅ CTA：${escapeHtml(item.cta || "")}</div></li>`
      )
      .join("")}</ul></article>
      <article class="strategy-card insight-card"><div class="row-between"><strong>✍️ 文案靈感</strong><button class="btn btn-secondary" type="button" data-action="brand-copy-captions">一鍵複製</button></div>
        <div class="insight-copy-block">Hook：${escapeHtml(hooks.join(" / "))}<br/>CTA：${escapeHtml(ctas.join(" / "))}</div>
        <ul class="content-upgrade-list insight-list">${prompts
          .map(
            (item) => `<li class="content-upgrade-item"><strong>${escapeHtml(item.scenario || "場景")}</strong><div class="content-upgrade-meta">${escapeHtml(
              item.prompt || ""
            )}</div></li>`
          )
          .join("")}</ul>
      </article>
    </div>
  `;
}

async function syncBrandStrategyFromBackend() {
  const [intakePayload, planPayload] = await Promise.all([
    requestBrandStrategyApi("GET", "/api/brand-strategy/intake"),
    requestBrandStrategyApi("GET", "/api/brand-strategy/plan")
  ]);
  brandStrategyIntakeState = normalizeBrandStrategyIntake(intakePayload?.item || null);
  brandStrategyPlanState = normalizeBrandStrategyPlan(planPayload?.item || null);
  if (brandStrategyIntakeState) {
    hydrateBrandStrategyForm(brandStrategyIntakeState);
  }
  renderBrandStrategyPanel();
}

async function saveAndGenerateBrandStrategy() {
  if (!refs.brandStrategyBrandName) {
    return;
  }
  const payload = {
    brandName: String(refs.brandStrategyBrandName.value || "").trim(),
    industry: String(refs.brandStrategyIndustry?.value || "").trim(),
    targetAudience: String(refs.brandStrategyTargetAudience?.value || "").trim(),
    businessGoal: String(refs.brandStrategyBusinessGoal?.value || "").trim(),
    tone: composeBrandToneFromMood(String(refs.brandStrategyTone?.value || "").trim(), getBrandMoodSliderValue()),
    keywords: parseBrandStrategyKeywords(refs.brandStrategyKeywords?.value || ""),
    constraints: String(refs.brandStrategyConstraints?.value || "").trim(),
    notes: String(refs.brandStrategyNotes?.value || "").trim()
  };
  if (!payload.brandName) {
    throw new Error("brand_strategy_brand_name_required");
  }

  refs.brandStrategyGenerateBtn.disabled = true;
  refs.brandStrategyPanel?.classList.add("is-generating");
  refs.brandStrategyOutput?.classList.add("aurora-loading");
  triggerMicroFeedback();
  try {
    const intake = await requestBrandStrategyApi("POST", "/api/brand-strategy/intake", payload);
    const intakeId = String(intake?.item?.id || "").trim();
    if (!intakeId) {
      throw new Error("brand_strategy_intake_id_missing");
    }
    await requestBrandStrategyApi("POST", "/api/brand-strategy/generate", { intakeId });
    await syncBrandStrategyFromBackend();
    alert("品牌策略已產生（含文案框架與圖片指令）");
  } finally {
    refs.brandStrategyPanel?.classList.remove("is-generating");
    refs.brandStrategyOutput?.classList.remove("aurora-loading");
    refs.brandStrategyGenerateBtn.disabled = false;
  }
}

function hydrateBrandStrategyForm(intake) {
  if (!intake) {
    return;
  }
  if (refs.brandStrategyBrandName) refs.brandStrategyBrandName.value = intake.brandName || "";
  if (refs.brandStrategyIndustry) refs.brandStrategyIndustry.value = intake.industry || "";
  if (refs.brandStrategyTargetAudience) refs.brandStrategyTargetAudience.value = intake.targetAudience || "";
  if (refs.brandStrategyBusinessGoal) refs.brandStrategyBusinessGoal.value = intake.businessGoal || "";
  if (refs.brandStrategyTone) refs.brandStrategyTone.value = intake.tone || "";
  if (refs.brandStrategyKeywords) refs.brandStrategyKeywords.value = Array.isArray(intake.keywords) ? intake.keywords.join(", ") : "";
  if (refs.brandStrategyConstraints) refs.brandStrategyConstraints.value = intake.constraints || "";
  if (refs.brandStrategyNotes) refs.brandStrategyNotes.value = intake.notes || "";
}

async function requestBrandStrategyApi(method, path, body) {
  const apiBase = resolveBrandStrategyApiBase();
  const auth = resolveBrandStrategyAuthContext();
  if (!auth.tenantId) {
    throw new Error("auth_required");
  }
  const headers = {
    "content-type": "application/json",
    "x-tenant-id": auth.tenantId
  };
  if (auth.token) {
    headers.authorization = `Bearer ${auth.token}`;
  }
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include"
    });
  } catch (_error) {
    throw new Error(`brand_strategy_network_error (${apiBase})`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      handleAuthExpired();
    }
    throw new Error(String(payload.error || `brand_strategy_request_failed_${response.status}`));
  }
  return payload;
}

function resolveBrandStrategyApiBase() {
  const allowPublicOverride = Boolean(RUNTIME_CONFIG.ALLOW_PUBLIC_API_BASE_OVERRIDE);
  if (allowPublicOverride) {
    const query = new URLSearchParams(window.location.search).get("backend_api_base");
    if (query) {
      return String(query).replace(/\/+$/, "");
    }
    const fromStorage = String(localStorage.getItem(BRAND_STRATEGY_API_BASE_STORAGE_KEY) || "").trim();
    if (fromStorage) {
      return fromStorage.replace(/\/+$/, "");
    }
  }
  const fromRuntimeConfig = String(RUNTIME_CONFIG.BACKEND_API_BASE || "").trim();
  if (fromRuntimeConfig) {
    return fromRuntimeConfig.replace(/\/+$/, "");
  }
  return BRAND_STRATEGY_API_BASE_DEFAULT;
}

function initAuthUi() {
  updateAuthUi(loadAuthSession());
}

async function rehydrateAuthSessionFromBackend() {
  const session = loadAuthSession();
  if (!session?.activeTenantId) {
    return;
  }
  try {
    const payload = await requestAuthSession();
    persistAuthSession({
      actorId: payload.actorId,
      items: Array.isArray(payload.items) ? payload.items : [],
      activeTenantId: session.activeTenantId
    });
  } catch (_error) {
    clearAuthSession();
    if (refs.brandStrategySummary) {
      refs.brandStrategySummary.textContent = "登入已過期，請重新登入。";
    }
  }
}

function loadAuthSession() {
  try {
    const raw = sessionStorage.getItem(BRAND_STRATEGY_AUTH_SESSION_KEY) || localStorage.getItem(BRAND_STRATEGY_AUTH_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.connected || !parsed.activeTenantId) {
      return null;
    }
    return {
      connected: true,
      actorId: String(parsed.actorId || "").trim(),
      items: Array.isArray(parsed.items) ? parsed.items : [],
      activeTenantId: String(parsed.activeTenantId || "").trim(),
      activeRole: String(parsed.activeRole || "").trim(),
      activeTenantName: String(parsed.activeTenantName || "").trim()
    };
  } catch (_error) {
    return null;
  }
}

function persistAuthSession(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const activeItem = items.find((item) => String(item?.tenantId || "") === String(payload?.activeTenantId || "")) || items[0] || null;
  const session = {
    connected: true,
    actorId: String(payload?.actorId || "").trim(),
    items,
    activeTenantId: String(activeItem?.tenantId || payload?.activeTenantId || "").trim(),
    activeRole: String(activeItem?.role || "").trim(),
    activeTenantName: String(activeItem?.tenantName || "").trim()
  };
  sessionStorage.setItem(BRAND_STRATEGY_AUTH_SESSION_KEY, JSON.stringify(session));
  localStorage.removeItem(BRAND_STRATEGY_AUTH_SESSION_KEY);
  sessionStorage.setItem(
    TENANT_SELECTION_STORAGE_KEY,
    JSON.stringify({ activeTenantId: session.activeTenantId, items: session.items })
  );
  localStorage.removeItem(TENANT_SELECTION_STORAGE_KEY);
  updateAuthUi(session);
  return session;
}

function clearAuthSession() {
  sessionStorage.removeItem(BRAND_STRATEGY_AUTH_SESSION_KEY);
  sessionStorage.removeItem(TENANT_SELECTION_STORAGE_KEY);
  localStorage.removeItem(BRAND_STRATEGY_AUTH_SESSION_KEY);
  localStorage.removeItem(TENANT_SELECTION_STORAGE_KEY);
  updateAuthUi(null);
}

function handleAuthExpired() {
  clearAuthSession();
  if (refs.brandStrategySummary) {
    refs.brandStrategySummary.textContent = "登入已失效，請重新登入後再操作。";
  }
}

function updateAuthUi(session) {
  const connected = Boolean(session?.connected && session?.activeTenantId);
  if (refs.loginStatus) {
    refs.loginStatus.textContent = connected ? "後端模式：已登入雲端" : "後端模式：未登入";
  }
  if (refs.tenantRoleBadge) {
    refs.tenantRoleBadge.textContent = `role: ${connected ? String(session?.activeRole || "owner") : "guest"}`;
  }
  if (refs.activeTenantName) {
    refs.activeTenantName.textContent = `店家：${connected ? String(session?.activeTenantName || "未選擇") : "未登入"}`;
  }
  if (refs.authStoreName) {
    refs.authStoreName.disabled = connected;
  }
  if (refs.authRegisterBtn) {
    refs.authRegisterBtn.disabled = connected;
  }
  if (refs.authDisconnectBtn) {
    refs.authDisconnectBtn.disabled = !connected;
  }
}

function hasConnectedAuthSession() {
  return Boolean(loadAuthSession()?.activeTenantId);
}

async function onAuthRegister() {
  try {
    const email = String(refs.authEmail?.value || "").trim();
    const password = String(refs.authPassword?.value || "").trim();
    const storeName = String(refs.authStoreName?.value || "").trim();
    const payload = await requestAuthApi("/api/auth/register", { email, password, storeName });
    const session = persistAuthSession(payload);
    if (refs.brandStrategySummary) {
      refs.brandStrategySummary.textContent = `已登入 ${session.activeTenantName || "新店家"}，正在同步品牌策略。`;
    }
    await syncBrandStrategyFromBackend().catch(() => {
      if (refs.brandStrategySummary) {
        refs.brandStrategySummary.textContent = "註冊成功，但品牌策略同步失敗，請稍後重試。";
      }
    });
    alert("註冊成功，已登入雲端帳號。");
  } catch (error) {
    alert(`註冊失敗：${String(error?.message || error)}`);
  }
}

async function onAuthLogin() {
  try {
    const email = String(refs.authEmail?.value || "").trim();
    const password = String(refs.authPassword?.value || "").trim();
    const payload = await requestAuthApi("/api/auth/login", { email, password });
    const session = persistAuthSession(payload);
    if (refs.brandStrategySummary) {
      refs.brandStrategySummary.textContent = `已登入 ${session.activeTenantName || "目前店家"}，正在同步品牌策略。`;
    }
    await syncBrandStrategyFromBackend().catch(() => {
      if (refs.brandStrategySummary) {
        refs.brandStrategySummary.textContent = "登入成功，但品牌策略同步失敗，請稍後重試。";
      }
    });
    alert("登入成功。");
  } catch (error) {
    alert(`登入失敗：${String(error?.message || error)}`);
  }
}

async function onAuthDisconnect() {
  try {
    await requestAuthLogout();
  } catch (_error) {
  } finally {
    clearAuthSession();
    if (refs.brandStrategySummary) {
      refs.brandStrategySummary.textContent = "已登出。請重新登入以讀取品牌策略與雲端資料。";
    }
  }
}

async function requestAuthApi(path, body) {
  const apiBase = resolveBrandStrategyApiBase();
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include"
    });
  } catch (_error) {
    throw new Error(`auth_network_error (${apiBase})`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      handleAuthExpired();
    }
    throw new Error(String(payload.error || `auth_request_failed_${response.status}`));
  }
  return payload;
}

async function requestAuthLogout(token) {
  const apiBase = resolveBrandStrategyApiBase();
  await fetch(`${apiBase}/api/auth/logout`, {
    method: "POST",
    headers: token
      ? {
          authorization: `Bearer ${String(token || "").trim()}`
        }
      : undefined,
    credentials: "include"
  });
}

async function requestAuthSession() {
  const apiBase = resolveBrandStrategyApiBase();
  const response = await fetch(`${apiBase}/api/auth/session`, {
    method: "GET",
    credentials: "include"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload.error || `auth_session_failed_${response.status}`));
  }
  return payload;
}

function resolveBrandStrategyAuthContext() {
  const session = loadAuthSession();
  return {
    token: "",
    tenantId: String(session?.activeTenantId || "").trim()
  };
}

function parseBrandStrategyKeywords(value) {
  return [...new Set(
    String(value || "")
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )].slice(0, 20);
}

function normalizeBrandStrategyIntake(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const id = String(item.id || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    brandName: String(item.brandName || "").trim(),
    industry: String(item.industry || "general").trim() || "general",
    targetAudience: String(item.targetAudience || "").trim(),
    businessGoal: String(item.businessGoal || "").trim(),
    tone: String(item.tone || "").trim(),
    keywords: Array.isArray(item.keywords) ? item.keywords.map((keyword) => String(keyword || "").trim()).filter(Boolean) : [],
    constraints: String(item.constraints || "").trim(),
    notes: String(item.notes || "").trim(),
    createdAt: String(item.createdAt || ""),
    updatedAt: String(item.updatedAt || "")
  };
}

function normalizeBrandStrategyPlan(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const id = String(item.id || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    title: String(item.title || "").trim(),
    summary: String(item.summary || "").trim(),
    generatedAt: String(item.generatedAt || item.createdAt || "").trim(),
    createdAt: String(item.createdAt || "").trim(),
    weeklyCadence: {
      reels: Number(item.weeklyCadence?.reels || 0),
      feed: Number(item.weeklyCadence?.feed || 0),
      story: Number(item.weeklyCadence?.story || 0)
    },
    algorithmSignals: Array.isArray(item.algorithmSignals)
      ? item.algorithmSignals.map((signal) => ({
          name: String(signal?.name || "").trim(),
          action: String(signal?.action || "").trim()
        }))
      : [],
    contentPillars: Array.isArray(item.contentPillars)
      ? item.contentPillars.map((pillar) => ({
          name: String(pillar?.name || "").trim(),
          why: String(pillar?.why || "").trim(),
          cta: String(pillar?.cta || "").trim()
        }))
      : [],
    copyFramework: {
      hookTemplates: Array.isArray(item.copyFramework?.hookTemplates)
        ? item.copyFramework.hookTemplates.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      ctaTemplates: Array.isArray(item.copyFramework?.ctaTemplates)
        ? item.copyFramework.ctaTemplates.map((value) => String(value || "").trim()).filter(Boolean)
        : []
    },
    imagePromptFramework: {
      prompts: Array.isArray(item.imagePromptFramework?.prompts)
        ? item.imagePromptFramework.prompts.map((prompt) => ({
            scenario: String(prompt?.scenario || "").trim(),
            prompt: String(prompt?.prompt || "").trim()
          }))
        : []
    }
  };
}

function getBrandMoodSliderValue() {
  return Math.min(100, Math.max(0, Number(refs.brandStrategyMoodSlider?.value || 35)));
}

function getBrandMoodLabel(value) {
  if (value <= 25) {
    return "專業";
  }
  if (value <= 55) {
    return "平衡";
  }
  if (value <= 80) {
    return "活潑";
  }
  return "俏皮";
}

function renderBrandStrategyMoodLabel() {
  if (!refs.brandStrategyMoodValue) {
    return;
  }
  const value = getBrandMoodSliderValue();
  refs.brandStrategyMoodValue.textContent = `目前語氣：偏${getBrandMoodLabel(value)}（${value}）`;
}

function composeBrandToneFromMood(baseTone, moodValue) {
  const base = String(baseTone || "").trim() || "專業親切";
  return `${base}（語氣校正：${getBrandMoodLabel(moodValue)}）`;
}

function buildBrandStrategyIgPreviewCells(plan) {
  const postsByDate = [...state.posts]
    .sort((a, b) => normalizeDate(a?.date).localeCompare(normalizeDate(b?.date)))
    .map((post) => ({
      postId: String(post?.id || "").trim(),
      type: String(post?.type || "feed").toUpperCase(),
      title: String(post?.title || "現有貼文").trim() || "貼文主題",
      caption: [String(post?.date || "").trim(), String(post?.cta || "").trim()]
        .filter(Boolean)
        .join("｜")
    }));

  const cards = postsByDate;

  if (cards.length === 0) {
    const pillars = Array.isArray(plan?.contentPillars) ? plan.contentPillars : [];
    const prompts = Array.isArray(plan?.imagePromptFramework?.prompts) ? plan.imagePromptFramework.prompts : [];
    cards.push(
      ...pillars.map((pillar, index) => ({
        postId: "",
        type: index % 2 === 0 ? "Reels" : "Feed",
        title: pillar?.name || "主題",
        caption: pillar?.cta || pillar?.why || ""
      })),
      ...prompts.map((prompt, index) => ({
        postId: "",
        type: index % 2 === 0 ? "Story" : "Feed",
        title: prompt?.scenario || "視覺情境",
        caption: prompt?.prompt || ""
      }))
    );
  }

  while (cards.length < 9) {
    cards.push({
      postId: "",
      type: cards.length % 3 === 0 ? "Reels" : cards.length % 3 === 1 ? "Feed" : "Story",
      title: `靈感草稿 ${cards.length + 1}`,
      caption: "AI 產生中，點擊「儲存並產生策略」更新內容。"
    });
  }
  return cards.slice(0, 9);
}

function triggerMicroFeedback() {
  if (typeof window !== "undefined" && typeof window.navigator?.vibrate === "function") {
    window.navigator.vibrate(20);
  }
}

function resolveIgPreviewTypeClass(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized.includes("reel")) {
    return "ig-preview-type--reels";
  }
  if (normalized.includes("story")) {
    return "ig-preview-type--story";
  }
  return "ig-preview-type--feed";
}

function formatIgPreviewBadge(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized.includes("reel")) {
    return "🎬 Reels";
  }
  if (normalized.includes("story")) {
    return "🟠 Story";
  }
  return "🖼 Feed";
}

function onBrandStrategyOutputClick(event) {
  const trigger = event.target.closest("[data-action='brand-copy-captions']");
  if (trigger && brandStrategyPlanState) {
    const hooks = Array.isArray(brandStrategyPlanState.copyFramework?.hookTemplates)
      ? brandStrategyPlanState.copyFramework.hookTemplates
      : [];
    const ctas = Array.isArray(brandStrategyPlanState.copyFramework?.ctaTemplates)
      ? brandStrategyPlanState.copyFramework.ctaTemplates
      : [];
    const payload = `Hook:\n- ${hooks.join("\n- ")}\n\nCTA:\n- ${ctas.join("\n- ")}`;
    copyTextValue(payload);
    return;
  }
  const editCellTrigger = event.target.closest("[data-action='brand-edit-cell']");
  if (editCellTrigger) {
    const postId = String(editCellTrigger.getAttribute("data-post-id") || "").trim();
    const post = postId ? state.posts.find((item) => item.id === postId) : null;
    if (post) {
      openEditPostDialog(post);
      return;
    }
    alert("此格目前尚未綁定貼文，請先到貼文管理建立對應貼文。");
    return;
  }
  const genImageTrigger = event.target.closest("[data-action='brand-generate-image']");
  if (genImageTrigger) {
    const postId = String(genImageTrigger.getAttribute("data-post-id") || "").trim();
    const post = postId ? state.posts.find((item) => item.id === postId) : null;
    if (post) {
      openEditPostDialog(post);
      return;
    }
    alert("此格目前尚未綁定貼文，請先到貼文管理建立對應貼文。");
  }
}

function copyTextValue(value) {
  const text = String(value || "");
  if (!text) {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      alert("已複製到剪貼簿");
    }).catch(() => {
      fallbackCopyText(text);
    });
    return;
  }
  fallbackCopyText(text);
}

function fallbackCopyText(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "readonly");
  area.style.position = "absolute";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
  alert("已複製到剪貼簿");
}

function copyTextFromField(field) {
  const value = field && typeof field.value === "string" ? field.value : "";
  copyTextValue(value);
}

function openCreatePostDialog() {
  refs.postForm.reset();
  refs.postId.value = "";
  refs.postWeek.value = "W1";
  refs.postType.value = "reels";
  refs.postStatus.value = "草稿";
  refs.postTriggerTags.value = "";
  refs.postFormTitle.textContent = "新增貼文";
  updatePostAutomationPreview();
  refs.postDialog.showModal();
}

function openEditPostDialog(post) {
  refs.postId.value = post.id;
  refs.postDate.value = post.date || "";
  refs.postType.value = post.type || "reels";
  refs.postWeek.value = post.week || "W1";
  refs.postStatus.value = post.status || "草稿";
  refs.postTitle.value = post.title || "";
  refs.postScript.value = post.script || "";
  refs.postCta.value = post.cta || "";
  refs.postLink.value = post.link || "";
  refs.postTriggerTags.value = (post.triggerTags || []).join(", ");
  refs.postFormTitle.textContent = "編輯貼文";
  updatePostAutomationPreview();
  refs.postDialog.showModal();
}

function onSubmitPost(event) {
  event.preventDefault();
  createStateBackup("before_save_post");

  const existing = state.posts.find((post) => post.id === refs.postId.value);

  const item = {
    id: refs.postId.value || createId("p"),
    date: refs.postDate.value.trim(),
    type: refs.postType.value,
    week: refs.postWeek.value,
    status: refs.postStatus.value,
    title: refs.postTitle.value.trim(),
    script: refs.postScript.value.trim(),
    cta: refs.postCta.value.trim(),
    link: refs.postLink.value.trim(),
    triggerTags: parseTagInput(refs.postTriggerTags.value),
    metrics: existing?.metrics || {
      reach: 0,
      saves: 0,
      dms: 0,
      clicks: 0,
      orders: 0
    }
  };

  const existingIndex = state.posts.findIndex((post) => post.id === item.id);
  if (existingIndex >= 0) {
    state.posts[existingIndex] = item;
  } else {
    state.posts.push(item);
  }

  syncDraftTitlesWithProducts(false);
  saveState();
  refs.postDialog.close();
  renderAll();
}

function updatePostAutomationPreview() {
  const draft = {
    date: refs.postDate.value.trim(),
    type: refs.postType.value,
    week: refs.postWeek.value,
    status: refs.postStatus.value,
    title: refs.postTitle.value.trim(),
    script: refs.postScript.value.trim(),
    cta: refs.postCta.value.trim(),
    link: refs.postLink.value.trim(),
    triggerTags: parseTagInput(refs.postTriggerTags.value)
  };

  const products = resolvePostProducts(draft);
  const product = products[0] || null;
  const caption = buildAutoCaption(draft, product, products);
  refs.postAutoCaption.value = caption;
  refs.postImagePrompt.value = buildImagePrompt(draft, product, caption, products);
}

function findProductByLink(link) {
  if (!link) {
    return null;
  }
  const normalized = toCanonicalShopeeLink(link) || link;
  return state.products.find((item) => {
    const itemLink = toCanonicalShopeeLink(item.link) || item.link;
    return itemLink === normalized;
  }) || null;
}

function resolvePostProducts(post) {
  const result = [];
  const seen = new Set();

  parsePostLinks(post.link).forEach((link) => {
    const product = findProductByLink(link);
    if (!product || seen.has(product.id)) {
      return;
    }
    seen.add(product.id);
    result.push(product);
  });

  const text = normalizeMatchText(`${post.title || ""} ${post.script || ""}`);
  if (!text) {
    return result;
  }
  const hasListStyle = /[\/、+＋&]|清單|價位段|比較|合集/.test(text);

  state.products.forEach((product) => {
    const normalizedName = normalizeMatchText(product?.name);
    if (!product || seen.has(product.id) || !normalizedName) {
      return;
    }
    if (!text.includes(normalizedName)) {
      return;
    }
    seen.add(product.id);
    result.push(product);
  });

  if (hasListStyle) {
    PRODUCT_CATEGORY_RULES.forEach((rule) => {
      if (!text.includes(rule.token)) {
        return;
      }
      let picked = 0;
      state.products.forEach((product) => {
        if (picked >= rule.limit || !product || seen.has(product.id)) {
          return;
        }
        const name = String(product.name || "");
        const selling = String(product.selling || "");
        if (!name.includes(rule.token) && !selling.includes(rule.token)) {
          return;
        }
        seen.add(product.id);
        result.push(product);
        picked += 1;
      });
    });
  }

  return result;
}

function parsePostLinks(linkText) {
  return String(linkText || "")
    .split(/[|,;\n\r\t ]+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => toCanonicalShopeeLink(item) || item);
}

function normalizeMatchText(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function buildLinkedTitle(post, product) {
  const base = String(post.title || "").trim();
  if (!product) {
    return base;
  }
  const name = String(product.name || "").trim();
  if (!name) {
    return base;
  }

  let next = base;
  LEGACY_PRODUCT_TERMS.forEach((term) => {
    if (next.includes(term)) {
      next = next.replaceAll(term, name);
    }
  });
  if (!next.includes(name)) {
    next = `${next}（${name}）`;
  }
  return next;
}

function syncDraftTitlesWithProducts(persist) {
  let changed = false;
  state.posts = state.posts.map((post) => {
    if (post.status !== "草稿") {
      return post;
    }
    const product = findProductByLink(post.link);
    const nextTitle = buildLinkedTitle(post, product);
    if (nextTitle === post.title) {
      return post;
    }
    changed = true;
    return {
      ...post,
      title: nextTitle
    };
  });

  if (changed && persist) {
    saveState();
  }
}

function buildAutoCaption(post, product, products = []) {
  const formatLabel = post.type === "feed" ? "Feed 輪播" : "Reels";
  const strategy = buildCaptionStrategy(post, product);
  const resolvedProducts = products.length > 0 ? products : product ? [product] : [];
  const isListStyle = resolvedProducts.length >= 2 || /清單|價位段|比較|合集|\//.test(`${post.title || ""} ${post.script || ""}`);

  if (isListStyle) {
    return buildListStyleAutoCaption(post, formatLabel, resolvedProducts, strategy);
  }
  return buildSingleStyleAutoCaption(post, formatLabel, product, strategy);
}

function buildListStyleAutoCaption(post, formatLabel, products, strategy) {
  const focusProducts = products.slice(0, 4);
  const priceRange = extractPriceRangeText(`${post.title || ""} ${post.script || ""}`);
  const headline = post.title || `${priceRange ? `${priceRange} ` : ""}實品清單`;
  const hook = priceRange
    ? `${priceRange} 預算也能挑到有質感又實用的家具，這篇幫你一次比完。`
    : "租屋小宅最怕買錯家具，這篇直接給你可落地的實品清單。";
  const proofLine = focusProducts.length > 0
    ? `本篇精選 ${focusProducts.length} 款：${focusProducts.map((item) => item.name).join("、")}`
    : "本篇精選本週高詢問商品，按場景與預算快速篩選。";

  const productLines = focusProducts.map((item, index) => {
    const keyword = buildConversionKeyword(item, index);
    const priceText = item.price ? `NT$${item.price}` : "價格私訊";
    const sellingText = shortenForCaption(item.selling || "對小空間友善，日常好用不踩雷", 16);
    return `- ${index + 1}) ${item.name || "未命名商品"}｜${priceText}｜${sellingText}｜留言【${keyword}】`;
  });

  const selectionGuide = buildSelectionGuide(focusProducts);
  const action = post.cta || strategy.defaultCta;
  const hashTags = [...strategy.hashTags, "#實品清單", "#租屋選物"].filter(Boolean);
  const uniqueTags = [...new Set(hashTags)].slice(0, 9).join(" ");

  return [
    `【${formatLabel}｜${post.week || "W1"}】${headline}`,
    hook,
    post.script || strategy.storyline,
    proofLine,
    ...productLines,
    `選購 3 問：${selectionGuide}`,
    `${action}，留言【任一關鍵字】我私訊完整連結 + 尺寸搭配建議。`,
    "連結在個人檔案（Bio）或置頂留言。",
    uniqueTags
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSingleStyleAutoCaption(post, formatLabel, product, strategy) {
  const action = post.cta || strategy.defaultCta;
  const keyword = product ? buildConversionKeyword(product, 0) : "家具清單";
  const proofParts = [];

  if (product?.price) {
    proofParts.push(`NT$${product.price}`);
  }
  if (product?.size) {
    proofParts.push(`尺寸 ${product.size}`);
  }
  if (product?.material) {
    proofParts.push(`材質 ${product.material}`);
  }

  const proofLine = proofParts.length > 0 ? `證據重點：${proofParts.slice(0, 2).join("｜")}` : "證據重點：已整理尺寸與材質，避免買錯。";
  const productLine = product
    ? `${product.name || "這款家具"}：${shortenForCaption(product.selling || "高頻使用場景實測可行", 22)}`
    : "這則內容會給你可直接執行的家具選購順序。";
  const hashtags = strategy.hashTags.slice(0, 8).join(" ");

  return [
    `【${formatLabel}｜${post.week || "W1"}】${post.title || "本週主推"}`,
    strategy.hook,
    post.script || strategy.storyline,
    productLine,
    proofLine,
    `${action}，留言【${keyword}】我私訊連結 + 尺寸建議。`,
    "連結在個人檔案（Bio）。",
    hashtags
  ]
    .filter(Boolean)
    .join("\n");
}

function extractPriceRangeText(text) {
  const normalized = String(text || "").replace(/,/g, "");
  const match = normalized.match(/(\d{3,5})\s*[-~～到至]\s*(\d{3,5})/);
  if (!match) {
    return "";
  }
  return `${match[1]}-${match[2]}`;
}

function buildSelectionGuide(products) {
  const hasEntry = products.some((item) => Number(item.price || 0) > 0 && Number(item.price || 0) < 2200);
  const hasMid = products.some((item) => Number(item.price || 0) >= 2200 && Number(item.price || 0) < 3200);
  const hasPremium = products.some((item) => Number(item.price || 0) >= 3200);
  const budgetHint = hasEntry && hasMid && hasPremium
    ? "先看預算區間（入門/均衡/升級）"
    : "先看預算與使用頻率";
  return `${budgetHint}、再看放置動線、最後看材質/風格是否耐看`;
}

function buildConversionKeyword(product, index) {
  const id = extractProductIdFromLink(product?.link || "");
  const suffix = id ? id.slice(-4) : String(index + 1).padStart(2, "0");
  const token = PRODUCT_CATEGORY_RULES.find((rule) => String(product?.name || "").includes(rule.token))?.token || "選物";
  return `${token}${suffix}`;
}

function shortenForCaption(text, maxLen) {
  const source = String(text || "").trim();
  if (source.length <= maxLen) {
    return source;
  }
  return `${source.slice(0, Math.max(0, maxLen - 1))}…`;
}

function buildCaptionStrategy(post, product) {
  const tags = Array.isArray(post.triggerTags) ? post.triggerTags : [];
  const lowerTags = tags.map((tag) => String(tag || "").trim().toLowerCase());
  const price = Number(product?.price || 0);
  const priceBand = getPriceBand(price);
  const priceText = price > 0 ? `NT$${price}` : "未填";
  const scene = String(product?.scene || "租屋小宅").trim();
  const material = String(product?.material || "").trim();
  const selling = String(product?.selling || "").trim();
  const size = String(product?.size || "").trim();
  const productName = String(product?.name || post.title || "這款家具").trim();

  const hook = pickCaptionHook({ lowerTags, priceBand, scene, material, size });
  const storyline = pickStoryline({ productName, scene, selling, material, size });
  const valuePoints = buildValuePoints({ priceBand, scene, selling, material, size, productName });
  const urgencyLine = lowerTags.some((tag) => tag.includes("緊迫") || tag.includes("限時") || tag.includes("稀缺"))
    ? "⏰ 本週優先處理同類型需求，想比價/看細節建議今天先私訊卡位。"
    : "";
  const defaultCta = pickDefaultCta(priceBand, scene);
  const hashTags = buildHashtags({ priceBand, scene, material, tags });

  return {
    hook,
    storyline,
    valuePoints,
    urgencyLine,
    defaultCta,
    hashTags,
    priceText,
    triggerSummary: tags.join("、")
  };
}

function getPriceBand(price) {
  if (price <= 0) {
    return "unknown";
  }
  if (price < 1800) {
    return "entry";
  }
  if (price <= 3200) {
    return "mid";
  }
  return "premium";
}

function pickCaptionHook({ lowerTags, priceBand, scene, material, size }) {
  if (lowerTags.some((tag) => tag.includes("痛點"))) {
    return "你是不是也遇過空間擺不下、買了又不合用的家具困擾？";
  }
  if (lowerTags.some((tag) => tag.includes("安心") || tag.includes("證據"))) {
    return "先看尺寸、材質、動線再下單，這樣買家具才不踩雷。";
  }
  if (priceBand === "entry") {
    return "預算有限也能把家裡整理得有質感，重點是選對功能型家具。";
  }
  if (priceBand === "premium") {
    return "想一次到位的質感佈置，關鍵在材質、比例和場景搭配。";
  }
  if (String(scene).includes("玄關")) {
    return "玄關空間不大，但只要一件對的家具，進門動線就會差很多。";
  }
  if (String(size).includes("小") || String(size).includes("窄") || String(size).includes("薄")) {
    return "小坪數也能兼顧收納和美感，關鍵在尺寸與用途要精準。";
  }
  if (String(material).includes("實木") || String(material).includes("竹")) {
    return "看起來簡單的一件家具，材質其實決定了空間質感與耐用度。";
  }
  return "想讓家更好住，不一定要大改造，先從高使用率家具開始最有效。";
}

function pickStoryline({ productName, scene, selling, material, size }) {
  const sellingLine = selling || "示範實際擺放、尺寸重點與選購建議";
  const materialLine = material ? `再補充 ${material} 的日常使用優勢` : "再補充材質挑選原則";
  const sizeLine = size ? `最後確認 ${size} 是否符合動線` : "最後確認尺寸是否符合動線";
  return `今天用 ${productName} 來示範：在「${scene}」怎麼做到 ${sellingLine}，${materialLine}，${sizeLine}。`;
}

function buildValuePoints({ priceBand, scene, selling, material, size, productName }) {
  const points = [];
  points.push(selling || `${productName} 聚焦在高頻使用情境，先解決每天都會遇到的空間問題。`);
  points.push(`適用場景：${scene || "租屋小宅"}，優先優化動線與收納效率。`);
  points.push(material ? `材質重點：${material}，兼顧外觀與耐用。` : "材質重點：先看清潔維護與耐用度，再看風格。 ");
  points.push(size ? `尺寸建議：${size}，下單前先量好預留空間。` : "尺寸建議：下單前先量走道與開門距離，避免卡動線。");

  if (priceBand === "entry") {
    points.push("價格角度：入門預算也能先做到 80 分實用度，適合先求好用再升級。");
  } else if (priceBand === "mid") {
    points.push("價格角度：中價位重點是功能與質感平衡，長期使用更划算。");
  } else if (priceBand === "premium") {
    points.push("價格角度：高價位要看工藝與耐用，投資在高使用率區域最值得。");
  }

  return points.slice(0, 5);
}

function pickDefaultCta(priceBand, scene) {
  if (priceBand === "entry") {
    return "私訊我拿「萬元內空間配置清單」";
  }
  if (priceBand === "premium") {
    return "私訊我拿完整規格比較與空間搭配建議";
  }
  if (String(scene).includes("玄關")) {
    return "私訊我拿玄關尺寸對照表與替代款清單";
  }
  return "私訊我拿這款的尺寸/材質/搭配建議";
}

function buildHashtags({ priceBand, scene, material, tags }) {
  const list = ["#小坪數家具", "#居家佈置", "#租屋改造"];

  if (priceBand === "entry") {
    list.push("#平價家具", "#高CP值");
  } else if (priceBand === "premium") {
    list.push("#質感家具", "#空間設計");
  } else {
    list.push("#家具選購", "#小宅收納");
  }

  if (String(scene).includes("玄關")) {
    list.push("#玄關收納", "#玄關佈置");
  }
  if (String(scene).includes("客廳")) {
    list.push("#客廳改造");
  }
  if (String(scene).includes("床邊")) {
    list.push("#臥室佈置");
  }
  if (String(material).includes("實木")) {
    list.push("#實木家具");
  }
  if (String(material).includes("竹")) {
    list.push("#竹編家具");
  }

  tags.slice(0, 3).forEach((tag) => {
    const clean = String(tag || "").replace(/\s+/g, "");
    if (clean) {
      list.push(`#${clean}`);
    }
  });

  return [...new Set(list)].slice(0, 10);
}

function buildImagePrompt(post, product, captionText, products = []) {
  const baseProducts = products.length > 0 ? products : product ? [product] : [];
  const scene = product?.scene || baseProducts[0]?.scene || "3-5坪租屋套房";
  const typeStyle = post.type === "feed" ? "Instagram feed carousel" : "Instagram reels cover series";
  const visualSteps = deriveVisualSteps({ post, captionText, scene, products: baseProducts });

  const blocks = visualSteps.map((step, index) => {
    return [
      `[Prompt ${index + 1}]`,
      `${typeStyle}, Taiwan small-apartment furniture lifestyle photo, ${step.subject}.`,
      `Visual goal: ${step.goal}.`,
      `Scene: ${scene}, warm natural daylight, clean renter-home atmosphere, modern Japanese-minimal styling.`,
      `Composition: ${step.composition}, vertical 4:5, clean product edges, practical room depth.`,
      "Quality: high detail, photorealistic, realistic materials, e-commerce editorial grade.",
      `Conversion intent: ${step.intent}.`,
      "Negative prompt: blurry, low quality, wrong proportions, distorted furniture, extra limbs, watermark, text overlay, messy clutter."
    ].join(" ");
  });

  return blocks.join("\n\n");
}

function deriveVisualSteps({ post, captionText, scene, products }) {
  const requirements = splitScriptRequirements(post.script);
  const caption = String(captionText || "");
  const productNames = products.map((item) => item.name).filter(Boolean).join(" / ") || post.title || "small-space furniture";
  const material = products[0]?.material || "wood/metal";
  const size = products[0]?.size || "small-space fit";
  const selling = products[0]?.selling || "multi-use and space-saving";
  const steps = [];

  requirements.forEach((requirement) => {
    const req = String(requirement || "").trim();
    if (!req) {
      return;
    }

    if (/情境|場景|lifestyle/i.test(req)) {
      steps.push({
        subject: `${productNames} placed naturally in ${scene}`,
        goal: "show real-life use context in a small apartment",
        composition: "wide lifestyle shot, product as hero with surrounding functional space",
        intent: "help viewer imagine product in their own room"
      });
      return;
    }

    if (/材質|material|質感/i.test(req)) {
      steps.push({
        subject: `${productNames}, close-up texture of ${material}`,
        goal: "prove material quality and tactile texture",
        composition: "macro close-up on edge and surface texture, soft side light",
        intent: "reduce hesitation about quality and durability"
      });
      return;
    }

    if (/尺寸|scale|size|量測/i.test(req)) {
      steps.push({
        subject: `${productNames} with visible scale reference, size ${size}`,
        goal: "prove dimensions and walkway compatibility",
        composition: "front angle with floor reference object, clear spacing around furniture",
        intent: "help buyer quickly judge if it fits their home"
      });
      return;
    }

    if (/多用途|用途|一桌兩用|一物多用|use-case/i.test(req)) {
      steps.push({
        subject: `${productNames} in multiple use contexts, highlight ${selling}`,
        goal: "show one product solving multiple daily needs",
        composition: "same product in two to three home corners, consistent color tone",
        intent: "increase perceived value and conversion motivation"
      });
      return;
    }

    if (/cta|行動|私訊|留言/i.test(req)) {
      steps.push({
        subject: `${productNames} hero shot with clean purchase-ready styling`,
        goal: "final conversion frame that feels ready to buy",
        composition: "center hero shot, tidy background, premium but realistic",
        intent: "trigger immediate inquiry or keyword comment"
      });
      return;
    }

    steps.push({
      subject: `${productNames}`,
      goal: `visualize requirement: ${req}`,
      composition: "balanced lifestyle shot with clear product focus",
      intent: "translate script idea into a direct visual"
    });
  });

  if (steps.length === 0) {
    steps.push({
      subject: `${productNames} in ${scene}`,
      goal: "show key use-case and product value",
      composition: "clean vertical lifestyle shot with product center focus",
      intent: "show practical value for small-space renters"
    });
  }

  if (/小坪數|小空間|租屋/.test(caption) && !steps.some((step) => /small apartment|walkway|fits/i.test(step.goal + step.intent))) {
    steps.push({
      subject: `${productNames} optimized for compact apartment layout`,
      goal: "prove small-space friendliness and clear movement path",
      composition: "slightly elevated angle to show full room layout and flow",
      intent: "answer small-space fit concerns at a glance"
    });
  }

  return steps.slice(0, post.type === "feed" ? 6 : 4);
}

function splitScriptRequirements(scriptText) {
  const source = String(scriptText || "").trim();
  if (!source) {
    return ["Show key use-case and product value"];
  }

  const byArrow = source
    .split(/->|→|➡|⟶|=>/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (byArrow.length > 1) {
    return byArrow;
  }

  const byLine = source
    .split(/\r?\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  return byLine.length > 0 ? byLine : [source];
}

function parseTagInput(tagText) {
  return String(tagText || "")
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function copyTextFromField(fieldNode) {
  const text = fieldNode.value || "";
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    fieldNode.focus();
    fieldNode.select();
    document.execCommand("copy");
  }
}

function openCreateProductDialog() {
  refs.productForm.reset();
  refs.productId.value = "";
  refs.productFormTitle.textContent = "新增商品";
  refs.productDialog.showModal();
}

function openEditProductDialog(product) {
  refs.productId.value = product.id;
  refs.productName.value = product.name || "";
  refs.productPrice.value = String(product.price || "");
  refs.productSize.value = product.size || "";
  refs.productMaterial.value = product.material || "";
  refs.productPhotoName.value = product.photoName || "";
  refs.productSelling.value = product.selling || "";
  refs.productLink.value = product.link || "";
  refs.productScene.value = product.scene || "";
  refs.productFormTitle.textContent = "編輯商品";
  refs.productDialog.showModal();
}

function onSubmitProduct(event) {
  event.preventDefault();
  createStateBackup("before_save_product");

  const item = {
    id: refs.productId.value || createId("g"),
    name: refs.productName.value.trim(),
    price: Number(refs.productPrice.value || 0),
    size: refs.productSize.value.trim(),
    material: refs.productMaterial.value.trim(),
    photoName: refs.productPhotoName.value.trim(),
    selling: refs.productSelling.value.trim(),
    link: refs.productLink.value.trim(),
    scene: refs.productScene.value.trim()
  };

  const existingIndex = state.products.findIndex((product) => product.id === item.id);
  if (existingIndex >= 0) {
    state.products[existingIndex] = item;
  } else {
    state.products.push(item);
  }

  syncDraftTitlesWithProducts(false);
  saveState();
  refs.productDialog.close();
  renderAll();
}

function onPostsTableClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  if (!action || !id) {
    return;
  }

  const post = state.posts.find((item) => item.id === id);
  if (!post) {
    return;
  }

  if (action === "edit-post") {
    openEditPostDialog(post);
    return;
  }

  if (action === "delete-post") {
    withAutoBackup("before_delete_post", () => {
      state.posts = state.posts.filter((item) => item.id !== id);
      saveState();
      renderAll();
    });
  }
}

function onProductsTableClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  if (!action || !id) {
    return;
  }

  const product = state.products.find((item) => item.id === id);
  if (!product) {
    return;
  }

  if (action === "edit-product") {
    openEditProductDialog(product);
    return;
  }

  if (action === "delete-product") {
    withAutoBackup("before_delete_product", () => {
      state.products = state.products.filter((item) => item.id !== id);
      saveState();
      renderAll();
    });
  }
}

function onGenerateDmScript() {
  const postId = refs.dmPostSelect.value;
  const intent = refs.dmIntentSelect.value;
  const question = refs.dmUserQuestion.value.trim();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) {
    refs.dmScriptOutput.value = "請先選擇來源貼文";
    return;
  }

  const product = findProductByLink(post.link);
  const dmScript = buildDmScript({ post, product, intent, question });
  refs.dmScriptOutput.value = dmScript;

  const thread = {
    id: createId("dm"),
    createdAt: new Date().toISOString(),
    postId: post.id,
    intent,
    stage: "new",
    recommendedProducts: suggestProductsForIntent(product, intent),
    script: dmScript
  };
  state.dmThreads.push(thread);
  saveState();
  renderKpi();
  renderDmThreads();
  generateWeeklyReport();
}

function buildDmScript({ post, product, intent, question }) {
  const intentLabel = mapIntentLabel(intent);
  const recommended = suggestProductsForIntent(product, intent).join("、") || "目前貼文商品";
  const productLine = product
    ? `商品：${product.name}（NT$${product.price || ""}，${product.size || "尺寸待確認"}）`
    : "商品：可依你空間條件推薦 2-3 款";
  const questionLine = question ? `我看到你提到：${question}` : "我先幫你整理最適合的選項：";

  return [
    `嗨～謝謝你私訊！我來幫你處理「${intentLabel}」這題 🙌`,
    questionLine,
    productLine,
    `推薦優先：${recommended}`,
    intent === "price" ? "如果你希望控制預算，我可以再給你 2,000 / 3,000 兩個版本比較。" : "如果你願意，我可以再依你家的實際空間給你精準配置建議。",
    `這篇來源貼文：${post.title}`,
    `商品連結：${toCanonicalShopeeLink(post.link) || post.link || "待補"}`,
    "你回我『空間尺寸 + 預算』，我直接幫你配一套 ✅"
  ].join("\n");
}

function suggestProductsForIntent(primaryProduct, intent) {
  const first = primaryProduct ? [primaryProduct.name] : [];
  const pool = [...state.products];

  if (intent === "price") {
    const sorted = pool.sort((a, b) => Number(a.price || 0) - Number(b.price || 0)).slice(0, 2).map((p) => p.name);
    return [...new Set([...first, ...sorted])].slice(0, 3);
  }

  if (intent === "size") {
    const bySize = pool.filter((p) => String(p.size || "").length > 0).slice(0, 2).map((p) => p.name);
    return [...new Set([...first, ...bySize])].slice(0, 3);
  }

  if (intent === "material") {
    const byMat = pool.filter((p) => String(p.material || "").length > 0).slice(0, 2).map((p) => p.name);
    return [...new Set([...first, ...byMat])].slice(0, 3);
  }

  return [...new Set([...first, ...pool.slice(0, 2).map((p) => p.name)])].slice(0, 3);
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

function onDmThreadsClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  if (action !== "copy-dm-thread" || !id) {
    return;
  }

  const thread = state.dmThreads.find((item) => item.id === id);
  if (!thread) {
    return;
  }
  refs.dmScriptOutput.value = thread.script || "";
  copyTextFromField(refs.dmScriptOutput);
}

function onDmStageChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  if (target.getAttribute("data-action") !== "set-dm-stage") {
    return;
  }
  const id = target.getAttribute("data-id");
  if (!id) {
    return;
  }
  const thread = state.dmThreads.find((item) => item.id === id);
  if (!thread) {
    return;
  }
  thread.stage = target.value;
  saveState();
  renderDmThreads();
  generateWeeklyReport();
}

function generateWeeklyReport() {
  const totals = sumPostMetrics();
  const dmStats = summarizeDmThreads();
  const topPosts = rankTopPostsByClickRate(3);
  const triggerStats = summarizeTriggerTags();
  const intentStats = summarizeDmIntent();

  const lines = [
    `週報日期：${formatDateTime(new Date().toISOString())}`,
    "",
    "【漏斗總覽】",
    `- 觸及：${totals.reach}`,
    `- 收藏率：${ratioText(totals.saves, totals.reach)}`,
    `- 私訊率：${ratioText(totals.dms, totals.reach)}`,
    `- 點擊率：${ratioText(totals.clicks, totals.reach)}`,
    `- 下單率：${ratioText(totals.orders, totals.clicks)}`,
    "",
    "【DM 轉單】",
    `- 對話數：${dmStats.total}`,
    `- qualified：${dmStats.qualified}`,
    `- closed：${dmStats.closed}`,
    `- DM 成交率：${ratioText(dmStats.closed, dmStats.qualified || dmStats.total)}`,
    "",
    "【高表現貼文（點擊率）】",
    ...topPosts.map((item, index) => `${index + 1}. ${item.title} - ${ratioText(item.clicks, item.reach)} (${item.clicks}/${item.reach})`),
    "",
    "【高轉化觸發標籤】",
    ...triggerStats.map((item, index) => `${index + 1}. ${item.tag} (${item.count})`),
    "",
    "【DM 熱門意圖】",
    ...intentStats.map((item, index) => `${index + 1}. ${mapIntentLabel(item.intent)} (${item.count})`)
  ];

  refs.weeklyReportOutput.value = lines.join("\n");
  renderWeeklyReportKpiCards(totals, dmStats);
  renderWeeklyActions({ topPosts, triggerStats, intentStats });
}

function renderWeeklyReportKpiCards(totals, dmStats) {
  if (!refs.weeklyReportKpiCards) {
    return;
  }
  const cards = [
    { label: "觸及", value: Number(totals.reach || 0), trend: getTrendHint(Number(totals.reach || 0), 1000) },
    { label: "收藏率", value: ratioText(totals.saves, totals.reach), trend: getTrendHint(rateValue(totals.saves, totals.reach), 0.04) },
    { label: "私訊率", value: ratioText(totals.dms, totals.reach), trend: getTrendHint(rateValue(totals.dms, totals.reach), 0.02) },
    { label: "成交率", value: ratioText(dmStats.closed, dmStats.qualified || dmStats.total), trend: getTrendHint(rateValue(dmStats.closed, dmStats.qualified || dmStats.total), 0.25) }
  ];
  refs.weeklyReportKpiCards.innerHTML = cards
    .map(
      (item) => `<article class="weekly-kpi-card ${item.trend.className}"><div class="weekly-kpi-label">${escapeHtml(
        item.label
      )}</div><div class="weekly-kpi-value">${escapeHtml(String(item.value))}</div><div class="weekly-kpi-trend">${escapeHtml(item.trend.icon)} ${escapeHtml(
        item.trend.text
      )}</div></article>`
    )
    .join("");
}

function getTrendHint(value, threshold) {
  if (Number(value || 0) >= Number(threshold || 0)) {
    return {
      icon: "↑",
      text: "高於目標",
      className: "trend-up"
    };
  }
  return {
    icon: "↓",
    text: "可再優化",
    className: "trend-down"
  };
}

function rateValue(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (d <= 0) {
    return 0;
  }
  return n / d;
}

function rankTopPostsByClickRate(limit) {
  return [...state.posts]
    .map((post) => {
      const metrics = post.metrics || {};
      return {
        title: post.title || "(未命名)",
        reach: Number(metrics.reach || 0),
        clicks: Number(metrics.clicks || 0)
      };
    })
    .filter((item) => item.reach > 0)
    .sort((a, b) => b.clicks / b.reach - a.clicks / a.reach)
    .slice(0, limit);
}

function summarizeTriggerTags() {
  const counter = new Map();
  state.posts.forEach((post) => {
    (post.triggerTags || []).forEach((tag) => {
      const key = String(tag || "").trim();
      if (!key) {
        return;
      }
      counter.set(key, (counter.get(key) || 0) + 1);
    });
  });
  return [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function summarizeDmIntent() {
  const counter = new Map();
  state.dmThreads.forEach((thread) => {
    const intent = thread.intent || "other";
    counter.set(intent, (counter.get(intent) || 0) + 1);
  });
  return [...counter.entries()]
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function renderWeeklyActions({ topPosts, triggerStats, intentStats }) {
  const actions = [];
  if (topPosts.length > 0) {
    actions.push(`延伸製作「${topPosts[0].title}」同題材 2 支內容，沿用高點擊結構。`);
  }
  if (triggerStats.length > 0) {
    actions.push(`下週主打觸發標籤：${triggerStats[0].tag}，至少佔 40% 貼文。`);
  }
  if (intentStats.length > 0) {
    actions.push(`DM 熱門問題是「${mapIntentLabel(intentStats[0].intent)}」，新增一篇專門解答貼文。`);
  }
  actions.push("每日更新 DM thread 階段，確保 qualified 名單 24 小時內回覆。", "持續回填 reach/click/order，避免下週策略失真。", "每週檢查 CTA 與關鍵字回覆率，持續優化轉化流程。");

  refs.weeklyActions.innerHTML = actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("");
}

function renderSopChecklist() {
  const todayKey = getTodayKey();
  const doneMap = state.sopDaily[todayKey] || {};
  refs.sopChecklist.innerHTML = DAILY_SOP_ITEMS.map((item, index) => {
    const checked = Boolean(doneMap[String(index)]);
    return `
      <li class="sop-item ${checked ? "done" : ""}">
        <label>
          <input type="checkbox" data-action="sop-check" data-index="${index}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(item)}</span>
        </label>
      </li>
    `;
  }).join("");
}

function onSopChecklistChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (target.getAttribute("data-action") !== "sop-check") {
    return;
  }

  const index = target.getAttribute("data-index");
  if (!index) {
    return;
  }
  const todayKey = getTodayKey();
  if (!state.sopDaily[todayKey]) {
    state.sopDaily[todayKey] = {};
  }
  state.sopDaily[todayKey][index] = target.checked;
  saveState();
  renderSopChecklist();
}

function resetTodaySop() {
  createStateBackup("before_reset_sop");
  const todayKey = getTodayKey();
  state.sopDaily[todayKey] = {};
  saveState();
  renderSopChecklist();
}

function onPostStatusChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  if (target.getAttribute("data-action") !== "set-status") {
    return;
  }

  const id = target.getAttribute("data-id");
  if (!id) {
    return;
  }

  const post = state.posts.find((item) => item.id === id);
  if (!post) {
    return;
  }

  post.status = target.value;
  saveState();
  renderAll();
}

function onPostMetricChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (target.getAttribute("data-action") !== "set-metric") {
    return;
  }

  const id = target.getAttribute("data-id");
  const metricKey = target.getAttribute("data-metric");
  if (!id || !metricKey) {
    return;
  }

  const post = state.posts.find((item) => item.id === id);
  if (!post) {
    return;
  }

  if (!post.metrics) {
    post.metrics = { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 };
  }
  post.metrics[metricKey] = Number(target.value || 0);
  saveState();
  renderKpi();
  generateWeeklyReport();
}

function exportPostsCsv(posts) {
  const headers = [
    "id",
    "date",
    "type",
    "week",
    "status",
    "title",
    "script",
    "cta",
    "link",
    "trigger_tags",
    "reach",
    "saves",
    "dms",
    "clicks",
    "orders"
  ];
  const rows = posts.map((item) => {
    const metrics = item.metrics || {};
    return [
      csvCell(item.id ?? ""),
      csvCell(item.date ?? ""),
      csvCell(item.type ?? ""),
      csvCell(item.week ?? ""),
      csvCell(item.status ?? ""),
      csvCell(item.title ?? ""),
      csvCell(item.script ?? ""),
      csvCell(item.cta ?? ""),
      csvCell(item.link ?? ""),
      csvCell((item.triggerTags || []).join("|")),
      csvCell(metrics.reach ?? 0),
      csvCell(metrics.saves ?? 0),
      csvCell(metrics.dms ?? 0),
      csvCell(metrics.clicks ?? 0),
      csvCell(metrics.orders ?? 0)
    ];
  });
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  downloadCsv("posts_export.csv", csv);
}

function exportProductsCsv(products) {
  const headers = ["id", "name", "price", "size", "material", "selling", "photo_name", "link", "scene"];
  const rows = products.map((item) => [
    csvCell(item.id ?? ""),
    csvCell(item.name ?? ""),
    csvCell(item.price ?? ""),
    csvCell(item.size ?? ""),
    csvCell(item.material ?? ""),
    csvCell(item.selling ?? ""),
    csvCell(item.photoName ?? ""),
    csvCell(item.link ?? ""),
    csvCell(item.scene ?? "")
  ]);
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  downloadCsv("products_export.csv", csv);
}

function importPostsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return;
  }

  const header = rows[0];
  const map = indexMap(header);
  const nextPosts = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim().length > 0))
    .map((row) => {
      return {
        id: pick(row, map, ["id"]) || createId("p"),
        date: pick(row, map, ["date", "日期"]) || "",
        type: pick(row, map, ["type", "格式"]) || "reels",
        week: pick(row, map, ["week", "檔期"]) || "W1",
        status: pick(row, map, ["status", "狀態"]) || "草稿",
        title: pick(row, map, ["title", "標題"]) || "",
        script: pick(row, map, ["script", "腳本摘要"]) || "",
        cta: pick(row, map, ["cta", "CTA"]) || "",
        triggerTags: parseTagInput(pick(row, map, ["trigger_tags", "觸發標籤"]) || ""),
        link:
          toCanonicalShopeeLink(pick(row, map, ["link", "商品連結"])) ||
          pick(row, map, ["link", "商品連結"]) ||
          "",
        metrics: {
          reach: Number(pick(row, map, ["reach", "成效-觸及"]) || 0),
          saves: Number(pick(row, map, ["saves", "成效-收藏"]) || 0),
          dms: Number(pick(row, map, ["dms", "成效-私訊"]) || 0),
          clicks: Number(pick(row, map, ["clicks", "成效-點擊"]) || 0),
          orders: Number(pick(row, map, ["orders", "成效-下單"]) || 0)
        }
      };
    });

  state.posts = nextPosts.map((post) => normalizePost(post));
  syncDraftTitlesWithProducts(false);
  saveState();
  renderAll();
}

function importProductsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return;
  }

  const header = rows[0];
  const map = indexMap(header);
  const nextProducts = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim().length > 0))
    .map((row) => {
      return {
        id: pick(row, map, ["id"]) || createId("g"),
        name: pick(row, map, ["name", "商品", "商品名稱"]) || "",
        price: Number(pick(row, map, ["price", "價格"]) || 0),
        size: pick(row, map, ["size", "尺寸"]) || "",
        material: pick(row, map, ["material", "材質/顏色", "材質"]) || "",
        selling: pick(row, map, ["selling", "賣點"]) || "",
        photoName: pick(row, map, ["photo_name", "photoName", "照片名稱", "主圖檔名"]) || "",
        link:
          toCanonicalShopeeLink(pick(row, map, ["link", "商品連結", "連結", "主圖"])) ||
          pick(row, map, ["link", "商品連結", "連結", "主圖"]) ||
          "",
        scene: pick(row, map, ["scene", "場景建議", "場景"]) || ""
      };
    });

  state.products = nextProducts;
  syncDraftTitlesWithProducts(false);
  saveState();
  renderAll();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === "\"") {
      if (inQuote && text[i + 1] === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }

    if (!inQuote && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuote && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function indexMap(headers) {
  const map = new Map();
  headers.forEach((name, index) => {
    map.set(String(name || "").replace(/^\uFEFF/, "").trim().toLowerCase(), index);
  });
  return map;
}

function pick(row, map, names) {
  for (const name of names) {
    const idx = map.get(String(name).trim().toLowerCase());
    if (typeof idx === "number") {
      return String(row[idx] || "").trim();
    }
  }
  return "";
}

function csvCell(value) {
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes("\"")) {
    return `"${stringValue.replaceAll("\"", "\"\"")}"`;
  }
  return stringValue;
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeDate(value) {
  const parts = String(value || "").split("/");
  if (parts.length !== 2) {
    return "99/99";
  }
  const month = parts[0].padStart(2, "0");
  const day = parts[1].padStart(2, "0");
  return `${month}/${day}`;
}

function createId(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function formatDateTime(isoText) {
  if (!isoText) {
    return "-";
  }
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) {
    return String(isoText);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatMetricCompact(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return "0";
  }
  if (number >= 1000) {
    const compact = Math.round((number / 1000) * 10) / 10;
    return `${compact}k`;
  }
  return String(number);
}

function getTodayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentWeekKey() {
  const day = new Date().getDate();
  if (day <= 7) {
    return "W1";
  }
  if (day <= 14) {
    return "W2";
  }
  if (day <= 21) {
    return "W3";
  }
  return "W4";
}

function getProductPhotoName(product) {
  if (product.photoName) {
    return product.photoName;
  }
  const productId = extractProductIdFromLink(product.link);
  if (productId) {
    return `product_${productId}.jpg`;
  }
  const safe = String(product.name || "product")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "");
  return `${safe || "product"}.jpg`;
}

function resolveProductImageSrc(product) {
  const raw = String(product.photoName || "").trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    return `assets/media/${raw}`;
  }

  const linkKey = toCanonicalShopeeLink(product.link || "");
  if (linkKey) {
    const byLink = productCoverMap.get(`link:${linkKey}`);
    if (byLink) {
      return byLink;
    }
    queueProductCoverLookup(linkKey);
  }

  const pid = extractProductIdFromLink(product.link || "");
  if (pid) {
    const byId = productCoverMap.get(`id:${pid}`);
    if (byId) {
      return byId;
    }
  }

  const fallback = getProductPhotoName(product);
  if (!fallback) {
    return "";
  }
  return `assets/media/${fallback}`;
}

function queueProductCoverLookup(link) {
  const normalizedLink = toCanonicalShopeeLink(link || "") || String(link || "").trim();
  if (!normalizedLink) {
    return;
  }
  const retryAt = Number(productCoverLookupRetryAt.get(normalizedLink) || 0);
  if (retryAt > Date.now()) {
    return;
  }
  if (productCoverLookupInFlight.has(normalizedLink)) {
    return;
  }
  productCoverLookupInFlight.add(normalizedLink);
  lookupProductCoverByLink(normalizedLink)
    .then((imageUrl) => {
      if (!imageUrl) {
        productCoverLookupRetryAt.set(normalizedLink, Date.now() + 60 * 1000);
        return;
      }
      productCoverMap.set(`link:${normalizedLink}`, imageUrl);
      const pid = extractProductIdFromLink(normalizedLink);
      if (pid) {
        productCoverMap.set(`id:${pid}`, imageUrl);
      }
      saveProductCoverCache();
      renderWeeklyProducts();
      renderProductsTable();
    })
    .catch(() => {
      productCoverLookupRetryAt.set(normalizedLink, Date.now() + 60 * 1000);
    })
    .finally(() => {
      productCoverLookupInFlight.delete(normalizedLink);
    });
}

async function lookupProductCoverByLink(link) {
  const apiBase = resolveBrandStrategyApiBase();
  const response = await fetch(`${apiBase}/api/product-preview?url=${encodeURIComponent(link)}`);
  if (!response.ok) {
    return "";
  }
  const payload = await response.json().catch(() => ({}));
  return String(payload?.item?.imageUrl || "").trim();
}

function loadProductCoverCache() {
  try {
    const raw = localStorage.getItem(PRODUCT_COVER_CACHE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    Object.entries(parsed).forEach(([key, value]) => {
      const cacheKey = String(key || "").trim();
      const cacheVal = String(value || "").trim();
      if (cacheKey && cacheVal) {
        productCoverMap.set(cacheKey, cacheVal);
      }
    });
  } catch (_error) {
  }
}

function saveProductCoverCache() {
  try {
    const payload = Object.fromEntries(productCoverMap.entries());
    localStorage.setItem(PRODUCT_COVER_CACHE_KEY, JSON.stringify(payload));
  } catch (_error) {
  }
}

function extractProductIdFromLink(link) {
  const text = String(link || "");
  const match = text.match(/\/product\/\d+\/(\d+)/i) || text.match(/\/i\.\d+\.(\d+)/i);
  return match ? match[1] : "";
}
