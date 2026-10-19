import { createClient } from '@supabase/supabase-js';
import { SyncEngine, emptyState, validateState } from './cloud-sync.cjs';

const configKey = 'driveos_cloud_connection';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let client, session, engine, configured = false, ready = false, local = emptyState(), activeUser = null, connecting = false;
let mode = 'login', message = '', generation = 0;
const tabId = sessionStorage.getItem('driveos_tab_id') || crypto.randomUUID();
sessionStorage.setItem('driveos_tab_id', tabId);
const statusLabels = { saved: '已儲存到雲端', saving: '正在儲存到雲端…', error: '雲端儲存失敗・本機草稿已保留', paused: '有尚未同步的本機草稿', conflict: '另一個裝置有更新・請先處理版本', loading: '正在讀取雲端資料…', auth: '登入已過期・請重新登入' };
function configuration() {
  const saved = JSON.parse(localStorage.getItem(configKey) || 'null');
  return window.DRIVEOS_CONFIG?.projectUrl ? window.DRIVEOS_CONFIG : saved;
}
export function validateConfig(input) {
  const projectUrl = String(input?.projectUrl || '').replace(/\/$/, '');
  const publishableKey = String(input?.publishableKey || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl)) throw new Error('請填入 Supabase 的 Project URL，格式為 https://專案編號.supabase.co。');
  if (publishableKey.startsWith('sb_secret_')) throw new Error('這是私人金鑰，請改用 Publishable key。');
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey);
  if (!publicKey) {
    try {
      const payload = JSON.parse(atob(publishableKey.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
      publicKey = payload.role === 'anon';
    } catch (_) { /* Report the public-key requirement below. */ }
  }
  if (!publicKey) throw new Error('請使用 Publishable key（或舊版 anon public key），不能使用 secret 或 service_role。');
  return { projectUrl, publishableKey };
}
function root() { return document.getElementById('authroot'); }
function lock() { document.body.classList.add('cloud-locked'); ready = false; }
function status() {
  const el = document.getElementById('cloud-status'); if (!el) return;
  const tag = document.querySelector('.tag'); if (tag) tag.textContent = configured ? '● 雲端帳號模式' : '● 示範本機模式';
  el.innerHTML = configured ? `<span>${escape(session?.user?.email || '')}</span><b>${escape(statusLabels[engine?.status || 'loading'])}</b><button type="button" data-cloud-action="account">帳號與同步</button>` : '<b>示範模式・資料僅存本機</b><button type="button" data-cloud-action="connect">設定雲端登入</button>';
}
function stateToApp(state) { window.DriveOSApp.replaceState(validateState(structuredClone(state))); }
function renderGate() {
  if (!root()) return;
  if (mode === 'recovery') {
    root().innerHTML = `<section class="auth-card"><h1>設定新密碼</h1><form id="cloud-password"><label>新密碼<input type="password" name="password" minlength="10" required autocomplete="new-password"></label><label>再輸入一次<input type="password" name="confirm" minlength="10" required autocomplete="new-password"></label><button class="btn" type="submit">儲存新密碼</button></form><p role="status">${escape(message)}</p></section>`;
    return;
  }
  root().innerHTML = `<section class="auth-card"><div class="auth-brand">DriveOS</div><h1>${mode === 'reset' ? '重設登入密碼' : '登入你的銷售工作台'}</h1><p>車源、客戶與佣金資料會依帳號分開保存。</p><form id="cloud-login"><label>電子郵件<input type="email" name="email" required autocomplete="username"></label>${mode === 'reset' ? '' : '<label>密碼<input type="password" name="password" required autocomplete="current-password"></label>'}<button class="btn" type="submit">${mode === 'reset' ? '寄送重設密碼信' : '登入'}</button></form><p role="status">${escape(message)}</p><button class="auth-text" type="button" data-cloud-action="${mode === 'reset' ? 'login-view' : 'reset-view'}">${mode === 'reset' ? '回到登入' : '忘記密碼'}</button><p class="hint">第一次使用？請先由專案管理者在 Supabase 建立使用者帳號。</p></section>`;
}
function authError(error) {
  if (/invalid login credentials/i.test(error.message)) return '電子郵件或密碼不正確，請重新輸入。';
  if (/email not confirmed/i.test(error.message)) return '電子郵件尚未確認，請查看信箱或由管理者確認帳號。';
  if (/rate limit|too many/i.test(error.message)) return '嘗試次數較多，請稍後再試。';
  return '登入服務暫時無法完成，請檢查網路及 Supabase 設定後再試。';
}
function showProblem(error) {
  lock();
  root().innerHTML = `<section class="auth-card"><h1>雲端資料尚未載入</h1><p>${escape(error.message)}</p><p>原有本機資料仍保留，這次不會用空白資料覆蓋。</p><button class="btn" type="button" data-cloud-action="reload">重新連線</button>${!window.DRIVEOS_CONFIG?.projectUrl ? '<button class="auth-text" type="button" data-cloud-action="reset-config">重設此瀏覽器的連線</button>' : ''}${client ? '<button class="auth-text" type="button" data-cloud-action="logout">登出</button>' : ''}</section>`;
}
function cacheFor(userId) {
  const key = `driveos_cloud_cache:${new URL(client.supabaseUrl).host}:${userId}:${tabId}`;
  return { read: () => JSON.parse(localStorage.getItem(key) || 'null'), write: record => localStorage.setItem(key, JSON.stringify(record)) };
}
async function hydrate(nextSession) {
  if (nextSession.user.id !== session?.user?.id) return;
  if (connecting || (ready && activeUser === nextSession.user.id)) return;
  connecting = true; const run = ++generation; lock();
  root().innerHTML = '<section class="auth-card"><h1>正在讀取你的雲端資料…</h1></section>';
  try {
    const userId = nextSession.user.id, cache = cacheFor(userId);
    let { data, error } = await client.from('driveos_workspaces').select('state,version').eq('owner_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) {
      const created = await client.from('driveos_workspaces').insert({ owner_id: userId, state: emptyState() }).select('state,version').single();
      if (created.error?.code === '23505') {
        const existing = await client.from('driveos_workspaces').select('state,version').eq('owner_id', userId).single();
        if (existing.error) throw existing.error; data = existing.data;
      } else { if (created.error) throw created.error; data = created.data; }
    }
    if (run !== generation) return;
    engine?.dispose();
    engine = new SyncEngine({ cache, repository: { save: async (state, version) => {
      const response = await client.from('driveos_workspaces').update({ state }).eq('owner_id', userId).eq('version', version).select('version').maybeSingle();
      if (response.error) {
        if (response.status === 401) response.error.code = 'AUTH';
        throw response.error;
      }
      return response.data;
    } }, onStatus: (state) => {
      if (run !== generation) return;
      status();
      if (state === 'auth') { lock(); message = '登入已過期，本機待同步草稿仍保留，請重新登入。'; renderGate(); }
    } });
    const state = engine.initialize(data, cache.read());
    activeUser = userId; session = nextSession; ready = true;
    stateToApp(state); root().innerHTML = ''; document.body.classList.remove('cloud-locked'); status();
  } catch (error) { if (run === generation) showProblem(new Error('請確認網路連線，以及是否已執行資料庫設定檔。雲端回應：' + String(error.message || '連線失敗'))); }
  finally { if (run === generation) connecting = false; }
}
function download(state, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dialog(html) {
  document.getElementById('modalroot').innerHTML = `<div class="modalback"><div class="modal cloud-panel" role="dialog" aria-modal="true">${html}<div class="actions"><button class="btn secondary" type="button" data-cloud-action="close">關閉</button></div></div></div>`;
}
function account() {
  const legacy = localStorage.getItem('driveos_v1');
  dialog(`<h2>帳號與雲端同步</h2><p>${escape(session?.user?.email || '')}</p><p class="cloud-note">${escape(statusLabels[engine?.status || 'loading'])}</p><p class="hint">${engine?.status === 'conflict' ? '另一個裝置已儲存較新資料。請先下載本機草稿，再載入雲端版本，避免覆蓋別人的更新。' : '儲存失敗時，草稿會保留在這台裝置；「已儲存到雲端」才表示其他裝置能讀到。'}</p><div class="cloud-actions"><button class="btn secondary" data-cloud-action="download">下載目前資料備份</button><button class="btn secondary" data-cloud-action="draft-backups">下載此帳號的本機待同步草稿</button><button class="btn secondary" data-cloud-action="retry">重試同步</button><button class="btn secondary" data-cloud-action="remote">載入雲端最新版本</button>${legacy ? '<button class="btn secondary" data-cloud-action="migrate">將原本本機資料搬到此帳號</button>' : ''}<button class="btn danger" data-cloud-action="logout">登出</button></div>`);
}
function connect() {
  dialog('<h2>連接雲端資料庫</h2><p class="cloud-note">建立 Supabase 專案並執行設定檔後，在此填入兩項公開連線資訊。若由管理者填入網站設定檔，其他裝置就不用重填。</p><form id="cloud-config"><label class="field">Project URL<input name="url" type="url" placeholder="https://專案編號.supabase.co" required></label><label class="field">Publishable key（公開金鑰）<input name="key" required placeholder="sb_publishable_…" autocomplete="off"></label><p class="hint">不能填資料庫密碼、secret 或 service_role 金鑰。</p><button class="btn" type="submit">儲存連線並前往登入</button></form>');
}
window.DriveOSData = {
  initialState(demo) {
    try {
      const c = configuration(); configured = !!c?.projectUrl;
      if (configured) { validateConfig(c); lock(); return emptyState(); }
      local = validateState(JSON.parse(localStorage.getItem('driveos_v1')) || structuredClone(demo)); return structuredClone(local);
    } catch (error) { configured = true; lock(); message = error.message; return emptyState(); }
  },
  persist(state) {
    if (!configured) { validateState(state); localStorage.setItem('driveos_v1', JSON.stringify(state)); local = structuredClone(state); return; }
    if (!ready || !session || !engine) throw new Error('請先登入並讀取雲端資料。');
    engine.enqueue(state);
  },
  snapshot() { return configured ? engine?.snapshot() || emptyState() : structuredClone(local); },
  isCloud: () => configured,
  isReady: () => !configured || ready,
  refreshStatus: status,
  async start() {
    status(); if (!configured) return;
    try {
      const c = validateConfig(configuration()); client = createClient(c.projectUrl, c.publishableKey);
      client.auth.onAuthStateChange((event, next) => {
        session = next;
        if (next && activeUser && next.user.id !== activeUser) { generation++; connecting = false; engine?.dispose(); engine = null; activeUser = null; lock(); stateToApp(emptyState()); }
        if (event === 'PASSWORD_RECOVERY') { generation++; connecting = false; lock(); mode = 'recovery'; message = ''; renderGate(); return; }
        if (!next) { generation++; connecting = false; engine?.dispose(); engine = null; activeUser = null; lock(); mode = 'login'; stateToApp(emptyState()); renderGate(); status(); }
        else if (mode !== 'recovery') setTimeout(() => void hydrate(next), 0);
      });
      renderGate();
      const { data, error } = await client.auth.getSession(); if (error) throw error;
      session = data.session;
      if (data.session && mode !== 'recovery') await hydrate(data.session);
    } catch (error) { showProblem(error); }
  }
};
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['cloud-config', 'cloud-login', 'cloud-password'].includes(form.id)) return;
  event.preventDefault(); const data = new FormData(form); const button = form.querySelector('[type=submit]'); button.disabled = true;
  try {
    if (form.id === 'cloud-config') { const c = validateConfig({ projectUrl: data.get('url'), publishableKey: data.get('key') }); localStorage.setItem(configKey, JSON.stringify(c)); location.reload(); }
    if (form.id === 'cloud-login') {
      if (mode === 'reset') {
        const redirectTo = location.origin + location.pathname;
        const { error } = await client.auth.resetPasswordForEmail(data.get('email'), { redirectTo });
        if (error) throw error; message = '如果這個帳號可以重設密碼，你會收到電子郵件，請到信箱查看。'; renderGate();
      } else {
        const { data: result, error } = await client.auth.signInWithPassword({ email: data.get('email'), password: data.get('password') });
        if (error) throw error; message = ''; session = result.session; await hydrate(result.session);
      }
    }
    if (form.id === 'cloud-password') {
      if (data.get('password') !== data.get('confirm')) throw new Error('兩次輸入的密碼不一致。');
      const { error } = await client.auth.updateUser({ password: data.get('password') }); if (error) throw error;
      mode = 'login'; message = ''; await hydrate(session);
    }
  } catch (error) {
    if (form.id === 'cloud-config') alert(error.message);
    else { message = error.message === '兩次輸入的密碼不一致。' ? error.message : authError(error); renderGate(); }
  } finally { button.disabled = false; }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-cloud-action]'); if (!button) return;
  const action = button.dataset.cloudAction;
  if (action === 'connect') connect();
  if (action === 'account') account();
  if (action === 'close') document.getElementById('modalroot').innerHTML = '';
  if (action === 'reset-view' || action === 'login-view') { mode = action === 'reset-view' ? 'reset' : 'login'; message = ''; renderGate(); }
  if (action === 'reload') location.reload();
  if (action === 'reset-config' && !window.DRIVEOS_CONFIG?.projectUrl) {
    localStorage.removeItem(configKey); location.reload();
  }
  if (action === 'download') download(window.DriveOSApp.snapshot(), 'driveos-account-backup.json');
  if (action === 'draft-backups') {
    const prefix = `driveos_cloud_cache:${new URL(client.supabaseUrl).host}:${session.user.id}:`;
    let found = 0;
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix))) {
      try { const cached = JSON.parse(localStorage.getItem(key)); if (cached?.dirty) { download(cached.state, `driveos-pending-${++found}.json`); } } catch (_) { /* Preserve unreadable caches. */ }
    }
    if (!found) alert('此帳號目前沒有本機待同步草稿。');
  }
  if (action === 'retry') { if (engine) { await engine.retry(); account(); } }
  if (action === 'remote') {
    if (engine?.hasPending()) {
      download(engine.snapshot(), 'driveos-unsynced-backup.json');
      if (!confirm('已開始下載本機待同步備份。確定改用雲端資料？請先確認備份已下載。')) return;
    }
    try {
      const cache = cacheFor(session.user.id); cache.write({ dirty: false }); activeUser = null; engine?.dispose();
      ready = false; document.getElementById('modalroot').innerHTML = ''; await hydrate(session);
    } catch (error) { alert(error.message); }
  }
  if (action === 'migrate') {
    try {
      const current = window.DriveOSApp.snapshot();
      if (['cars', 'leads', 'posts', 'deals'].some(k => current[k].length)) throw new Error('此帳號已有雲端資料。請先下載原本本機備份，再由設定頁檢查後還原，避免蓋掉資料。');
      const old = validateState(JSON.parse(localStorage.getItem('driveos_v1')));
      if (!confirm(`將這台瀏覽器原有 ${old.cars.length} 台車、${old.leads.length} 位客戶、${old.posts.length} 篇貼文及 ${old.deals.length} 筆轉介搬到 ${session.user.email}？`)) return;
      window.DriveOSData.persist(old); stateToApp(old); account();
    } catch (error) { alert(error.message); }
  }
  if (action === 'logout') {
    if (engine && !(await engine.flush()) && engine.hasPending()) { alert('還有未同步資料，請先下載備份或處理同步問題，再登出。'); return; }
    const { error } = await client.auth.signOut({ scope: 'local' }); if (error) alert(authError(error));
  }
});
window.addEventListener('beforeunload', event => { if (engine?.hasPending()) { event.preventDefault(); event.returnValue = ''; } });
