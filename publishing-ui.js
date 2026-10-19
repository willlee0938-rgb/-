import { zipSync, strToU8 } from 'fflate';

const PublishingUI = (() => {
  const P = DriveOSPublishing, W = DriveOSWorkflow;
  let mode = 'real', tab = 'review', vehicleId = '', platform = 'Facebook社團', notice = '', sample, busy = false, owner = '', visible = 30;
  const drafts = new Map();
  const state = () => mode === 'demo' ? sample : db;
  const actor = () => { try { return DriveOSData.isCloud() ? DriveOSData.storageContext().userId : 'local'; } catch (_) { return ''; } };
  const button = (label, action, id = '', style = 'secondary', disabled = false) => `<button type="button" class="btn ${style}" data-publish-action="${action}" data-id="${esc(id)}" ${disabled || busy ? 'disabled' : ''}>${label}</button>`;
  const empty = text => `<p class="publishing-empty">${text}</p>`;
  const stamp = value => new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  function demoState() {
    const next = { publishingDemo: true, cars: DriveOSExamples.vehicles.map(car => ({ ...car, status: '可售', image: demoCarImage(car.color) })), posts: [], leads: [], deals: [], settings: {} };
    P.addTarget(next, { name: '練習社團 A', platform: 'Facebook社團', url: 'https://www.facebook.com/groups/driveos-demo-a/' });
    P.addTarget(next, { name: '練習社團 B', platform: 'Facebook社團', url: 'https://www.facebook.com/groups/driveos-demo-b/' });
    P.addTarget(next, { name: '練習 Threads', platform: 'Threads', url: 'https://www.threads.com/@driveos_demo' });
    W.generate(next, W.platforms, 5);
    for (const post of next.posts) post.content = DriveOSExamples.copyFor(post.vehicleId, post.platform === 'Threads' ? 'threads' : 'facebook');
    return next;
  }
  function transaction(operation, message, afterCommit = () => {}) {
    if (busy || !DriveOSData.isReady()) return;
    const next = structuredClone(state());
    try {
      const result = operation(next); W.reconcile(next); P.reconcile(next);
      if (mode === 'demo') sample = next;
      else { DriveOSData.persist(next); db = next; }
      afterCommit();
      notice = typeof message === 'function' ? message(result) : message;
      closeForm(); render();
    } catch (error) { notice = error.message; render(); const errorBox = document.getElementById('publication-error'); if (errorBox) errorBox.textContent = error.message; }
  }
  function currentPost(s) { return s.posts.find(post => post.workflow && post.vehicleId === vehicleId && post.platform === platform && !['已發布', '已取消'].includes(post.status)); }
  function capture() {
    const form = document.getElementById('publication-review'); if (!form) return;
    const data = new FormData(form);
    drafts.set(form.dataset.postId, { content: data.get('content'), indexes: data.getAll('photo').map(Number), targetIds: data.getAll('target'), remindAt: data.get('remindAt') || null });
  }
  function review(s) {
    if (!s.cars.length) return `<section class="card">${empty('還沒有車源。可以先用五台範例試跑，或新增、匯入你的車源。')}<div class="quick">${button('用五台範例試跑', 'demo', '', '')}<button class="btn secondary" onclick="navigate('cars')">新增車源</button><button class="btn secondary" onclick="navigate('inventoryImport')">車源匯入</button></div></section>`;
    const car = s.cars.find(car => car.id === vehicleId), post = currentPost(s), choices = P.targets(s).filter(target => target.platform === platform);
    const pendingDraft = post && drafts.get(post.id), content = pendingDraft?.content ?? post?.content ?? '', selected = pendingDraft?.indexes ?? (post ? P.photoIndexes(s, post) : []);
    const chosen = pendingDraft?.targetIds ?? post?.deliveries?.filter(task => ['pending', 'blocked'].includes(task.status)).map(task => task.target.id) ?? [];
    const reason = post && W.reason(s, post), gallery = VehiclePhotos.gallery(car || {});
    return `<div class="publishing-layout"><section class="card publishing-vehicle"><label class="field">選擇車源<select id="publication-vehicle" aria-label="發布車源">${s.cars.map(car => `<option value="${esc(car.id)}" ${car.id === vehicleId ? 'selected' : ''}>${esc(car.brand)} ${esc(car.model)} · ${esc(car.year)} · ${esc(car.status)}</option>`).join('')}</select></label>
      <div class="carphoto">${car ? carImage(car) : ''}</div><h2>${esc(car?.brand)} ${esc(car?.model)}</h2><p>${esc(car?.year)} 年 · ${Number(car?.mileage || 0).toLocaleString()} km</p><strong class="carprice">${money(car?.price)}</strong>
      <p class="hint">${esc(car?.id)} · ${esc(car?.status)}</p><div class="toolbar">${button('準備這台車的雙平台文案', 'prepare', car?.id, '', !W.eligible(car))}${mode === 'real' ? `<button class="btn secondary" data-photo-action="open" data-car-id="${esc(car?.id)}">管理車輛照片</button>` : ''}</div><p class="hint">依現有資料準備文案，尚未串接 AI。配備、車況等未確認資料不會自動補寫。</p></section>
      <section class="card"><div class="quick publishing-platforms">${W.platforms.map(value => `<button type="button" class="btn ${value === platform ? '' : 'secondary'}" data-publish-action="platform" data-id="${value}" aria-pressed="${value === platform}">${value === 'Threads' ? 'Threads 文案' : 'FB 社團文案'}</button>`).join('')}</div>
      ${post ? `<form id="publication-review" data-post-id="${esc(post.id)}"><div class="toolbar"><span class="pill">${esc(post.status)}</span><span class="muted">${mode === 'demo' || P.isDemo(car) ? '示範文案・不可對外刊登' : '請核對價格、車況與照片'}</span></div>${reason ? `<div class="notice publishing-warning">${esc(reason)} ${button('依最新車源重建', 'rebuild', post.id)}</div>` : ''}
      <label class="field">廣告文案<textarea name="content" maxlength="10000" required aria-label="待審核廣告文案">${esc(content)}</textarea></label>
      <fieldset><legend>挑選本次照片</legend><div class="publishing-photos">${gallery.map((image, index) => `<label><img alt="第 ${index + 1} 張車輛照片" src="${esc(image.storagePath ? demoCarImage('#6987a6') : image.url)}" ${image.storagePath ? `data-storage-path="${esc(image.storagePath)}"` : ''}><span><input type="checkbox" name="photo" value="${index}" ${selected.includes(index) ? 'checked' : ''}> 照片 ${index + 1}</span></label>`).join('') || '<p class="hint">請先到「管理車輛照片」上傳照片。</p>'}</div></fieldset>
      <fieldset><legend>勾選發布位置</legend>${choices.map(target => `<label class="publishing-target"><input type="checkbox" name="target" value="${esc(target.id)}" ${chosen.includes(target.id) ? 'checked' : ''}><span><b>${esc(target.name)}</b><small>${esc(target.url)}</small></span></label>`).join('') || '<p class="hint">還沒有這個平台的發布位置，請先到「發布位置」加入。</p>'}${button('管理發布位置', 'tab', 'targets')}</fieldset>
      <label class="field">預定發布時間（台北，留空立即準備）<input type="datetime-local" name="remindAt" value="${esc(pendingDraft?.remindAt || '')}"></label><p class="hint">此時間只標示工作台待辦，關閉網站後不會推播或自動發布。</p>
      <div class="toolbar"><button type="submit" class="btn secondary" name="action" value="save">儲存草稿</button><button type="submit" class="btn" name="action" value="queue" ${reason ? 'disabled' : ''}>核准並加入發布清單</button></div><p class="hint">加入清單後，到「逐站發布」複製文案、下載照片，再開啟社團送出。修改文字或照片需要重新核准。</p></form>` : `${empty('按「準備這台車的雙平台文案」，就會先幫你寫好 FB 與 Threads 草稿。')}`}</section></div>`;
  }
  function queue(s) {
    const tasks = P.deliveries(s), labels = { pending: '待手動發布', blocked: '需重新審核', published: '已記錄發布', cancelled: '已取消', rehearsed: '範例試跑完成' };
    return `<section class="card"><h2>逐站發布清單</h2><p class="hint">每個社團或帳號分開記錄。開啟平台、複製或下載都不會自動標記成功。${mode === 'demo' ? '範例只在這裡練習，不會開啟外部平台或寫入你的庫存。' : '請在平台確認貼文送出後，貼回網址記錄結果；社團待管理員核准的貼文請核准後再記錄。'}</p>
      <div class="publishing-tasks">${tasks.slice(0, visible).map(({ post, task }) => {
        const reason = P.blocker(s, post, task), active = task.status === 'pending' && !reason, demo = P.isDemo(s.cars.find(car => car.id === post.vehicleId));
        return `<article class="publishing-task" data-delivery-id="${esc(task.id)}"><div class="publishing-task-heading"><div><span class="pill">${esc(task.target.platform)}</span><h3>${esc(task.target.name)}</h3><p>${esc(post.title)}</p></div><b>${labels[task.status] || '待確認'}</b></div>${reason || task.blockedReason ? `<p class="notice publishing-warning">${esc(reason || task.blockedReason)}</p>` : ''}<small class="muted">加入時間（台北）：${esc(stamp(task.queuedAt))}</small>
        ${task.remindAt ? `<p class="hint">預定發布（台北）：${esc(stamp(task.remindAt))}${active && new Date(task.remindAt) <= new Date() ? ' · 已到時間，待手動發布' : ''}</p>` : ''}
        <div class="toolbar">${active ? button('① 複製文案', 'copy', task.id) + button('② 下載照片與文案 ZIP', 'download', task.id) : ''}${active && !demo ? `<a class="btn secondary" href="${esc(P.targetUrl(task.target.platform, task.target.url))}" target="_blank" rel="noopener noreferrer">③ 開啟${task.target.platform === 'Threads' ? 'Threads' : '社團'}</a>${button('④ 記錄貼文網址', 'complete-form', task.id, '')}` : ''}${active && mode === 'demo' ? button('完成範例試跑', 'rehearse', task.id, '') : ''}${active && demo && mode !== 'demo' ? '<span class="hint">示範車無法記錄真實發布，可切換五台範例試跑。</span>' : ''}${['pending', 'blocked'].includes(task.status) ? button('回到審核', 'review-post', post.id) + button('取消此站', 'cancel', task.id, 'danger') : ''}</div>
        ${task.status === 'published' ? `<p class="hint">手動記錄・${esc(stamp(task.publishedAt))}（台北）</p><a href="${esc(P.publishedUrl(task.target, task.postUrl))}" target="_blank" rel="noopener noreferrer">查看已記錄貼文</a><details><summary>當時發布文案</summary><pre>${esc(task.content)}</pre></details>` : ''}</article>`;
      }).join('') || empty('還沒有發布任務。先審核一篇文案，勾選位置，再加入清單。')}</div>${tasks.length > visible ? button(`顯示更多（共 ${tasks.length} 站）`, 'more') : ''}</section>`;
  }
  function destinations(s) {
    return `<section class="card"><h2>我的發布位置</h2><p class="hint">保存你使用的社團或帳號網址，之後審核時直接勾選。新增位置不會連接帳號或發送貼文。</p><form id="publication-target" class="publishing-target-form"><label class="field">名稱<input name="name" maxlength="100" required placeholder="例如：台灣中古車交流"></label><label class="field">平台<select name="platform"><option>Facebook社團</option><option>Threads</option></select></label><label class="field publishing-url">社團或個人頁網址<input name="url" type="url" required placeholder="https://www.facebook.com/groups/社團編號/"></label><button class="btn" type="submit">加入發布位置</button></form>
      <div class="publishing-tasks">${P.targets(s).map(target => `<article class="publishing-task"><b>${esc(target.name)}</b><p class="hint">${esc(target.platform)} · ${esc(target.url)}</p>${button('移除此位置', 'remove-target', target.id, 'danger')}</article>`).join('') || empty('尚未加入發布位置。')}</div><p class="hint">移除位置會保留已建立的任務與歷史紀錄。Threads、FB 社團目前都由你在平台送出；官方發布帳號尚未連接。</p></section>`;
  }
  function workspace() {
    const identity = actor();
    if (owner !== identity) { owner = identity; mode = 'real'; vehicleId = ''; notice = ''; drafts.clear(); }
    const s = state();
    if (mode === 'demo') { W.reconcile(s); P.reconcile(s); }
    if (!s.cars.some(car => car.id === vehicleId)) vehicleId = s.cars.find(W.eligible)?.id || s.cars[0]?.id || '';
    const tasks = P.deliveries(s);
    return `<div class="publishing-shell"><section class="publishing-hero"><div><small>DRIVEOS / 發布工作台</small><h2>文案準備好，你審核後逐站發布。</h2><p>選車與照片 → 審核文案 → 勾選社團 → 完成發布紀錄</p></div>${button(mode === 'demo' ? '回到我的車源' : '用五台範例試跑', mode === 'demo' ? 'real' : 'demo')}</section>
      <div class="notice">${mode === 'demo' ? '<b>範例模式：</b>五台虛構車源與練習位置，重整後清除，不會修改你的雲端資料。' : '目前是半自動發布：系統準備圖文與清單，由你在社團或 Threads 完成送出。官方帳號授權與背景自動發布尚未接通。'}</div>
      <div id="publishing-feedback" role="status" aria-live="polite">${esc(notice)}</div><div class="quick publishing-tabs">${[['review', '文案與審核'], ['queue', `逐站發布（${tasks.filter(({task}) => task.status === 'pending').length}）`], ['targets', '發布位置']].map(([id, label]) => `<button type="button" class="btn ${tab === id ? '' : 'secondary'}" data-publish-action="tab" data-id="${id}" aria-pressed="${tab === id}">${label}</button>`).join('')}</div>
      ${({ review, queue, targets: destinations })[tab](s)}</div>`;
  }
  function modal(title, html) {
    $('#modalroot').innerHTML = `<div class="modalback"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${html}<div class="actions">${button('關閉', 'close')}</div></section></div>`;
  }
  async function copy(taskId) {
    const s = state(), { post, task } = P.taskFor(s, taskId), reason = P.blocker(s, post, task); if (reason) throw new Error(reason);
    try { await navigator.clipboard.writeText(task.content); notice = '文案已複製，接著下載照片，再到平台貼上送出。'; render(); }
    catch (_) { modal('複製文案', `<textarea readonly aria-label="手動複製發布文案">${esc(task.content)}</textarea>`); }
  }
  const safeName = value => String(value).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 70) || 'vehicle';
  async function download(taskId) {
    const s = state(), { post, task } = P.taskFor(s, taskId), reason = P.blocker(s, post, task), car = s.cars.find(car => car.id === post.vehicleId);
    if (reason || task.status !== 'pending') throw new Error(reason || '請使用待發布任務下載圖文。');
    const runMode = mode, runActor = actor(), key = task.reviewKey, images = VehiclePhotos.gallery(car);
    const assertCurrent = () => {
      if (runMode !== mode || runActor !== actor() || !DriveOSData.isReady()) throw new Error('登入或工作模式已變更，請重新下載。');
      const current = P.taskFor(state(), taskId);
      if (current.task.reviewKey !== key || current.task.status !== 'pending' || P.blocker(state(), current.post, current.task)) throw new Error('車源或文案已變更，請重新審核後下載。');
    };
    const files = {}, cap = 10 * 1024 * 1024; let bytes = 0;
    busy = true; notice = '正在下載照片並打包，完成前請留在此頁…'; render();
    try {
      for (const [position, index] of task.photoIndexes.entries()) {
        assertCurrent(); const image = images[index]; if (!image) throw new Error('照片已變更，請重新審核。');
        let blob;
        if (image.storagePath) {
          const ctx = DriveOSData.storageContext();
          if (!VehiclePhotos.owned(image.storagePath, ctx.userId)) throw new Error('這張照片不屬於目前登入帳號。');
          const result = await ctx.storage.download(image.storagePath); if (result.error) throw new Error('雲端照片下載失敗，請確認網路與圖庫權限後重試。'); blob = result.data;
        } else {
          const source = String(image.url || '');
          if (!source.startsWith('https://') && !/^data:image\/(jpeg|png|webp)[;,]/.test(source) && !(P.isDemo(car) && source.startsWith('data:image/svg+xml'))) throw new Error('圖片網址須為 HTTPS，或請先上傳照片到雲端圖庫。');
          let response;
          try { response = await fetch(source, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000) }); }
          catch (_) { throw new Error('外部圖片無法下載，可能不允許跨站存取；請先將照片上傳雲端圖庫再重試。'); }
          if (!response.ok || Number(response.headers.get('content-length')) > cap) throw new Error('照片下載失敗或檔案超過 10MB，請改用雲端照片。');
          blob = await response.blob();
        }
        assertCurrent();
        const type = blob?.type?.split(';')[0].toLowerCase(), ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', ...(P.isDemo(car) ? { 'image/svg+xml': 'svg' } : {}) }[type];
        if (!ext || !blob.size || blob.size > cap) throw new Error('下載的檔案不是支援的照片或超過 10MB，請轉成 JPG、PNG、WebP 後上傳圖庫。');
        bytes += blob.size; if (bytes > 50 * 1024 * 1024) throw new Error('照片包超過 50MB，請減少選取張數。');
        files[`${String(position + 1).padStart(2, '0')}-${safeName(car.brand + '-' + car.model)}.${ext}`] = new Uint8Array(await blob.arrayBuffer());
      }
      assertCurrent();
      files['文案.txt'] = strToU8(task.content);
      files['發布說明.txt'] = strToU8(`${P.isDemo(car) ? '【示範資料，請勿對外刊登】\n' : ''}車源：${car.id}\n發布位置：${task.target.name}\n${task.target.url}\n\n請在平台貼上文案、上傳照片並完成送出，再回 DriveOS 記錄實際貼文網址。\n此檔案包不會自動發布。`);
      const url = URL.createObjectURL(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }));
      const link = document.createElement('a'); link.href = url; link.download = `${P.isDemo(car) ? '範例-' : ''}${safeName(car.id)}-${safeName(task.target.name)}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      notice = `已打包 ${task.photoIndexes.length} 張照片與文案，請到平台上傳發布。`;
    } finally { busy = false; if (DriveOSData.isReady() && actor() === runActor) render(); }
  }
  document.addEventListener('input', event => { if (event.target.closest('#publication-review')) capture(); });
  document.addEventListener('change', event => {
    if (event.target.closest('#publication-review')) capture();
    if (event.target.id === 'publication-vehicle') { capture(); vehicleId = event.target.value; notice = ''; render(); }
  });
  document.addEventListener('submit', event => {
    const form = event.target; if (!['publication-target', 'publication-review', 'publication-complete'].includes(form.id)) return;
    event.preventDefault(); const data = new FormData(form);
    if (form.id === 'publication-target') transaction(s => P.addTarget(s, Object.fromEntries(data)), '發布位置已保存，回到「文案與審核」即可勾選。');
    if (form.id === 'publication-review') {
      capture(); const id = form.dataset.postId, input = drafts.get(id);
      if (event.submitter?.value === 'save') transaction(s => { W.edit(s, id, input.content); P.setPhotos(s, s.posts.find(post => post.id === id), input.indexes); }, '草稿已保存，發布前請重新審核。');
      else transaction(s => P.reviewAndQueue(s, id, { ...input, remindAt: input.remindAt ? input.remindAt + '+08:00' : null }), count => count ? `已核准並準備 ${count} 個位置，請依序完成下方步驟。` : '這些位置已在清單內，沒有重複加入。', () => { drafts.delete(id); tab = 'queue'; });
    }
    if (form.id === 'publication-complete') transaction(s => P.complete(s, form.dataset.taskId, data.get('url')), '發布結果已依你提供的貼文網址記錄。');
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-publish-action]'); if (!el || busy) return;
    const action = el.dataset.publishAction, id = el.dataset.id;
    try {
      if (action === 'close') { closeForm(); return; }
      capture();
      if (action === 'open-vehicle') open(id);
      if (action === 'tab') { tab = id; notice = ''; render(); }
      if (action === 'more') { visible += 30; render(); }
      if (action === 'platform') { platform = id; render(); }
      if (action === 'demo' || action === 'real') { mode = action; if (mode === 'demo') sample ||= demoState(); vehicleId = ''; notice = ''; tab = 'review'; render(); }
      if (action === 'prepare') transaction(s => P.prepare(s, id), result => result.created ? '雙平台文案已準備好，請檢查並勾選發布位置。' : '已有進行中的文案，請直接審核。');
      if (action === 'rebuild' && confirm('依最新車源重建會取代這篇文案的修改，是否繼續？')) transaction(s => { W.rebuild(s, id); delete s.posts.find(post => post.id === id).publishPhotoIndexes; }, '已依最新車源重建，請重新確認照片與發布位置。', () => drafts.delete(id));
      if (action === 'remove-target' && confirm('移除此發布位置？已建立的任務和歷史紀錄會保留。')) transaction(s => P.removeTarget(s, id), '發布位置已移除。');
      if (action === 'review-post') { const post = state().posts.find(post => post.id === id); vehicleId = post.vehicleId; platform = post.platform; tab = 'review'; render(); }
      if (action === 'cancel') transaction(s => P.cancel(s, id), '已取消這個位置的任務。');
      if (action === 'rehearse') transaction(s => P.rehearse(s, id), '範例試跑完成，沒有發送到任何平台。');
      if (action === 'copy') await copy(id);
      if (action === 'download') await download(id);
      if (action === 'complete-form') { const { task } = P.taskFor(state(), id); modal('記錄實際貼文網址', `<p class="hint">${esc(task.target.name)}：請先在平台完成發布。這裡記錄你提供的網址，不會替你發文或驗證平台是否核准。</p><form id="publication-complete" data-task-id="${esc(id)}"><label class="field">已發布的貼文網址<input type="url" name="url" required placeholder="https://…"></label><p id="publication-error" role="status" class="hint"></p><div class="actions"><button type="submit" class="btn">儲存發布紀錄</button></div></form>`); }
    } catch (error) { notice = error.message; if (DriveOSData.isReady()) render(); }
  });
  function open(id) { mode = 'real'; vehicleId = id; tab = 'review'; navigate('publishing'); }
  return { workspace, open };
})();
window.PublishingUI = PublishingUI;
window.publishingWorkspace = () => PublishingUI.workspace();
