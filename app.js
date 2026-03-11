const STORAGE_KEY = "ig_ops_frontend_v2";
const INITIAL_POSTS_CSV_PATH = "assets/google_sheets/posts_import.csv";
const INITIAL_PRODUCTS_CSV_PATH = "assets/google_sheets/products_import.csv";
const PRODUCT_COVERS_JSON_PATH = "assets/product_covers.json";
const SHOPEE_SHOP_ID = "179481064";
const STATUS_ORDER = ["草稿", "待拍", "待上架", "已發佈"];
const LEGACY_PRODUCT_TERMS = ["超薄鞋櫃", "翻斗鞋櫃", "羊羔絨椅", "泰迪熊羊羔絨椅"];
const DAILY_SOP_ITEMS = [
  "更新今天要發布的貼文狀態（至少 1 篇往前推進）",
  "回填昨天貼文成效（觸及/收藏/私訊/點擊/下單）",
  "處理新 DM 並把 thread 階段推進到 qualified 或 offer_sent",
  "至少完成 1 組 A/B 的比分更新或勝出判定",
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
const state = loadState();
const productCoverMap = new Map();

const refs = {
  kpiGrid: document.getElementById("kpi-grid"),
  weeklyProductsTitle: document.getElementById("weekly-products-title"),
  weeklyProducts: document.getElementById("weekly-products"),
  kanban: document.getElementById("kanban"),
  postsTbody: document.getElementById("posts-tbody"),
  productsTbody: document.getElementById("products-tbody"),
  filterWeek: document.getElementById("filter-week"),
  filterType: document.getElementById("filter-type"),
  filterStatus: document.getElementById("filter-status"),
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
  postVariantA: document.getElementById("post-variant-a"),
  postVariantB: document.getElementById("post-variant-b"),
  copyCaptionBtn: document.getElementById("copy-caption-btn"),
  copyImagePromptBtn: document.getElementById("copy-image-prompt-btn"),
  copyVariantABtn: document.getElementById("copy-variant-a-btn"),
  copyVariantBBtn: document.getElementById("copy-variant-b-btn"),
  experimentDialog: document.getElementById("experiment-dialog"),
  experimentForm: document.getElementById("experiment-form"),
  expPostId: document.getElementById("exp-post-id"),
  expPostTitle: document.getElementById("exp-post-title"),
  expHypothesis: document.getElementById("exp-hypothesis"),
  expVariantA: document.getElementById("exp-variant-a"),
  expVariantB: document.getElementById("exp-variant-b"),
  expScoreA: document.getElementById("exp-score-a"),
  expScoreB: document.getElementById("exp-score-b"),
  expWinner: document.getElementById("exp-winner"),
  expAutoPick: document.getElementById("exp-auto-pick"),
  expCancel: document.getElementById("exp-cancel"),
  dmPostSelect: document.getElementById("dm-post-select"),
  dmIntentSelect: document.getElementById("dm-intent-select"),
  dmUserQuestion: document.getElementById("dm-user-question"),
  dmGenerateBtn: document.getElementById("dm-generate-btn"),
  dmCopyBtn: document.getElementById("dm-copy-btn"),
  dmScriptOutput: document.getElementById("dm-script-output"),
  dmThreadsTbody: document.getElementById("dm-threads-tbody"),
  weeklyReportBtn: document.getElementById("weekly-report-btn"),
  weeklyReportCopyBtn: document.getElementById("weekly-report-copy-btn"),
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

bindEvents();
syncDraftTitlesWithProducts(true);
renderAll();
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
  refs.copyVariantABtn.addEventListener("click", () => copyTextFromField(refs.postVariantA));
  refs.copyVariantBBtn.addEventListener("click", () => copyTextFromField(refs.postVariantB));
  refs.experimentForm.addEventListener("submit", onSubmitExperiment);
  refs.expAutoPick.addEventListener("click", autoPickExperimentWinner);
  refs.expCancel.addEventListener("click", () => refs.experimentDialog.close());
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

  refs.filterWeek.addEventListener("change", renderPostsTable);
  refs.filterType.addEventListener("change", renderPostsTable);
  refs.filterStatus.addEventListener("change", renderPostsTable);

  refs.exportPostsBtn.addEventListener("click", () => exportPostsCsv(state.posts));
  refs.exportProductsBtn.addEventListener("click", () => exportProductsCsv(state.products));

  refs.importPostsInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    importPostsCsv(text);
    refs.importPostsInput.value = "";
  });

  refs.importProductsInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    importProductsCsv(text);
    refs.importProductsInput.value = "";
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        posts: [...seedPosts].map((post) => normalizePost(post)),
        products: [...seedProducts],
        dmThreads: [],
        sopDaily: {}
      };
    }
    const parsed = JSON.parse(raw);
    return {
      posts: Array.isArray(parsed.posts) ? parsed.posts.map((post) => normalizePost(post)) : [...seedPosts].map((post) => normalizePost(post)),
      products: Array.isArray(parsed.products) ? parsed.products : [...seedProducts],
      dmThreads: Array.isArray(parsed.dmThreads) ? parsed.dmThreads : [],
      sopDaily: parsed.sopDaily && typeof parsed.sopDaily === "object" ? parsed.sopDaily : {}
    };
  } catch (_error) {
    return {
      posts: [...seedPosts].map((post) => normalizePost(post)),
      products: [...seedProducts],
      dmThreads: [],
      sopDaily: {}
    };
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      posts: state.posts,
      products: state.products,
      dmThreads: state.dmThreads,
      sopDaily: state.sopDaily
    })
  );
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
    renderWeeklyProducts();
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

function summarizeAbTests() {
  return state.posts.reduce(
    (acc, post) => {
      const winner = post.abTest?.winner || "pending";
      if (post.abTest) {
        acc.total += 1;
      }
      if (winner === "A" || winner === "B") {
        acc.finished += 1;
      }
      if (winner === "A") {
        acc.aWins += 1;
      }
      return acc;
    },
    { total: 0, finished: 0, aWins: 0 }
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
    },
    abTest: {
      hypothesis: safe.abTest?.hypothesis || "",
      variantA: safe.abTest?.variantA || "",
      variantB: safe.abTest?.variantB || "",
      scoreA: Number(safe.abTest?.scoreA || 0),
      scoreB: Number(safe.abTest?.scoreB || 0),
      winner: safe.abTest?.winner || "pending"
    }
  };
}

function renderAll() {
  renderKpi();
  renderWeeklyProducts();
  renderKanban();
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
  const abStats = summarizeAbTests();
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
    { label: "A/B 完成", value: `${abStats.finished}/${abStats.total}` },
    { label: "A 勝率", value: ratioText(abStats.aWins, abStats.finished) },
    { label: "DM 成交率", value: ratioText(dmStats.closed, dmStats.qualified || dmStats.total) }
  ];

  refs.kpiGrid.innerHTML = cards
    .map((card) => {
      return `<article class="kpi-card"><p class="kpi-label">${escapeHtml(card.label)}</p><p class="kpi-value">${escapeHtml(card.value)}</p></article>`;
    })
    .join("");
}

function renderKanban() {
  const columns = STATUS_ORDER.map((status) => {
    const items = state.posts.filter((post) => post.status === status);
    const itemHtml = items
      .map((post) => {
        const product = findProductByLink(post.link);
        const title = buildLinkedTitle(post, product);
        return `<div class="k-item"><strong>${escapeHtml(post.date)}</strong> ${escapeHtml(title)}</div>`;
      })
      .join("");
    return `<section class="k-col"><h3 class="k-title">${escapeHtml(status)} (${items.length})</h3>${itemHtml || "<p class='k-title'>暫無內容</p>"}</section>`;
  });
  refs.kanban.innerHTML = columns.join("");
}

function renderWeeklyProducts() {
  const week = getCurrentWeekKey();
  refs.weeklyProductsTitle.textContent = `本週主推商品（${week}）`;

  const links = [...new Set(
    state.posts
      .filter((post) => post.week === week)
      .map((post) => toCanonicalShopeeLink(post.link) || post.link)
      .filter(Boolean)
  )];

  const cards = links
    .map((link) => {
      const product = state.products.find((item) => (toCanonicalShopeeLink(item.link) || item.link) === link);
      if (!product) {
        return null;
      }
      const photoName = getProductPhotoName(product);
      const imageSrc = resolveProductImageSrc(product);
      return `
        <article class="w-product">
          ${imageSrc ? `<img src="${escapeAttribute(imageSrc)}" alt="${escapeAttribute(product.name || "商品圖片")}" loading="lazy" />` : ""}
          <h4>${escapeHtml(product.name || "未命名商品")}</h4>
          <p>照片名稱：${escapeHtml(photoName)}</p>
          <p>價格：NT$${escapeHtml(String(product.price || 0))}</p>
          <p><a href="${escapeAttribute(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a></p>
        </article>
      `;
    })
    .filter(Boolean);

  refs.weeklyProducts.innerHTML = cards.length > 0 ? cards.join("") : '<article class="w-product"><p>本週尚無已綁定商品的貼文。</p></article>';
}

function renderPostsTable() {
  const week = refs.filterWeek.value;
  const type = refs.filterType.value;
  const status = refs.filterStatus.value;

  const rows = state.posts
    .filter((post) => (week === "all" ? true : post.week === week))
    .filter((post) => (type === "all" ? true : post.type === type))
    .filter((post) => (status === "all" ? true : post.status === status))
    .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));

  refs.postsTbody.innerHTML = rows
    .map((post) => {
      const safeLink = post.link ? `<a href="${escapeAttribute(post.link)}" target="_blank" rel="noreferrer">商品頁</a>` : "-";
      const statusSelect =
        `<select data-action="set-status" data-id="${escapeAttribute(post.id)}">` +
        `${STATUS_ORDER.map((option) => `<option value="${option}" ${post.status === option ? "selected" : ""}>${option}</option>`).join("")}` +
        "</select>";
      const metrics = post.metrics || { reach: 0, saves: 0, dms: 0, clicks: 0, orders: 0 };
      const abTest = post.abTest || { winner: "pending" };
      const winnerLabel = abTest.winner === "A" || abTest.winner === "B" ? `Winner ${abTest.winner}` : "待判定";
      const metricsInputs = [
        `<label>觸及<input type="number" min="0" data-action="set-metric" data-metric="reach" data-id="${escapeAttribute(post.id)}" value="${escapeAttribute(String(metrics.reach || 0))}" /></label>`,
        `<label>收藏<input type="number" min="0" data-action="set-metric" data-metric="saves" data-id="${escapeAttribute(post.id)}" value="${escapeAttribute(String(metrics.saves || 0))}" /></label>`,
        `<label>私訊<input type="number" min="0" data-action="set-metric" data-metric="dms" data-id="${escapeAttribute(post.id)}" value="${escapeAttribute(String(metrics.dms || 0))}" /></label>`,
        `<label>點擊<input type="number" min="0" data-action="set-metric" data-metric="clicks" data-id="${escapeAttribute(post.id)}" value="${escapeAttribute(String(metrics.clicks || 0))}" /></label>`,
        `<label>下單<input type="number" min="0" data-action="set-metric" data-metric="orders" data-id="${escapeAttribute(post.id)}" value="${escapeAttribute(String(metrics.orders || 0))}" /></label>`
      ].join(" ");

      return `
        <tr>
          <td>${escapeHtml(post.date)}</td>
          <td>${post.type === "reels" ? "Reels" : "Feed"}</td>
          <td>${escapeHtml(post.title)}</td>
          <td>${safeLink}</td>
          <td><span class="badge ${escapeAttribute(post.status)}">${escapeHtml(post.status)}</span><div>${statusSelect}</div></td>
          <td>${escapeHtml(post.cta || "-")}</td>
          <td><span class="ab-tag ${escapeAttribute(String(abTest.winner || "pending"))}">${escapeHtml(winnerLabel)}</span><div><button class="btn" type="button" data-action="open-experiment" data-id="${escapeAttribute(post.id)}">實驗</button></div></td>
          <td><div class="metric-grid">${metricsInputs}</div></td>
          <td>
            <div class="actions-inline">
              <button class="btn" type="button" data-action="edit-post" data-id="${escapeAttribute(post.id)}">編輯</button>
              <button class="btn" type="button" data-action="delete-post" data-id="${escapeAttribute(post.id)}">刪除</button>
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
      const safeLink = product.link ? `<a href="${escapeAttribute(product.link)}" target="_blank" rel="noreferrer">商品頁</a>` : "-";
      return `
        <tr>
          <td>${escapeHtml(product.name)}</td>
          <td>${escapeHtml(String(product.price || ""))}</td>
          <td>${escapeHtml(product.size || "-")}</td>
          <td>${escapeHtml(product.selling || "-")}</td>
          <td>${safeLink}</td>
          <td>
            <div class="actions-inline">
              <button class="btn" type="button" data-action="edit-product" data-id="${escapeAttribute(product.id)}">編輯</button>
              <button class="btn" type="button" data-action="delete-product" data-id="${escapeAttribute(product.id)}">刪除</button>
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
    },
    abTest: existing?.abTest || {
      ...buildAbTestDraft(
        {
          title: refs.postTitle.value.trim(),
          script: refs.postScript.value.trim(),
          cta: refs.postCta.value.trim(),
          triggerTags: parseTagInput(refs.postTriggerTags.value)
        },
        findProductByLink(refs.postLink.value.trim())
      ),
      variantA: refs.postVariantA.value,
      variantB: refs.postVariantB.value
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

  const product = findProductByLink(draft.link);
  const abDraft = buildAbTestDraft(draft, product);
  refs.postAutoCaption.value = buildAutoCaption(draft, product);
  refs.postImagePrompt.value = buildImagePrompt(draft, product);
  refs.postVariantA.value = abDraft.variantA;
  refs.postVariantB.value = abDraft.variantB;
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

function buildAutoCaption(post, product) {
  const formatLabel = post.type === "feed" ? "Feed 輪播" : "Reels";
  const productLine = product
    ? `\n【商品資訊】\n- 品名：${product.name}\n- 價格：NT$${product.price || ""}\n- 尺寸：${product.size || "未填"}\n- 賣點：${product.selling || "未填"}`
    : "";
  const hashTags = "#小坪數家具 #租屋改造 #小戶型 #平價家具 #居家佈置";
  const action = post.cta || "私訊我拿清單";
  const triggerLine = (post.triggerTags || []).length > 0 ? `心理觸發：${post.triggerTags.join("、")}` : "";

  return [
    `【${formatLabel}｜${post.week || "W1"}】${post.title || "未命名貼文"}`,
    "",
    "你是不是也遇過空間太小、家具難選的問題？",
    `${post.script || "這支內容會示範實際擺放、尺寸重點、選購建議。"}`,
    productLine,
    "",
    triggerLine,
    `👉 ${action}`,
    post.link ? `商品連結：${toCanonicalShopeeLink(post.link) || post.link}` : "商品連結：待補",
    hashTags
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImagePrompt(post, product) {
  const requirements = splitScriptRequirements(post.script);
  const baseSubject = product
    ? `${product.name}，材質${product.material || "未指定"}，價格帶約 NT$${product.price || "1800-3800"}`
    : post.title || "小坪數家具";
  const scene = product?.scene || "3-5坪租屋套房";
  const typeStyle = post.type === "feed" ? "Instagram feed cover" : "Instagram reels cover";

  const blocks = requirements.map((requirement, index) => {
    return [
      `[Prompt ${index + 1}]`,
      `${typeStyle}, Taiwan small-apartment furniture lifestyle photo, ${baseSubject}.`,
      `Requirement focus: ${requirement}.`,
      `Scene: ${scene}, clean natural daylight, warm beige and wood tone palette, realistic modern renter home styling.`,
      "Composition: vertical 4:5, clear hero product in center, tidy background, no human face, no text watermark.",
      "Quality: high detail, photorealistic, soft shadow, e-commerce editorial style.",
      `Intent: highlight ${post.title || "small-space furniture solution"} for budget-friendly renters.`,
      "Negative prompt: blurry, low quality, deformed furniture, extra limbs, distorted perspective, watermark, text overlay."
    ].join(" ");
  });

  return blocks.join("\n\n");
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

function buildAbTestDraft(post, product) {
  const tags = Array.isArray(post.triggerTags) ? post.triggerTags : [];
  const firstStep = splitScriptRequirements(post.script)[0] || "空間痛點轉成可執行解法";
  const productName = product?.name || "這款小坪數家具";
  const price = product?.price ? `NT$${product.price}` : "1800-3800";

  return {
    hypothesis: "不同心理觸發會影響點擊與私訊率",
    variantA: `【快決策版】${post.title || productName}\n重點：${firstStep}\n價格帶：${price}\nCTA：${post.cta || "立即點連結看規格"}`,
    variantB: `【安心比較版】${post.title || productName}\n重點：先看尺寸/材質/使用情境，再做決定\n標籤：${tags.join("、") || "安心、證據"}\nCTA：${post.cta || "留言關鍵字拿配置建議"}`,
    scoreA: 0,
    scoreB: 0,
    winner: "pending"
  };
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

  if (action === "open-experiment") {
    openExperimentDialog(post);
    return;
  }

  if (action === "delete-post") {
    state.posts = state.posts.filter((item) => item.id !== id);
    saveState();
    renderAll();
  }
}

function openExperimentDialog(post) {
  const product = findProductByLink(post.link);
  const draft = post.abTest && post.abTest.variantA ? post.abTest : buildAbTestDraft(post, product);
  refs.expPostId.value = post.id;
  refs.expPostTitle.value = post.title || "";
  refs.expHypothesis.value = draft.hypothesis || "";
  refs.expVariantA.value = draft.variantA || "";
  refs.expVariantB.value = draft.variantB || "";
  refs.expScoreA.value = String(draft.scoreA || 0);
  refs.expScoreB.value = String(draft.scoreB || 0);
  refs.expWinner.value = draft.winner || "pending";
  refs.experimentDialog.showModal();
}

function autoPickExperimentWinner() {
  const scoreA = Number(refs.expScoreA.value || 0);
  const scoreB = Number(refs.expScoreB.value || 0);
  if (scoreA === scoreB) {
    refs.expWinner.value = "pending";
    return;
  }
  refs.expWinner.value = scoreA > scoreB ? "A" : "B";
}

function onSubmitExperiment(event) {
  event.preventDefault();
  const id = refs.expPostId.value;
  const post = state.posts.find((item) => item.id === id);
  if (!post) {
    refs.experimentDialog.close();
    return;
  }

  post.abTest = {
    hypothesis: refs.expHypothesis.value.trim(),
    variantA: refs.expVariantA.value,
    variantB: refs.expVariantB.value,
    scoreA: Number(refs.expScoreA.value || 0),
    scoreB: Number(refs.expScoreB.value || 0),
    winner: refs.expWinner.value
  };

  saveState();
  refs.experimentDialog.close();
  renderKpi();
  renderPostsTable();
  generateWeeklyReport();
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
    state.products = state.products.filter((item) => item.id !== id);
    saveState();
    renderAll();
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
  const abStats = summarizeAbTests();
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
    "【A/B 表現】",
    `- 完成實驗：${abStats.finished}/${abStats.total}`,
    `- A 勝率：${ratioText(abStats.aWins, abStats.finished)}`,
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
  renderWeeklyActions({ topPosts, triggerStats, intentStats });
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
  actions.push("每週至少做 1 組 A/B 測試，7 天後固定判定勝出並套用。", "每日更新 DM thread 階段，確保 qualified 名單 24 小時內回覆。", "持續回填 reach/click/order，避免下週策略失真。");

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
    "ab_winner",
    "ab_score_a",
    "ab_score_b",
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
      csvCell(item.abTest?.winner ?? "pending"),
      csvCell(item.abTest?.scoreA ?? 0),
      csvCell(item.abTest?.scoreB ?? 0),
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
        abTest: {
          hypothesis: pick(row, map, ["ab_hypothesis"]) || "",
          variantA: pick(row, map, ["ab_variant_a"]) || "",
          variantB: pick(row, map, ["ab_variant_b"]) || "",
          scoreA: Number(pick(row, map, ["ab_score_a"]) || 0),
          scoreB: Number(pick(row, map, ["ab_score_b"]) || 0),
          winner: pick(row, map, ["ab_winner"]) || "pending"
        },
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

function extractProductIdFromLink(link) {
  const text = String(link || "");
  const match = text.match(/\/product\/\d+\/(\d+)/i) || text.match(/\/i\.\d+\.(\d+)/i);
  return match ? match[1] : "";
}
