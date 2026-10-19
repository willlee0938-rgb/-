# Codex Handoff — DriveOS

## 專案目標
將目前 `index.html` 的 DriveOS 原型升級為正式可部署的「AI 中古車銷售營運系統」。

核心工作流：
1. 合作車行約 100~150 台庫存同步進 DriveOS。
2. 每台車同步主圖與多張實車照片。
3. 每台車依真實資料自動產生廣告文案草稿。
4. 使用者人工審核 / 修改 / 核准。
5. 核准後可複製、排程；若平台官方 API 與權限允許，再發布至 Facebook / Threads。
6. 客戶詢問進 CRM，追蹤需求、賞車、轉介、成交、佣金。
7. 累積數據後產生來源、車款、貼文、轉換率與佣金分析。

## 目前程式
- `index.html`：可獨立運行的 V3 原型。
- 使用 localStorage。
- 目前沒有 build system / backend / DB。

## 建議正式技術架構
可自行調整，但建議：
- Frontend：Next.js / React + TypeScript
- UI：Tailwind CSS + component library
- Backend：Next.js Route Handlers / Node service
- DB：PostgreSQL + Prisma
- Auth：Auth.js / Clerk / Supabase Auth（三選一即可）
- Image：Cloudinary / S3-compatible object storage
- Jobs：Cron / queue，用於庫存同步與文案批次生成
- AI：可抽象為 `CopyGenerator` service，避免綁死單一模型供應商

## 頁面 / 模組
### 1. Dashboard
- 今日新客戶
- 待跟進
- 可售車數
- 已售 / 下架
- 待審核廣告
- 本月成交
- 預估 / 已入帳佣金
- FB / Threads 詢問來源

### 2. Inventory
- Grid + list view
- 主圖必顯示
- 多圖 gallery
- 品牌 / 車型 / 年份 / 價格 / 里程 / 庫存狀態篩選
- 車源詳細頁
- 同步來源與最後同步時間
- 已售出自動停止產生新廣告

### 3. AI Ad Studio
- 車源選擇
- 產生多種文案版本
- Facebook 社團版
- Threads 版
- 短版 / 資訊完整版 / 互動型
- 狀態：draft / review / approved / scheduled / published / rejected
- 人工修改與版本歷史
- 一鍵複製
- 圖片選擇

### 4. CRM
- 客戶基本資料
- 來源：FB 社團 / FB 個人 / Threads / 朋友介紹 / 其他
- 預算、用途、偏好品牌車款、付款方式、購車時間
- pipeline stages
- 每次聯絡紀錄
- 關聯推薦車源
- 轉介車行與負責主管

### 5. Referral / Commission
- 客戶 → 車源 → 現場人員
- 賞車時間
- 成交狀態
- 成交金額
- 預計佣金
- 確認佣金
- 入帳日期

### 6. Analytics
- Lead source conversion
- 車款詢問熱度
- 貼文 → 詢問 → 賞車 → 成交 funnel
- 平台成效
- 每車文案表現
- 月 / 季佣金
- 未來加入 AI insights，但須清楚標示推論與事實數據

### 7. Integrations
- 合作車行 data source
- Facebook / Threads 授權狀態
- AI provider
- Image storage
- Sync logs

## UX 方向
- 繁體中文 zh-TW
- 專業但有精神：白底 + cobalt blue / teal accents
- 桌機為主、手機可用
- 車源管理必須「圖片優先」
- 使用者不是汽車專家，因此 UI 要讓規格、照片與狀態一眼可懂

## 開發優先級
P0：先重構架構 + DB schema + inventory sync abstraction + image gallery
P1：AI 文案草稿與人工審核工作台
P2：CRM / referral / commission 正式化
P3：analytics
P4：平台官方發布 integration（僅支援平台允許功能）

## 不要做
- 不要捏造車況 / 保固 / 事故 / 貸款條件。
- 不要用未授權 scraping 偷取私人資料。
- 不要實作繞過 Facebook / Threads API 或社團規則的 bot。
- 不要把 API key 寫入前端或 repo。
