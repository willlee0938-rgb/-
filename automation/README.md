# Carman 自動化模組｜用老闆看得懂的方式說明

已把**每三小時巡檢庫存 → 匯入車源 → 補齊每車四篇 GPT 草稿**的後端程式放入原本 GitHub。

## 目前完成

- 廣告工廠：一車一列、圖片縮圖、照片數、四個文案版本（FB A/B + Threads A/B）。
- 支援授權 HTTPS JSON 來源（JSON 清單、`vehicles` 或 `items`），以原有車源 ID 合併，不動 CRM／佣金。
- 偵測新進、改價、售出、圖片變更；已售車不產生新廣告、價變時舊稿需重審。
- 自動生成四篇不同角度文案的 OpenAI API 程式（尚未用正式 API 驗收）。
- GitHub Actions 每三小時執行一次，**預設停用**，即使執行也絕不自動對 Threads 或 Facebook 發文。
- 每次預設只處理 20 台待補稿車（避免一次處理 150 台造成不預期花費）；其餘下次繼續，或授權後調整。
- 有內容長度、不實保證關鍵字、資料完整性、雲端版本衝突、空來源、異常庫存縮減檢查。
- 買賣線索、既有發文歷史與資料庫登入保留。

## 現在還缺的「接線條件」

這幾項**目前沒有啟用**，不用在聊天室貼任何帳密：

1. 楊哥授權的**資料來源**（例如 HTTPS JSON API；若是 Drive、資料夾、照片需登入的網站，需要另外加該來源轉換器）。
2. 雲端後端用的 **Supabase Secret Key** 和已登入的工作台 Owner UUID（用 GitHub Repository Secrets 管理，不可放在公開程式）。
3. **OpenAI API 金鑰**（與 ChatGPT Plus 不同，API 另計費）。
4. 初次拿 5 台真實車測試，確認可售、下架、價格、照片都能對應，再把 GitHub Repository Variable `CARMAN_AUTOMATION_ENABLED` 設成 `true`。

## GitHub 設定（之後啟動時用）

打開原專案 → **Settings → Secrets and variables → Actions**。

**Secrets（敏感值）：**
- `SUPABASE_SECRET_KEY` — 僅限伺服器的金鑰（使用 Supabase 新型 `sb_secret_` Key）。
- `DRIVEOS_OWNER_ID` — 工作台登入者的 UUID。
- `DEALER_FEED_URL` — 楊哥授權的資料 API 網址。
- `DEALER_FEED_TOKEN` — 如果對方提供的 API 需要存取 Token。
- `OPENAI_API_KEY` — OpenAI API 金鑰。

**Variables（不敏感設定）：**
- `SUPABASE_URL` — Supabase Project URL。
- `DEALER_SOURCE_NAME` — 預設「凱爾車業」。
- `DEALER_FULL_SNAPSHOT` — 只有楊哥明確說每次回傳**完整所有車源**，才設 `true`。不確定維持 `false`。
- `MAX_CARS_PER_RUN` — 預設 20，經成本測試後可調整為 150。
- `OPENAI_MODEL` — 預設 `gpt-4.1-mini`。
- `CARMAN_AUTOMATION_ENABLED` — **預設不設定**；正式驗收通過後再設 `true`。

## 重要限制

- 排程是三小時**輪詢**，不是保證車商更新後瞬間同步；GitHub Actions 可能延遲。
- 需照片能合法讀取；若楊哥的照片要求登入或短效簽章，需要先做照片授權代理，不可直接以不安全網址公開。
- 圖片看得見不代表車況確定，所有車況保證仍需車商證據與人審。
- 目前只有自動化**程式及安全閘門**；真實資料庫、GPT API、照片與正式雲端更新尚待串接驗收。
- 不會自動發 Threads／FB，也不會自動把聯絡資料轉交車商。
- 若是公開 GitHub 儲存庫，**絕不可提交客戶資料或私有圖片**。這個排程只讀取安全的環境變數，程式碼中不含任何密鑰。

## 專案主要檔案

- `automation/core.mjs`：合併庫存、檢測異動、生成廣告資料。
- `automation/runner.mjs`：受授權才呼叫 Supabase／OpenAI。
- `automation/core.test.mjs`：基本自動測試。
- `.github/workflows/carman-inventory.yml`：每三小時排程（未開啟不動資料）。
- `ad-factory-ui.js`：你每天查看的廣告工廠。

整體目標仍是：**老闆只管「車源管理」與「廣告工廠」，其他重複工作自動執行**。
