# Inventory + Image Integration Spec

## Goal
合作車行提供網址 / API / JSON / CSV / 原始碼後，將 100~150 台車同步到 DriveOS。

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
