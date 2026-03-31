export function buildDailyWorkspacePayload({ posts, products, alerts }) {
  const pendingPosts = posts.filter((item) => !isPublishedPostStatus(item.status));
  const missingLinkProducts = products.filter((item) => !String(item.link || "").trim());
  const activeAlerts = Array.isArray(alerts?.items) ? alerts.items : [];

  const tasks = [];
  if (pendingPosts.length > 0) {
    const first = pendingPosts[0];
    tasks.push({
      id: `task_post_${first.id}`,
      type: "post",
      priority: "high",
      title: "優先完成待執行貼文",
      hint: first.title || first.id,
      resourceId: first.id
    });
  }
  if (missingLinkProducts.length > 0) {
    const first = missingLinkProducts[0];
    tasks.push({
      id: `task_product_${first.id}`,
      type: "product",
      priority: "medium",
      title: "補上商品連結以提升轉換",
      hint: first.name || first.id,
      resourceId: first.id
    });
  }
  if (activeAlerts.length > 0) {
    const first = activeAlerts[0];
    tasks.push({
      id: `task_alert_${first.id}`,
      type: "alert",
      priority: "high",
      title: "處理最新 KPI 異常告警",
      hint: first.message || `${first.metricKey || "metric"} 告警`,
      resourceId: first.id
    });
  }
  if (posts.length === 0) {
    tasks.push({
      id: "task_bootstrap_posts",
      type: "bootstrap",
      priority: "high",
      title: "建立本週第一篇貼文草稿",
      hint: "建議先套用模板快速起步",
      resourceId: ""
    });
  }
  if (products.length === 0) {
    tasks.push({
      id: "task_bootstrap_products",
      type: "bootstrap",
      priority: "medium",
      title: "建立第一批商品資料",
      hint: "可從 CSV 匯入或手動新增",
      resourceId: ""
    });
  }

  return {
    summary: {
      totalPosts: posts.length,
      pendingPosts: pendingPosts.length,
      totalProducts: products.length,
      alertCount: activeAlerts.length,
      generatedAt: new Date().toISOString()
    },
    tasks: tasks.slice(0, 5)
  };
}

function isPublishedPostStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "已發佈" || normalized === "published";
}
