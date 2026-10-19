(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DriveOSInventory = factory();
})(globalThis, function () {
  'use strict';
  const aliases = {
    externalId: ['externalId', '車源編號', '車輛編號'], brand: ['brand', '品牌'], model: ['model', '車型'],
    year: ['year', '年份'], mileage: ['mileageKm', 'mileage', '里程公里', '里程（公里）'],
    price: ['price', '售價元', '售價（元）'], status: ['status', '狀態', '庫存狀態'],
    images: ['images', '照片網址'], image: ['image', 'imageUrl', '主圖網址'],
    notes: ['description', 'notes', '備註'], sourceUrl: ['sourceUrl', '來源網址']
  };
  const statuses = { available: '可售', pending: '待確認', sold: '已售出', hidden: '暫停刊登', reserved: '暫停刊登',
    可售: '可售', 待確認: '待確認', 已售出: '已售出', 暫停刊登: '暫停刊登' };
  function csv(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], cell = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') { quoted = false; closed = true; }
        else cell += char;
      } else if (char === '"') {
        if (cell || closed) throw new Error('CSV 引號格式不正確，請另存為 UTF-8 CSV。');
        quoted = true;
      } else if (char === ',') { row.push(cell); cell = ''; closed = false; }
      else if (char === '\r' || char === '\n') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); if (row.some(value => value.trim())) rows.push(row);
        row = []; cell = ''; closed = false;
      } else {
        if (closed && char.trim()) throw new Error('CSV 引號後包含多餘內容。');
        if (!closed) cell += char;
      }
    }
    if (quoted) throw new Error('CSV 有未關閉的引號。');
    row.push(cell); if (row.some(value => value.trim())) rows.push(row);
    if (rows.length < 2) throw new Error('CSV 需要標題列及至少一筆車源。');
    const headers = rows.shift().map(value => value.trim());
    if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('CSV 欄位名稱不可空白或重複。');
    return rows.map((values, i) => {
      if (values.length !== headers.length) throw new Error(`CSV 第 ${i + 2} 列欄位數量不符。`);
      return Object.fromEntries(headers.map((h, index) => [h, values[index]]));
    });
  }
  function parse(text, filename) {
    if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) throw new Error('檔案超過 5MB，請分批匯入。');
    let rows;
    if (/\.csv$/i.test(filename)) rows = csv(text);
    else if (/\.json$/i.test(filename)) {
      let data; try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { throw new Error('JSON 格式不正確。'); }
      rows = Array.isArray(data) ? data : data?.vehicles;
      if (!Array.isArray(rows)) throw new Error('車源 JSON 須為陣列或 {"vehicles": [...]}；整站備份請到設定頁還原。');
    } else throw new Error('請選 CSV 或 JSON；Excel 請先另存為 CSV UTF-8。');
    if (!rows.length || rows.length > 2000) throw new Error('每批須包含 1–2000 台車。');
    return rows;
  }
  const field = (row, name) => {
    const key = aliases[name].find(key => Object.hasOwn(row, key));
    return key === undefined ? undefined : row[key];
  };
  function number(value, label) {
    if (value == null || typeof value === 'boolean' || !String(value).trim()) throw new Error(`${label}不可空白。`);
    const raw = typeof value === 'number' ? String(value) : String(value).trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) throw new Error(`${label}須為數字（售價單位為元，里程為公里）。`);
    const n = Number(raw.replaceAll(',', ''));
    if (!Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER) throw new Error(`${label}超過範圍。`);
    return n;
  }
  function https(value, label) {
    let url; try { url = new URL(String(value)); } catch (_) { throw new Error(`${label}須為完整 HTTPS 網址。`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) throw new Error(`${label}須為不含帳密的 HTTPS 網址。`);
    return url.href;
  }
  function normalize(row, source) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('每筆車源須為物件。');
    const out = { source };
    for (const key of ['externalId', 'brand', 'model']) {
      const value = field(row, key);
      if (!['string', 'number'].includes(typeof value) || !String(value).trim() || String(value).length > 150) throw new Error(`${{ externalId: '車源編號', brand: '品牌', model: '車型' }[key]}不可空白或超過 150 字。`);
      out[key] = String(value).trim();
    }
    out.year = number(field(row, 'year'), '年份');
    if (!Number.isInteger(out.year) || out.year < 1900 || out.year > new Date().getFullYear() + 1) throw new Error('年份不在合理範圍。');
    out.mileage = number(field(row, 'mileage'), '里程'); out.price = number(field(row, 'price'), '售價');
    if (out.price <= 0) throw new Error('售價須大於零。');
    const rawStatus = String(field(row, 'status') ?? '').trim();
    out.status = statuses[rawStatus] || '待確認'; out.sourceStatus = rawStatus;
    const warnings = statuses[rawStatus] ? [] : ['庫存狀態未提供或無法辨識，設為待確認，不進入新廣告。'];
    let images = field(row, 'images');
    const image = field(row, 'image');
    if (images !== undefined || image !== undefined) {
      if (typeof images === 'string') images = images.trim() ? images.split('|').map(s => s.trim()) : [];
      if (images == null) images = image ? [image] : [];
      if (!Array.isArray(images) || images.length > 20) throw new Error('每台車照片須為清單，最多 20 張。');
      out.images = images.map((item, i) => ({ url: https(typeof item === 'string' ? item : item?.url, '照片'), position: i + 1, type: i === 0 ? 'cover' : 'other' }));
      out.image = out.images[0]?.url || '';
    }
    if (!out.images?.length) warnings.push('未提供照片；更新時若省略照片欄位，會保留原照片。');
    const notes = field(row, 'notes');
    if (notes !== undefined) {
      if (typeof notes !== 'string' || notes.length > 5000) throw new Error('備註須為文字，最多 5000 字。');
      out.notes = notes;
    }
    const sourceUrl = field(row, 'sourceUrl');
    if (sourceUrl !== undefined) out.sourceUrl = sourceUrl ? https(sourceUrl, '來源連結') : '';
    return { vehicle: out, warnings };
  }
  const identity = car => JSON.stringify([car.source, car.externalId]);
  function preview(cars, rows, source) {
    source = String(source || '').trim();
    if (!source || source.length > 100) throw new Error('請填寫來源名稱，最多 100 字。');
    const existing = new Map(), seen = new Set(), entries = [], errors = [];
    for (const car of cars.filter(c => c.source && c.externalId)) {
      const key = identity(car);
      if (existing.has(key)) throw new Error('現有庫存含重複來源編號，請先整理後再匯入。');
      existing.set(key, car);
    }
    rows.forEach((row, index) => {
      try {
        const { vehicle, warnings } = normalize(row, source), key = identity(vehicle);
        if (seen.has(key)) throw new Error('檔案內車源編號重複。');
        seen.add(key);
        const old = existing.get(key);
        const action = !old ? '新增' : Object.entries(vehicle).some(([key, value]) => JSON.stringify(old[key]) !== JSON.stringify(value)) ? '更新' : '不變';
        entries.push({ row: index + 1, vehicle, existingId: old?.id, action, warnings });
      } catch (error) { errors.push({ row: index + 1, message: error.message }); }
    });
    return { source, base: JSON.stringify(cars), entries, errors, counts: Object.fromEntries(['新增', '更新', '不變'].map(action => [action, entries.filter(e => e.action === action).length])) };
  }
  function apply(state, plan, fileName, now = new Date()) {
    if (plan.errors.length) throw new Error('請修正所有錯誤後重新預覽，這次尚未寫入任何車源。');
    if (JSON.stringify(state.cars) !== plan.base) throw new Error('庫存已變更，請重新預覽再確認。');
    const cars = state.cars.map(car => ({ ...car }));
    for (const entry of plan.entries.filter(e => e.action !== '不變')) {
      const index = cars.findIndex(c => c.id === entry.existingId);
      const vehicle = { ...(index >= 0 ? cars[index] : {}), ...entry.vehicle,
        id: entry.existingId || 'CAR-' + globalThis.crypto.randomUUID(), lastSyncedAt: new Date(now).toISOString() };
      if (index >= 0) cars[index] = vehicle; else cars.push(vehicle);
    }
    state.cars = cars;
    state.imports = [{ id: globalThis.crypto.randomUUID(), source: plan.source, fileName,
      at: new Date(now).toISOString(), counts: plan.counts }, ...(state.imports || [])].slice(0, 100);
    return plan.counts;
  }
  return { parse, normalize, preview, apply };
});
