# Google Sheets 免費營運方案（取代 Airtable）

## 為什麼改這個方案
- 0 成本：Google Sheets 基本使用免費
- 上手快：不需要重新學資料庫工具
- 可延續現有流程：沿用既有 CSV、排程、預檢腳本

## 建議結論
- 你目前階段（0->1、先衝內容產能）用 **Google Sheets** 最划算
- 不建議現在自建完整後台（開發與維護成本高，會拖慢發佈節奏）

## 一鍵匯入（最推薦）
- 先把 `assets/google_sheets/IG_Content_Ops_import.xlsx` 上傳到 Google Drive。
- 在 Drive 對該檔案按右鍵 -> 「開啟方式」->「Google 試算表」。
- 這樣會保留 4 個工作表：`Posts`、`Products`、`Templates`、`Assets`。

> 注意：若在「既有試算表」裡用「檔案 -> 匯入」匯入 xlsx，通常只會匯入第一個工作表（你遇到的狀況）。

## Step 1 建立 Google 試算表
1. 建立新試算表，命名：`IG Content Ops`
2. 建立 4 個工作表：`Posts`、`Products`、`Templates`、`Assets`

## Step 2 匯入基礎資料
- 在各工作表使用「檔案 -> 匯入 -> 上傳」，分別匯入：
  - `assets/google_sheets/posts_import.csv`
  - `assets/google_sheets/products_import.csv`
  - `assets/google_sheets/templates_import.csv`
  - `assets/google_sheets/assets_import.csv`
- 匯入選項：**取代目前工作表**

## Step 3 套用每週排程
- 依 `assets/week1-posts.csv`、`assets/week2-posts.csv` 更新 `Posts` 的：
  - `主題`
  - `發布時間`
  - `狀態`
  - `CTA`

## Step 4 發佈執行
- 依 `Posts` 的 `發布時間` 到 IG 發佈工具（Meta Business Suite / Buffer / Later）排程
- 發佈完成即把 `狀態` 改為 `已發佈`

## Step 5 每週回填
- 每週五回填 `Posts` 成效欄位：`成效-觸及`、`成效-互動`、`成效-追蹤`
- 找出高表現題材，下週複製題型換商品
