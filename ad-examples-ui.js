var AdExamplesUI = (function () {
  const selected = new Map(), E = DriveOSExamples;
  let message = '';
  function workspace() {
    return `<div class="examples-hero"><span class="pill">5 組練習範例</span><h2>還沒拿到車源，也能先把廣告做好。</h2><p>先比較呈現方式：車源資訊 → Facebook 社團版／Threads 版 → 文案檢查。之後換成凱爾授權的真實資料，再建立正式草稿。</p></div>
    <div class="notice">以下車款、售價、年份及里程都是示範資料，非凱爾實際庫存，也不是市場估價。插畫為示意圖；文案是預先準備的套版範例，尚未串接 AI 或自動發布。這頁不會新增、覆蓋或刪除你的車源、客戶與照片。</div>
    <p role="status" class="broker-note">${esc(message)}</p>
    <div class="examples-list">${E.vehicles.map((car, index) => {
      const platform = selected.get(car.id) || 'facebook';
      return `<article class="examples-card" data-example="${car.id}"><div class="examples-vehicle"><div class="examples-photo"><img src="${esc(demoCarImage(car.color))}" alt="${esc(car.brand)} ${esc(car.model)} 示意插畫，非實車照片"><span>示範 ${index + 1}／5</span></div><div class="examples-details"><span class="pill">文案方向：${esc(car.angle)}</span><h2>${esc(car.brand)} ${esc(car.model)}</h2><p>${car.year} 年・示範里程 ${car.mileage.toLocaleString('zh-TW')} km</p><strong>示範售價 ${money(car.price)}</strong><small>規格及數字僅供測試，車況與配備未確認。</small></div></div><div class="examples-ad"><div class="examples-tabs"><button type="button" class="btn ${platform === 'facebook' ? '' : 'secondary'}" data-example-action="platform" data-id="${car.id}" data-platform="facebook" aria-pressed="${platform === 'facebook'}">Facebook 社團版</button><button type="button" class="btn ${platform === 'threads' ? '' : 'secondary'}" data-example-action="platform" data-id="${car.id}" data-platform="threads" aria-pressed="${platform === 'threads'}">Threads 版</button></div><label class="field"><span>${platform === 'facebook' ? '資訊完整型：先提供規格，再確認需求' : '互動提問型：從使用需求開始對話'}</span><textarea readonly aria-label="${esc(car.brand)} ${esc(car.model)} 示範文案">${esc(E.copyFor(car.id, platform))}</textarea></label><div class="examples-footer"><button type="button" class="btn secondary" data-example-action="copy" data-id="${car.id}">複製這篇示範</button><span>示範標記會一起複製，請勿作為真實廣告刊登。</span></div></div></article>`;
    }).join('')}</div><div class="card section"><h2>這 5 組要先確認什麼？</h2><p class="examples-next">看文案資訊是否清楚、語氣是否像你、客人是否知道下一步怎麼詢問。拿到真實車源後，才核對售價、照片、可售狀態及車行確認資訊，再進審核與發布流程。</p></div>`;
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-example-action]'); if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.exampleAction === 'platform') { selected.set(id, button.dataset.platform); render(); }
    if (button.dataset.exampleAction === 'copy') {
      const text = E.copyFor(id, selected.get(id) || 'facebook');
      try { await navigator.clipboard.writeText(text); message = '已複製示範文案，包含「非真實庫存」標記。'; render(); }
      catch (_) { const textarea = button.closest('[data-example]').querySelector('textarea'); textarea.focus(); textarea.select(); message = '請按複製快捷鍵，保留開頭的示範標記。'; const status = document.querySelector('#app [role=status]'); if (status) status.textContent = message; }
    }
  });
  return { workspace };
})();
function adExamplesWorkspace() { return AdExamplesUI.workspace(); }
