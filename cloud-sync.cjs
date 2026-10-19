'use strict';
const clone = value => structuredClone(value);
const emptyState = () => ({ cars: [], leads: [], posts: [], deals: [], settings: {}, imports: [] });
function validateState(state) {
  if (!state || !['cars', 'leads', 'posts', 'deals'].every(key => Array.isArray(state[key]))) throw new Error('資料格式不完整，請先匯出備份再處理。');
  if (new TextEncoder().encode(JSON.stringify(state)).length > 7 * 1024 * 1024) throw new Error('資料超過 7MB，請改用照片網址或縮小圖片，再重新儲存。');
  return state;
}
class SyncEngine {
  constructor({ repository, cache, onStatus = () => {} }) {
    Object.assign(this, { repository, cache, onStatus, pending: null, running: null, timer: null, status: 'loading', version: 0, current: emptyState() });
  }
  setStatus(status, error = null) { this.status = status; this.error = error; this.onStatus(status, error); }
  initialize(remote, cached) {
    this.version = remote.version; this.current = clone(validateState(remote.state));
    if (cached?.dirty) {
      this.current = clone(validateState(cached.state)); this.pending = clone(this.current);
      this.setStatus(cached.version === remote.version ? 'paused' : 'conflict');
    } else {
      this.cache.write({ version: this.version, state: this.current, dirty: false }); this.setStatus('saved');
    }
    return clone(this.current);
  }
  enqueue(state) {
    if (['conflict', 'loading', 'auth'].includes(this.status)) throw new Error('請先處理登入或版本衝突，再修改資料。');
    validateState(state);
    this.cache.write({ version: this.version, state, dirty: true });
    this.current = clone(state); this.pending = clone(state);
    if (['error', 'paused'].includes(this.status)) return;
    this.setStatus('saving'); clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 200);
  }
  async flush() {
    clearTimeout(this.timer); this.timer = null;
    if (this.running) return this.running;
    if (['conflict', 'auth', 'loading'].includes(this.status)) return false;
    this.running = this.drain();
    try { return await this.running; } finally { this.running = null; }
  }
  async drain() {
    while (this.pending) {
      const snapshot = this.pending; this.pending = null; this.setStatus('saving');
      try {
        const result = await this.repository.save(snapshot, this.version);
        if (!result) { const error = new Error('另一個裝置已更新資料，請先下載本機備份，再載入雲端版本。'); error.code = 'CONFLICT'; throw error; }
        this.version = result.version;
        this.cache.write({ version: this.version, state: this.pending || snapshot, dirty: !!this.pending });
      } catch (error) {
        this.pending ||= snapshot;
        this.setStatus(error.code === 'CONFLICT' ? 'conflict' : error.code === 'AUTH' ? 'auth' : 'error', error);
        return false;
      }
    }
    this.setStatus('saved'); return true;
  }
  async retry() {
    if (['conflict', 'auth'].includes(this.status)) return false;
    return this.flush();
  }
  hasPending() { return !!this.pending || !!this.running; }
  snapshot() { return clone(this.current); }
  dispose() { clearTimeout(this.timer); this.timer = null; }
}
module.exports = { SyncEngine, emptyState, validateState };
