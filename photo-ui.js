var DriveOSPhotos = (function () {
  const P = VehiclePhotos, cache = new Map();
  let activeId = null, busy = false, message = '', signing = false, signAgain = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function context() { try { return DriveOSData.storageContext(); } catch (_) { return null; } }
  function url(image) {
    if (!image?.storagePath) return image?.url || '';
    const ctx = context();
    if (!ctx || !P.owned(image.storagePath, ctx.userId)) return '';
    const cached = cache.get(image.storagePath);
    return cached && cached.until > Date.now() ? cached.url : '';
  }
  function cover(car) { return url(P.gallery(car)[0]); }
  function coverPath(car) { return P.gallery(car)[0]?.storagePath || ''; }
  async function refresh() {
    const ctx = context(); if (!ctx) return;
    if (signing) { signAgain = true; return; }
    const images = [...document.querySelectorAll('img[data-storage-path]')];
    const paths = [...new Set(images.map(img => img.dataset.storagePath).filter(path => P.owned(path, ctx.userId) && (!cache.has(path) || cache.get(path).until <= Date.now())))];
    if (paths.length) {
      signing = true;
      try {
        const { data, error } = await ctx.storage.createSignedUrls(paths, 3600);
        if (error) throw error;
        if (context()?.userId !== ctx.userId) return;
        for (const item of data || []) if (item.signedUrl && !item.error) cache.set(item.path, { url: item.signedUrl, until: Date.now() + 3000000 });
      } catch (_) {
        const hint = document.querySelector('#photo-feedback');
        if (hint) hint.textContent = '部分照片尚未載入，請確認網路及雲端圖庫設定。';
      } finally {
        signing = false;
        if (signAgain) { signAgain = false; setTimeout(() => void refresh(), 0); }
      }
    }
    for (const img of document.querySelectorAll('img[data-storage-path]')) {
      const cached = cache.get(img.dataset.storagePath);
      if (cached && P.owned(img.dataset.storagePath, ctx.userId) && cached.until > Date.now()) img.src = cached.url;
    }
  }
  function show(carId, preserveMessage = false) {
    const car = db.cars.find(c => c.id === carId); if (!car) return;
    if (!preserveMessage) message = '';
    activeId = carId; const images = P.gallery(car), cloud = DriveOSData.isCloud(); const used = P.usage(db.cars, context()?.userId), budget = Number(db.settings?.photoBudgetMb || 0), ratio = budget ? used.bytes / (budget * 1024 * 1024) : 0;
    $('#modalroot').innerHTML = `<div class="modalback"><section class="modal photo-modal" role="dialog" aria-modal="true" aria-label="車輛照片管理"><h2>${esc(car.brand)} ${esc(car.model)}・照片管理</h2><p class="photo-help">第一張是封面；可上傳實車照片或管理匯入的照片網址。照片檔放在私人雲端圖庫，車源資料只記錄檔案位置。</p><div class="photo-usage ${ratio >= 0.8 ? 'photo-usage-warning' : ''}"><b>工作台已連結 ${used.count} 張雲端照片・約 ${(used.bytes / 1024 / 1024).toFixed(1)} MB</b><p>${used.unknown ? `另有 ${used.unknown} 張缺少大小紀錄。` : ''}${ratio >= 0.8 ? '已達你設定照片容量的 80% 以上，請檢查 Supabase Usage。' : ''}</p><p>這是已連結照片的估算，不包含未連結檔案、其他專案資料或外部圖片網址；不代表平台剩餘額度。</p><form id="photo-budget"><label>照片容量提醒門檻（MB）<input name="budget" type="number" min="1" max="1000000" step="1" value="${budget || ''}" placeholder="依 Supabase Usage 額度填寫" ${busy ? 'disabled' : ''}></label><button class="btn secondary" type="submit" ${busy ? 'disabled' : ''}>儲存容量提醒</button><small>留空可關閉提醒，不會調整 Supabase 方案或硬性阻止上傳。</small></form></div><p id="photo-feedback" role="status">${esc(message)}</p><div class="photo-grid">${images.map((image, index) => `<article class="photo-item"><img src="${esc(url(image) || demoCarImage('#6987a6'))}" ${image.storagePath ? `data-storage-path="${esc(image.storagePath)}"` : ''} alt="${esc(car.brand)} ${esc(car.model)} 第 ${index + 1} 張照片"><div class="photo-label">${index ? '照片 ' + (index + 1) : '封面'}・${image.storagePath ? '雲端照片' : '圖片網址／本機圖片'}</div><div class="quick"><button class="btn secondary" type="button" data-photo-action="cover" data-index="${index}" ${index === 0 || busy ? 'disabled' : ''}>設為封面</button><button class="btn danger" type="button" data-photo-action="remove" data-index="${index}" ${busy ? 'disabled' : ''}>移除</button></div></article>`).join('') || '<p class="muted">這台車還沒有照片，可以從下方上傳。</p>'}</div>${cloud ? `<form id="photo-upload"><label class="field">選擇實車照片<input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp" ${busy ? 'disabled' : ''} required></label><p class="hint">JPG／PNG／WebP，原始檔每張上限 25MB，上傳前自動縮圖與壓縮；一般以 500KB 內為目標，處理後上限 5MB。一次最多 10 張，每台車最多 20 張。原始高畫質檔請自行保留。請使用有權刊登的實車照片。若尚未啟用雲端圖庫，上傳時會顯示設定提示。</p><button class="btn" type="submit" ${busy ? 'disabled' : ''}>${busy ? '處理中…' : '上傳到雲端圖庫'}</button></form>` : '<p class="photo-help">本機示範模式可管理現有照片；登入雲端帳號後才能上傳雲端圖庫。</p>'}<div class="actions"><button class="btn secondary" type="button" data-photo-action="close" ${busy ? 'disabled' : ''}>關閉</button></div></section></div>`;
    void refresh();
  }
  async function commit(car) {
    const state = DriveOSApp.snapshot(), index = state.cars.findIndex(c => c.id === car.id);
    if (index < 0) throw new Error('車源已被移除，請重新開啟圖庫。');
    state.cars[index] = car; DriveOSWorkflow.reconcile(state); DriveOSData.persist(state); DriveOSApp.replaceState(state); show(car.id, true);
    if (!(await DriveOSData.flush())) throw new Error('照片關聯尚未完成雲端同步，草稿已保留。請到「帳號與同步」處理後再繼續；這次不會刪除雲端照片。');
  }
  function storageError(error) {
    if (/decode|source image/i.test(error.message || '')) return '有檔案無法辨識為照片，請轉存成 JPG、PNG 或 WebP 後重試。';
    if (/bucket|row.level|policy|not found|unauthorized/i.test(error.message || '')) return '雲端圖庫尚未設定或沒有權限。請先在 Supabase SQL Editor 執行 photos.sql 圖庫設定檔。';
    return error.message || '照片上傳失敗，請檢查網路後重試。';
  }
  document.addEventListener('submit', async event => {
    if (event.target.id === 'photo-budget') {
      event.preventDefault(); if (busy) return;
      const raw = event.target.elements.budget.value, carId = activeId;
      try {
        const budget = raw === '' ? null : Number(raw);
        if (budget !== null && (!Number.isInteger(budget) || budget < 1 || budget > 1000000)) throw new Error('提醒門檻請填 1–1000000 MB 的整數，或留空關閉。');
        busy = true;
        const state = DriveOSApp.snapshot(); state.settings = { ...(state.settings || {}), photoBudgetMb: budget };
        DriveOSData.persist(state); DriveOSApp.replaceState(state); show(carId, true);
        if (!(await DriveOSData.flush())) throw new Error('容量提醒尚未完成雲端同步，請至「帳號與同步」處理。');
        message = budget ? '照片容量提醒已儲存。' : '已關閉照片容量提醒。';
      } catch (error) { message = error.message; }
      finally { busy = false; if (DriveOSData.isReady()) show(carId, true); }
      return;
    }
    if (event.target.id !== 'photo-upload') return;
    event.preventDefault(); if (busy) return;
    const carId = activeId, files = [...event.target.elements.photos.files], uploaded = [];
    let ctx, attached = false;
    try {
      ctx = DriveOSData.storageContext();
      const car = db.cars.find(c => c.id === carId); if (!car) throw new Error('找不到車源。');
      P.validateFiles(files, P.gallery(car).filter(i => !i.url?.startsWith('data:image/svg+xml')).length, true);
      busy = true; message = '照片縮圖與壓縮中…'; show(carId, true);
      const prepared = [];
      for (const file of files) prepared.push(await PhotoCompression.prepare(file));
      P.validateFiles(prepared.map(item => item.file), P.gallery(car).filter(i => !i.url?.startsWith('data:image/svg+xml')).length);
      busy = true; message = '開始上傳…'; show(carId, true);
      for (const item of prepared) {
        const file = item.file;
        const path = P.objectPath(ctx.userId, carId, file.type);
        const result = await ctx.storage.upload(path, file, { contentType: file.type, upsert: false, cacheControl: '60' });
        if (result.error) throw result.error;
        uploaded.push({ storagePath: path, originalName: file.name, mimeType: file.type, size: file.size, originalSize: item.originalSize, width: item.width, height: item.height, compressed: item.compressed });
        message = `已上傳 ${uploaded.length}／${files.length} 張，正在儲存車源關聯…`;
        const hint = $('#photo-feedback'); if (hint) hint.textContent = message;
      }
      if (context()?.userId !== ctx.userId) throw new Error('登入帳號已變更，請重新登入後確認照片。');
      const latest = db.cars.find(c => c.id === carId); if (!latest) throw new Error('車源已被移除。');
      const existing = P.gallery(latest).filter(i => !i.url?.startsWith('data:image/svg+xml'));
      const next = P.setGallery(latest, [...existing, ...uploaded]);
      // After attaching, dirty DB drafts may still reference the files; never delete them on a sync failure.
      attached = true; await commit(next); message = `已上傳並儲存 ${uploaded.length} 張照片。`;
    } catch (error) {
      message = storageError(error);
      if (!attached && uploaded.length && context()?.userId === ctx?.userId) {
        try {
          const result = await ctx.storage.remove(uploaded.map(i => i.storagePath));
          if (result.error) throw result.error;
        } catch (_) { message += ' 部分檔案已上傳但未連結車源，清理未完成，請稍後檢查圖庫。'; }
      }
    } finally { busy = false; if (db.cars.some(c => c.id === carId) && DriveOSData.isReady()) show(carId, true); }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-photo-action]'); if (!button || busy) return;
    const action = button.dataset.photoAction;
    if (action === 'open') { show(button.dataset.carId); return; }
    if (action === 'close') { activeId = null; closeForm(); return; }
    const carId = activeId, car = db.cars.find(c => c.id === carId); if (!car) return;
    const index = Number(button.dataset.index);
    if (action === 'remove' && !confirm('確定將這張照片從車源移除？屬於此帳號且未被其他車使用的雲端照片，也會在資料儲存成功後刪除。')) return;
    try {
      busy = true;
      if (action === 'cover') { await commit(P.setCover(car, index)); message = '封面已儲存。'; }
      if (action === 'remove') {
        const { car: next, removed } = P.remove(car, index);
        await commit(next);
        message = '照片已從車源移除。';
        if (removed.storagePath && !db.cars.some(c => P.gallery(c).some(i => i.storagePath === removed.storagePath))) {
          const ctx = DriveOSData.storageContext();
          if (P.owned(removed.storagePath, ctx.userId)) {
            const result = await ctx.storage.remove([removed.storagePath]);
            if (result.error) message += ' 雲端檔案清理尚未完成，檔案仍保留。';
            else cache.delete(removed.storagePath);
          }
        }
      }
    } catch (error) { message = storageError(error); }
    finally { busy = false; if (db.cars.some(c => c.id === carId) && DriveOSData.isReady()) show(carId, true); }
  });
  window.addEventListener('focus', () => void refresh());
  return { cover, coverPath, refresh, show };
})();
