# Google Sheets Dashboard Formula Pack

## 建議工作表
- `Posts`（已匯入）
- `Products`（已匯入）
- `Templates`（已匯入）
- `Assets`（已匯入）
- `Dashboard`（新建）

## Dashboard 欄位配置
在 `Dashboard` 工作表放以下標題：
- A1: `指標`
- B1: `數值`

## KPI 公式（直接貼）
- A2: `總貼文數`  / B2: `=COUNTA(Posts!A2:A)`
- A3: `已發佈`    / B3: `=COUNTIF(Posts!J2:J,"已發佈")`
- A4: `待上架`    / B4: `=COUNTIF(Posts!J2:J,"待上架")`
- A5: `待拍`      / B5: `=COUNTIF(Posts!J2:J,"待拍")`
- A6: `草稿`      / B6: `=COUNTIF(Posts!J2:J,"草稿")`
- A7: `總觸及`    / B7: `=SUM(Posts!L2:L)`
- A8: `總互動`    / B8: `=SUM(Posts!M2:M)`
- A9: `總追蹤`    / B9: `=SUM(Posts!N2:N)`

## 本週待上架清單
在 `Dashboard!D1` 開始建立表格：
- D1: `本週待上架`
- D2 公式：
`=FILTER({Posts!A2:A,Posts!D2:D,Posts!J2:J,Posts!K2:K},(Posts!J2:J="待上架")+(Posts!J2:J="待拍"))`

## 本週已發佈清單
在 `Dashboard!I1` 開始建立表格：
- I1: `本週已發佈`
- I2 公式：
`=FILTER({Posts!A2:A,Posts!D2:D,Posts!J2:J,Posts!K2:K},Posts!J2:J="已發佈")`

## 排序建議
在 `Posts` 工作表套用篩選並按 `發布時間(K欄)` 升冪排序，日常操作更直覺。
