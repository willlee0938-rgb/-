# Inventory + Image Integration Spec

## Goal
合作車行提供網址 / API / JSON / CSV / 原始碼後，將 100~150 台車同步到 DriveOS。

## Confirmed source status — 2026-10-19

車源尚未取得；使用者決定先保留匯入接點。資料格式、來源網址、更新頻率與車行認證方式均待實際資料確認。目前未建立車行連線或可呼叫的匯入 API。

後續採來源轉接器：車行 API、JSON 或 CSV → 欄位正規化與預覽 → 確認後 upsert 車源。來源格式不影響廣告、客戶與轉介模組。

## Reserved import boundary

- `fetchVehicles()`：由來源轉接器取得使用者已授權的資料；本階段不預設或呼叫車行網址。
- `normalize()`：轉換為下方的標準車源欄位，保留原始來源 ID。
- 匯入預覽：列出新增、更新、狀態變更及無效資料；尚未完成的資料不進入廣告佇列。
- 匯入確認：只更新對應來源的車源，不覆蓋 CRM、既有貼文、轉介或佣金紀錄。
- 匯入錯誤：保留原庫存與錯誤紀錄，不把逾時、空回應或部分資料誤判成整批售出。
- 完整快照與增量更新須由來源明確區分；只有確認為完整快照時才能處理缺席車源，並保留歷史。

### Existing prototype field mapping

| 標準欄位 | 現有原型欄位／處理 |
| --- | --- |
| `source` + `externalId` | 車行來源唯一鍵，對應穩定的本機 `id`，保留客戶與貼文的車源關聯 |
| `mileageKm` | `mileage`，單位為公里 |
| `price` | `price`，單位為新台幣元，缺值不得當成零元優惠 |
| `available` | `可售` |
| `pending` / 未知狀態 | `待確認`，不產生新廣告 |
| `sold` | `已售出` |
| `hidden` / `reserved` | `暫停刊登`，保留標準來源狀態供未來同步使用 |
| `images[]` | 主圖對應 `image`；多圖與來源資訊須保留供正式圖庫使用 |

現有「匯入 JSON 備份」會取代整份瀏覽器資料，是備份還原功能，不能當作車行庫存匯入接點。`sample-inventory.json` 是未來來源介面的示範資料，尚不能用備份還原按鈕直接匯入。

## Preferred order
1. 官方 / 私有 API（最佳）
2. JSON feed
3. CSV / Google Sheet export
4. 已授權的網站資料介面
5. HTML parsing only when explicitly permitted and technically necessary

## Sync behavior
- `externalId` 作為來源唯一鍵。
- Upsert vehicle by `(source, externalId)`.
- 每次同步更新價格、里程、狀態、規格與圖片。
- 來源消失的車不能直接 hard-delete；先標記 `hidden` / `sold`，保留歷史。
- 已售車停止進入新廣告生成佇列。
- 記錄 `lastSyncedAt` 與 sync log。

## Image sync
來源若提供：
- `image`
- `imageUrl`
- `images[]`
- gallery urls

均正規化為 `VehicleImage[]`。

每台車：
- 至少 1 張 cover
- 支援多圖 gallery
- 優先保存 source URL；正式版可 server-side 下載至 Cloudinary / S3，避免 hotlink 不穩。
- 不應把大量 base64 圖片存進資料庫。
- 圖片失效要顯示 placeholder，不應破版。

## Example normalized payload
```json
{
  "externalId": "KYLE-2026-00123",
  "brand": "Toyota",
  "model": "Corolla Altis",
  "year": 2020,
  "mileageKm": 58000,
  "price": 458000,
  "status": "available",
  "sourceUrl": "https://example.com/car/123",
  "images": [
    {"url":"https://example.com/123/1.jpg","position":1,"type":"cover"},
    {"url":"https://example.com/123/2.jpg","position":2,"type":"interior"}
  ]
}
```

## Adapter contract suggestion
```ts
interface InventoryAdapter {
  fetchVehicles(): Promise<ExternalVehicle[]>;
  normalize(input: ExternalVehicle): NormalizedVehicle;
}
```

Implement provider-specific adapters, keeping DriveOS domain models independent from the dealer's source structure.
