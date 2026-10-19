var InventoryUI = (function () {
  let plan = null, fileName = '', message = '', source = '凱爾車業';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function workspace() {
    return `<section class="card"><h2>車源匯入</h2><p>先選檔案預覽，再確認寫入。只更新車源，保留客戶、廣告、轉介與佣金。</p><div class="import-links"><a href="sample-inventory.csv" download>下載 CSV 範本</a><a href="sample-inventory.json" download>下載 JSON 範本</a></div><form id="inventory-preview" class="import-form"><label>資料來源名稱<input name="source" value="${esc(source)}" maxlength="100" required></label><label>CSV／JSON 車源檔<input name="file" type="file" accept=".csv,.json,text/csv,application/json" required></label><button class="btn" type="submit">預覽匯入</button></form><p class="hint">Excel 請另存為「CSV UTF-8」。車源編號、品牌、車型、年份、里程與售價為必填；售價單位是元。每次匯入最多 2000 台、檔案上限 5MB。不會自動刪除檔案內未出現的舊車。</p><p role="status" class="broker-note">${esc(message)}</p>
    ${plan ? `<h2>預覽：${esc(fileName)}</h2><div class="import-summary"><span>新增 ${plan.counts['新增']} 台</span><span>更新 ${plan.counts['更新']} 台</span><span>不變 ${plan.counts['不變']} 台</span><span>錯誤 ${plan.errors.length} 筆</span></div>${plan.errors.length ? `<div class="import-errors">尚未寫入。請修正以下錯誤後重新預覽：<ul>${plan.errors.map(e => `<li>第 ${e.row} 筆：${esc(e.message)}</li>`).join('')}</ul></div>` : ''}<div class="tablewrap import-preview"><table><thead><tr><th>動作</th><th>車源編號</th><th>車款</th><th>售價</th><th>狀態</th><th>提醒</th></tr></thead><tbody>${plan.entries.slice(0, 150).map(e => `<tr><td>${e.action}</td><td>${esc(e.vehicle.externalId)}</td><td>${esc(e.vehicle.year)} ${esc(e.vehicle.brand)} ${esc(e.vehicle.model)}</td><td>${Number(e.vehicle.price).toLocaleString('zh-TW')} 元</td><td>${esc(e.vehicle.status)}</td><td>${e.warnings.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>${plan.entries.length > 150 ? '<p class="hint">畫面顯示前 150 筆；確認時會處理整批有效資料。</p>' : ''}<div class="toolbar"><button type="button" class="btn" id="inventory-apply" ${plan.errors.length ? 'disabled' : ''}>確認寫入車源</button><button type="button" class="btn secondary" id="inventory-discard">取消預覽</button></div>` : ''}</section>
    <section class="card section"><h2>最近匯入紀錄</h2>${(db.imports || []).length ? `<div class="tablewrap"><table><thead><tr><th>時間（台北）</th><th>來源</th><th>檔案</th><th>結果</th></tr></thead><tbody>${db.imports.slice(0, 20).map(i => `<tr><td>${esc(new Date(i.at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }))}</td><td>${esc(i.source)}</td><td>${esc(i.fileName)}</td><td>新增 ${Number(i.counts['新增'])}／更新 ${Number(i.counts['更新'])}／不變 ${Number(i.counts['不變'])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">尚未匯入車源。</p>'}</section>`;
  }
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'inventory-preview') return;
    event.preventDefault(); const form = event.target, data = new FormData(form), file = data.get('file');
    const button = form.querySelector('button'); button.disabled = true;
    try {
      if (!file.size) throw new Error('請先選擇有內容的檔案。');
      if (file.size > 5 * 1024 * 1024) throw new Error('檔案超過 5MB，請分批匯入。');
      const text = await file.text();
      const rows = DriveOSInventory.parse(text, file.name);
      source = String(data.get('source')).trim(); plan = DriveOSInventory.preview(db.cars, rows, source); fileName = file.name;
      message = plan.errors.length ? '預覽有錯誤，尚未變更任何資料。' : '預覽完成，請檢查後確認寫入。';
      render();
    } catch (error) { plan = null; message = error.message; render(); }
    finally { button.disabled = false; }
  });
  document.addEventListener('click', event => {
    if (event.target.id === 'inventory-discard') { plan = null; message = '已取消預覽，資料沒有變更。'; render(); }
    if (event.target.id !== 'inventory-apply' || !plan) return;
    const before = structuredClone(db);
    try {
      const counts = DriveOSInventory.apply(db, plan, fileName);
      DriveOSWorkflow.reconcile(db); DriveOSData.persist(db);
      plan = null; message = `匯入已保留：新增 ${counts['新增']} 台、更新 ${counts['更新']} 台。雲端模式請確認上方顯示「已儲存到雲端」。`; render();
    } catch (error) { db = before; message = error.message; render(); }
  });
  return { workspace };
})();
function inventoryWorkspace() { return InventoryUI.workspace(); }
