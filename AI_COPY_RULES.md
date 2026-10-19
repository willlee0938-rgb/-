# AI Ad Copy Rules

## Objective
每台可售車可批次產生廣告草稿，但必須人工核准後才能進入發布佇列。

## Grounding
文案只可使用 Vehicle record 中實際存在的欄位。
禁止自行推測：
- 無事故
- 無泡水
- 無調表
- 原鈑件
- 一手車
- 保固內容
- 貸款過件
- 全額貸
- 最低月付
- 市場最低價
除非資料來源有明確欄位且可追溯。

## Default variants
### Facebook 社團版
- 第一行：車款 + 年份 + 售價核心資訊
- 3~6 個重點
- 車況不確定時使用「詳細車況可協助確認」
- CTA：私訊預算 / 用途 / 想看車時間
- 避免誇張或洗版式符號

### Threads 版
- 更像真人分享
- 不只硬廣告
- 可從「誰適合這台車」或使用情境切入
- 文字較短
- CTA 自然

### Short version
- 適合留言 / 回覆求車文
- 只放已確認資訊

## Review states
1. generated
2. needs_review
3. approved
4. scheduled
5. published
6. rejected

## Generation input snapshot
每次 AI 生成應保存當時使用的 vehicle data snapshot，避免車價變更後無法追溯舊文案是依哪個資料產生。

## Auto-publish guard
即使未來取得平台權限，也建議保留：
- 車輛仍為 available 才能發布
- 價格 / 狀態若自核准後變更，強制重新審核
- destination 必須在 allowlist
- 每日發布頻率可控
- 保存 publication log
