/* Uses the existing prototype's db, escaping, backup and navigation functions. */
var BrokerUI = (function () {
  'use strict';
  const W = DriveOSWorkflow;
  let view = 'review', visible = 12, notice = '';
  const time = value => value ? new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '尚未安排';
  const localInput = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
  const action = (label, name, id = '', style = 'secondary') => `<button type="button" class="btn ${style}" data-broker-action="${name}" data-id="${esc(id)}">${label}</button>`;
  const empty = text => `<div class="broker-empty">${text}</div>`;
  function publicationUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch (_) { return ''; }
  }
  function transact(operation, message) {
    const before = structuredClone(db);
    try {
      const result = operation();
      localStorage.setItem(key, JSON.stringify(db));
      notice = typeof message === 'function' ? message(result) : message;
      closeForm(); render();
    } catch (error) { db = before; alert(error.message); }
  }
  function reconcile() {
    const before = structuredClone(db);
    if (W.reconcile(db)) {
      try { localStorage.setItem(key, JSON.stringify(db)); }
      catch (_) { db = before; notice = '瀏覽器儲存空間不足，請匯出備份；暫時無法儲存狀態變更。'; }
    }
  }
  function cards(posts) {
    if (!posts.length) return empty('這個階段目前沒有文案。先產生草稿，再審核與安排提醒。');
    return `<div class="broker-list">${posts.slice(0, visible).map(post => {
      const history = ['已發布', '已取消'].includes(post.status);
      const late = post.status === '已排程' && new Date(post.scheduledAt) <= new Date();
      return `<article class="broker-item" data-post-card="${esc(post.id)}">
        <div class="broker-status"><span class="pill">${esc(post.platform)}</span><b class="broker-meta">${late ? '已到提醒時間・待手動發布' : esc(post.status)}</b></div>
        <h3>${esc(post.title)}</h3>
        ${post.blockedReason ? `<div class="broker-warning">${esc(post.blockedReason)}</div>` : ''}
        <label class="field"><span>文案草稿${history ? '' : '（修改後需重新審核）'}</span><textarea aria-label="${esc(post.title)} 文案" data-content ${history ? 'readonly' : ''}>${esc(post.content)}</textarea></label>
        ${post.scheduledAt ? `<div class="broker-meta">台北時間：${esc(time(post.scheduledAt))}<br>目的地：${esc(post.destination)}<br>發布方式：手動，目前未連接平台 API</div>` : ''}
        ${publicationUrl(post.externalPostUrl) ? `<div class="broker-meta">發布時間：${esc(time(post.publishedAt))}</div><a class="broker-link" target="_blank" rel="noopener noreferrer" href="${esc(publicationUrl(post.externalPostUrl))}">檢視貼文紀錄</a>` : ''}
        <div class="quick">${!history ? action('儲存修改', 'edit', post.id) : ''}
        ${post.status === '待審核' ? action('核准文案', 'approve', post.id, '') + action('依最新車源重建', 'rebuild', post.id) : ''}
        ${action('複製文案', 'copy', post.id)}
        ${['已核准', '已排程'].includes(post.status) ? action('記錄實際發布', 'publish-form', post.id) : ''}
        ${!history ? action('取消', 'cancel', post.id, 'danger') : ''}</div>
      </article>`;
    }).join('')}</div>${posts.length > visible ? `<div class="toolbar">${action(`顯示更多（共 ${posts.length} 篇）`, 'more')}</div>` : ''}`;
  }
  function referrals() {
    const deals = db.deals.filter(d => d.workflow);
    return `<section class="card broker-section"><div class="top"><div><h2>交給凱爾車業接手</h2><p class="muted">你負責需求初談與轉介；車行負責聯繫、賞車、簽約及交車。</p></div>${action('建立轉介', 'refer-form', '', '')}</div>
      ${deals.length ? `<div class="broker-list">${deals.map(deal => `<article class="broker-item"><div class="broker-status"><b>${esc(deal.customer)}</b><span class="pill">${esc(deal.status)}</span></div>
      <h3>${esc(deal.car)}</h3><div class="broker-meta">接待窗口：${esc(deal.partnerRep)}<br>賞車時間（台北）：${esc(time(deal.appointmentAt))}<br>預計佣金：${deal.commission == null ? '待約定' : money(deal.commission)}<br>車行確認佣金：${deal.confirmedCommission == null ? '尚未確認' : money(deal.confirmedCommission)}<br>入帳：${esc(deal.paid)}${deal.commissionPaidAt ? '・' + esc(time(deal.commissionPaidAt)) : ''}</div>
      ${deal.feedback ? `<p class="broker-meta">車行回報：${esc(deal.feedback)}</p>` : ''}<div class="quick">${action('複製交接摘要', 'handoff', deal.id)}${action('記錄車行回報', 'outcome-form', deal.id)}</div></article>`).join('')}</div>` : empty('有客戶詢問後，先在「客戶 CRM」記錄預算、用途與聯絡方式，再從這裡建立轉介。')}
    </section>`;
  }
  function workspace() {
    const posts = db.posts.filter(p => p.workflow);
    const due = posts.filter(p => p.status === '已排程' && new Date(p.scheduledAt) <= new Date());
    const deals = db.deals.filter(d => d.workflow);
    const paid = deals.filter(d => d.paid === '已入帳' && d.confirmedCommission != null).reduce((n, d) => n + Number(d.confirmedCommission), 0);
    const groups = { review: ['待審核'], approved: ['已核准'], scheduled: ['已排程'], history: ['已發布', '已取消'] };
    const filtered = posts.filter(p => groups[view].includes(p.status)).sort((a, b) => view === 'scheduled' ? new Date(a.scheduledAt) - new Date(b.scheduledAt) : 0);
    const labels = { review: '待審核', approved: '已核准', scheduled: '發布提醒', history: '歷史紀錄' };
    return `<div class="broker-shell"><div class="broker-hero"><h2>把客人帶進店，讓車行完成成交。</h2><p>凱爾車業提供車源，你在線上獲客與媒合。用同一個流程管理廣告、客戶交接與佣金。</p><div class="broker-flow">${['① 授權車源', '② 文案與審核', '③ 發布提醒', '④ 詢問初談', '⑤ 轉介車行', '⑥ 回報與分佣'].map(x => `<span>${x}</span>`).join('')}</div></div>
    <div class="notice">目前為本機工作台：文案由車源資料套版產生，尚未串接 AI 或 FB／Threads 發布服務。排程只安排提醒，不會自動發文；正式排程執行器需後端與平台授權。FB 社團先保留人工發布流程，Threads 之後依官方授權能力串接。</div>
    <div class="grid">${metric('待審核文案', posts.filter(p => p.status === '待審核').length + ' 篇', '先確認內容，再安排提醒')}${metric('已到發布時間', due.length + ' 篇', '待手動發布，不代表已發出')}${metric('待車行回報', deals.filter(d => ['已轉介', '已到店'].includes(d.status)).length + ' 筆', '追蹤到店與成交結果')}${metric('已入帳佣金', money(paid), '僅計入車行確認且標記入帳的金額')}</div>
    <div role="status" class="broker-note">${esc(notice)}</div>
    <section class="card broker-section"><h2>1. 批次準備廣告</h2><p class="muted">只選可售且資料完整的車；每台車各平台保留一篇進行中的草稿，避免重複建立。</p>
    <form id="broker-generate" class="broker-form toolbar"><label>每批車數<input name="limit" type="number" value="5" min="1" max="150" required></label><label class="inline-check"><input type="checkbox" name="platform" value="Facebook社團" checked>Facebook 社團版</label><label class="inline-check"><input type="checkbox" name="platform" value="Threads" checked>Threads 版</label><button class="btn" type="submit">產生待審核草稿</button></form><p class="hint">待確認、已售出與下架車輛不會產生新草稿；示範車文案會清楚標示，不能記錄為真實發布。</p></section>
    <section class="card broker-section"><h2>2. 審核與安排發布提醒</h2><form id="broker-schedule" class="broker-form">
    <label>開始時間（台北）<input type="datetime-local" name="start" value="${localInput(Date.now() + 3600000)}" required></label>
    <label>同目的地間隔（分鐘）<input type="number" name="gap" value="240" min="30" max="1440" required></label><label>每目的地每日提醒上限<input type="number" name="daily" value="3" min="1" max="10" required></label>
    <label>FB 社團名稱<input name="facebook" placeholder="例如：已獲准刊登的汽車社團" maxlength="150"></label><label>Threads 帳號<input name="threads" placeholder="例如：你的銷售帳號" maxlength="150"></label><button type="submit" class="btn">安排已核准文案</button></form>
    <p class="hint">時間一律依台北計算，包含已存在的提醒與發布紀錄。車價、庫存、文案或平台變更時，原核准失效，需重新審核。提醒上限是你的營運設定，並非平台發布額度。</p>
    <div class="quick toolbar">${Object.entries(labels).map(([name, label]) => `<button type="button" class="btn ${view === name ? '' : 'secondary'}" data-broker-action="view" data-id="${name}" aria-pressed="${view === name}">${label}（${posts.filter(p => groups[name].includes(p.status)).length}）</button>`).join('')}</div>${cards(filtered)}</section>
    ${referrals()}<section class="card broker-section"><h2>接上真實自動化需要的資料</h2><div class="statline"><span>凱爾車源（含售價、照片與可售狀態）</span><b>待取得授權資料</b></div><div class="statline"><span>Threads／FB 帳號及可用官方權限</span><b>尚未連接</b></div><div class="statline"><span>雲端資料庫、排程執行器與安全登入</span><b>待後端建置</b></div><p class="hint">不需要把帳號密碼或 API 金鑰填進此頁。先用這裡驗證工作流程，再接上車行授權來源及平台服務。</p></section></div>`;
  }
  function modal(title, content) {
    $('#modalroot').innerHTML = `<div class="modalback"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${content}<div class="actions">${action('關閉', 'close')}</div></div></div>`;
    $('#modalroot input, #modalroot select')?.focus();
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); notice = '已複製，可貼到對應平台或車行聯絡管道。'; render(); }
    catch (_) { modal('手動複製', `<textarea readonly class="broker-contact" aria-label="可複製內容">${esc(text)}</textarea>`); }
  }
  function referForm() {
    const leads = db.leads.filter(l => !['已成交', '未成交'].includes(l.stage));
    const cars = db.cars.filter(c => c.status === '可售');
    if (!leads.length || !cars.length) { alert('請先在客戶 CRM 建立未結案客戶，並確認至少一台可售車源。'); return; }
    modal('建立凱爾車業轉介', `<p class="broker-modal-note">此處建立交接紀錄與摘要；請再將摘要透過你與車行約定的管道交給接待窗口。</p><form id="broker-refer"><div class="formgrid">
    <label class="field wide">客戶<select name="leadId" required>${leads.map(l => `<option value="${esc(l.id)}">${esc(l.name)}・${esc(l.interest)}</option>`).join('')}</select></label>
    <label class="field wide">意向車源<select name="vehicleId" required>${cars.map(c => `<option value="${esc(c.id)}">${esc(c.year)} ${esc(c.brand)} ${esc(c.model)}・${money(c.price)}</option>`).join('')}</select></label>
    <label class="field">車行接待窗口<input name="partnerRep" required maxlength="100"></label><label class="field">賞車時間（台北，可留空）<input name="appointment" type="datetime-local"></label>
    <label class="field wide">預計佣金（未約定可留空）<input name="commission" type="number" min="0" step="1"></label><label class="field wide">要交代車行的重點<textarea name="notes" maxlength="1500" placeholder="例如：平日晚上方便賞車、預算待確認"></textarea></label>
    <label class="field wide"><span><input type="checkbox" name="consent" required> 客戶同意將聯絡資料轉交凱爾車業</span></label></div><div class="actions"><button class="btn" type="submit">建立轉介紀錄</button></div></form>`);
  }
  function outcomeForm(dealId) {
    const deal = db.deals.find(d => d.id === dealId && d.workflow);
    if (!deal) return;
    modal('記錄車行回報', `<p class="broker-modal-note">${esc(deal.customer)}・${esc(deal.car)}。成交與佣金以車行實際確認為準。</p><form id="broker-outcome" data-deal-id="${esc(dealId)}"><div class="formgrid"><label class="field wide">車行回報狀態<select name="status">${['已轉介', '已到店', '已成交', '未成交'].map(s => `<option ${s === deal.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field wide">車行確認佣金（未確認可留空）<input type="number" min="0" step="1" name="confirmedCommission" value="${esc(deal.confirmedCommission ?? '')}"></label><label class="field wide"><span><input type="checkbox" name="paid" ${deal.paid === '已入帳' ? 'checked' : ''}> 已確認佣金入帳</span></label><label class="field wide">車行回報備註<textarea name="feedback" maxlength="1500">${esc(deal.feedback)}</textarea></label></div><div class="actions"><button class="btn" type="submit">儲存車行回報</button></div></form>`);
  }
  function publishForm(postId) {
    modal('記錄實際發布', `<p class="broker-modal-note">請先到平台完成發文，再填入實際貼文網址。儲存此表單只記錄結果，不會替你發布。</p><form id="broker-publish" data-post-id="${esc(postId)}"><label class="field">實際貼文網址<input name="url" type="url" placeholder="https://…" required></label><div class="actions"><button class="btn" type="submit">記錄已發布</button></div></form>`);
  }
  document.addEventListener('submit', function (event) {
    const form = event.target;
    if (!['broker-generate', 'broker-schedule', 'broker-refer', 'broker-outcome', 'broker-publish'].includes(form.id)) return;
    event.preventDefault(); const data = new FormData(form);
    if (form.id === 'broker-generate') transact(() => W.generate(db, data.getAll('platform'), Number(data.get('limit'))), result => `已建立 ${result.created} 篇待審核草稿；共有 ${result.eligible} 台資料完整的可售車。`);
    if (form.id === 'broker-schedule') transact(() => W.schedule(db, {
      start: data.get('start') + '+08:00', gapMinutes: Number(data.get('gap')), dailyLimit: Number(data.get('daily')),
      destinations: { 'Facebook社團': data.get('facebook'), Threads: data.get('threads') }
    }), n => `已安排 ${n} 篇發布提醒，仍須手動發布。`);
    if (form.id === 'broker-refer') transact(() => W.refer(db, {
      leadId: data.get('leadId'), vehicleId: data.get('vehicleId'), partnerRep: data.get('partnerRep'),
      appointmentAt: data.get('appointment') ? new Date(data.get('appointment') + '+08:00').toISOString() : null,
      consent: data.get('consent') === 'on', commission: data.get('commission'), notes: data.get('notes')
    }), '轉介紀錄已建立，請複製交接摘要交給車行。');
    if (form.id === 'broker-outcome') transact(() => W.outcome(db, form.dataset.dealId, {
      status: data.get('status'), confirmedCommission: data.get('confirmedCommission'), paid: data.get('paid') === 'on', feedback: data.get('feedback')
    }), '車行回報已儲存。');
    if (form.id === 'broker-publish') transact(() => W.markPublished(db, form.dataset.postId, data.get('url')), '實際發布紀錄已儲存。');
  });
  document.addEventListener('click', function (event) {
    const button = event.target.closest('button[data-broker-action]');
    if (!button) return;
    const name = button.dataset.brokerAction, id = button.dataset.id;
    if (name === 'close') closeForm();
    if (name === 'view') { view = id; visible = 12; render(); }
    if (name === 'more') { visible += 12; render(); }
    if (name === 'edit') transact(() => W.edit(db, id, button.closest('[data-post-card]').querySelector('[data-content]').value), '文案已修改，請重新審核。');
    if (name === 'approve') {
      const post = db.posts.find(p => p.id === id);
      if (button.closest('[data-post-card]').querySelector('[data-content]').value !== post.content) { alert('請先儲存修改，再核准。'); return; }
      transact(() => W.approve(db, id), '文案已核准，可安排提醒。');
    }
    if (name === 'rebuild' && confirm('依最新車源重建會取代這篇文案的手動修改，是否繼續？')) transact(() => W.rebuild(db, id), '已依最新車源重建，請重新審核。');
    if (name === 'cancel' && confirm('取消這篇文案與發布提醒？')) transact(() => W.cancel(db, id), '文案已取消。');
    if (name === 'copy') {
      const post = db.posts.find(p => p.id === id);
      if (post.status !== '已發布' && W.reason(db, post)) { alert(W.reason(db, post)); return; }
      copy(post.content);
    }
    if (name === 'publish-form') publishForm(id);
    if (name === 'refer-form') referForm();
    if (name === 'outcome-form') outcomeForm(id);
    if (name === 'handoff') { const deal = db.deals.find(d => d.id === id); if (deal) copy(W.handoff(deal)); }
  });
  return { workspace, reconcile };
})();

function brokerWorkspace() { return BrokerUI.workspace(); }
