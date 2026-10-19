(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./broker-workflow.js'), require('./vehicle-photos.js'));
  else root.DriveOSPublishing = factory(root.DriveOSWorkflow, root.VehiclePhotos);
})(globalThis, function (W, Photos) {
  'use strict';
  const requireValue = (value, message) => { if (!value) throw new Error(message); };
  const isDemo = car => !!car?.isDemo || /示範/.test(car?.notes || '');
  const targets = state => state.settings?.publicationTargets || [];
  const deliveries = state => state.posts.flatMap(post => (post.deliveries || []).map(task => ({ post, task })));
  function targetUrl(platform, value) {
    let url; try { url = new URL(String(value).trim()); } catch (_) { throw new Error('請貼上完整的社團或 Threads 個人頁 HTTPS 網址。'); }
    requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.port, '請使用不含帳密的 HTTPS 網址。');
    if (platform === 'Facebook社團') {
      requireValue(['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname) && /^\/groups\/[a-zA-Z0-9._-]+\/?$/.test(url.pathname), '請使用 Facebook 社團首頁網址，例如 https://www.facebook.com/groups/123456/。');
      return 'https://www.facebook.com' + url.pathname.replace(/\/$/, '') + '/';
    }
    requireValue(platform === 'Threads' && ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'].includes(url.hostname) && /^\/@[a-zA-Z0-9._]+\/?$/.test(url.pathname), '請使用 Threads 個人頁網址，例如 https://www.threads.com/@你的帳號。');
    return 'https://www.threads.com' + url.pathname.replace(/\/$/, '').toLowerCase();
  }
  function addTarget(state, input) {
    const name = String(input.name || '').trim(), platform = input.platform, url = targetUrl(platform, input.url);
    requireValue(name && name.length <= 100, '發布位置名稱請填 1–100 個字。');
    requireValue(!targets(state).some(target => target.url === url), '這個發布位置已經存過了。');
    requireValue(targets(state).length < 100, '最多保存 100 個發布位置。');
    const target = { id: crypto.randomUUID(), name, platform, url };
    state.settings ||= {}; state.settings.publicationTargets = [...targets(state), target]; return target;
  }
  function removeTarget(state, id) {
    state.settings ||= {}; state.settings.publicationTargets = targets(state).filter(target => target.id !== id);
  }
  function prepare(state, vehicleId) {
    const car = state.cars.find(car => car.id === vehicleId);
    requireValue(W.eligible(car), '請先補齊可售車的品牌、車型、年份、里程及售價。');
    return W.generate({ ...state, cars: [car] }, W.platforms, 1);
  }
  function photoIndexes(state, post) {
    const car = state.cars.find(car => car.id === post.vehicleId);
    return post.publishPhotoIndexes || Photos.gallery(car || {}).slice(0, 20).map((_, index) => index);
  }
  function setPhotos(state, post, indexes) {
    const car = state.cars.find(car => car.id === post.vehicleId), images = Photos.gallery(car || {});
    requireValue(Array.isArray(indexes) && indexes.length <= 20 && indexes.every(index => Number.isInteger(index) && index >= 0 && !!images[index]), '照片已變更，請重新選擇。');
    post.publishPhotoIndexes = [...new Set(indexes)].sort((a, b) => a - b);
  }
  const reviewKey = post => JSON.stringify([post.approvedAt, post.content, post.platform, post.approvedPhotoIndexes]);
  function blocker(state, post, task) {
    if (task && ['published', 'rehearsed', 'cancelled'].includes(task.status)) return '';
    const reason = W.reason(state, post); if (reason) return reason;
    if (!['已核准', '已排程'].includes(post.status) || !post.approvedAt || post.approvedContent !== post.content || post.approvedPlatform !== post.platform) return '文案尚未核准，請先審核。';
    if (post.approvedPhotoIndexes !== JSON.stringify(photoIndexes(state, post))) return '照片選擇已變更，請重新審核。';
    if (task && task.reviewKey !== reviewKey(post)) return '審核內容已變更，請重新加入發布清單。';
    return '';
  }
  function queue(state, postId, ids, now = new Date(), remindAt = null) {
    const post = state.posts.find(post => post.id === postId && post.workflow);
    requireValue(post, '找不到文案。'); requireValue(!blocker(state, post), blocker(state, post));
    requireValue(photoIndexes(state, post).length, '請先上傳照片，並至少選擇一張。');
    requireValue(Array.isArray(ids) && ids.length, '請勾選至少一個發布位置。');
    requireValue(!remindAt || (Number.isFinite(new Date(remindAt).getTime()) && new Date(remindAt) > new Date(now)), '預定發布時間須晚於現在，或留空立即準備。');
    const selected = [...new Set(ids)].map(id => targets(state).find(target => target.id === id));
    requireValue(selected.every(target => target && target.platform === post.platform), '發布位置已移除或平台不符，請重新勾選。');
    for (const target of selected) requireValue(targetUrl(target.platform, target.url) === target.url, '發布位置網址已失效，請重新設定。');
    post.deliveries ||= []; let created = 0;
    for (const target of selected) {
      const existing = post.deliveries.find(task => task.target.id === target.id && task.status !== 'cancelled');
      if (existing && ['published', 'rehearsed'].includes(existing.status)) continue;
      if (existing && existing.status === 'pending' && existing.reviewKey === reviewKey(post)) continue;
      const task = { id: existing?.id || crypto.randomUUID(), target: { ...target }, status: 'pending', content: post.content,
        photoIndexes: [...photoIndexes(state, post)], reviewKey: reviewKey(post), queuedAt: new Date(now).toISOString(), remindAt: remindAt ? new Date(remindAt).toISOString() : null, deliveryMode: 'manual' };
      if (existing) Object.assign(existing, task, { blockedReason: '' }); else post.deliveries.push(task);
      created++;
    }
    return created;
  }
  function reviewAndQueue(state, postId, { content, indexes, targetIds, remindAt }, now = new Date()) {
    const index = state.posts.findIndex(post => post.id === postId && post.workflow);
    const post = index >= 0 ? structuredClone(state.posts[index]) : null;
    requireValue(post && !['已發布', '已取消'].includes(post.status), '請先準備新的文案。');
    const next = { ...state, posts: state.posts.map((item, position) => position === index ? post : item) };
    let text = String(content || '').trim(); requireValue(text && text.length <= 10000, '文案請填 1–10000 個字。');
    if (isDemo(state.cars.find(car => car.id === post.vehicleId)) && !text.startsWith('【示範')) text = '【示範資料，請勿對外刊登】\n' + text;
    if (text !== post.content || JSON.stringify(indexes) !== JSON.stringify(photoIndexes(next, post)) || (post.approvedAt && post.approvedPhotoIndexes === undefined)) W.edit(next, post.id, text);
    setPhotos(next, post, indexes);
    if (post.status === '待審核') W.approve(next, post.id, now);
    const count = queue(next, post.id, targetIds, now, remindAt);
    state.posts[index] = post;
    return count;
  }
  function reconcile(state) {
    let changed = false;
    for (const { post, task } of deliveries(state)) if (['pending', 'blocked'].includes(task.status)) {
      const reason = blocker(state, post, task);
      if (reason && (task.status !== 'blocked' || task.blockedReason !== reason)) { task.status = 'blocked'; task.blockedReason = reason; changed = true; }
    }
    return changed;
  }
  function taskFor(state, taskId) {
    const found = deliveries(state).find(({ task }) => task.id === taskId);
    requireValue(found, '找不到發布任務。'); return found;
  }
  function publishedUrl(target, value) {
    let url; try { url = new URL(String(value).trim()); } catch (_) { throw new Error('請貼上發布完成後的實際貼文 HTTPS 網址。'); }
    requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.port, '請使用實際貼文的 HTTPS 網址。');
    const dest = new URL(targetUrl(target.platform, target.url));
    if (target.platform === 'Facebook社團') {
      const group = dest.pathname.split('/')[2], match = url.pathname.match(/^\/groups\/([^/]+)\/(posts|permalink)\/([a-zA-Z0-9._-]+)\/?$/);
      requireValue(['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname) && match && match[1] === group, '請貼上這個社團內的實際貼文網址（/groups/社團編號/posts/貼文編號/），不能填社團首頁或其他社團。');
      url.hostname = 'www.facebook.com';
    } else {
      const match = url.pathname.match(/^\/(@[^/]+)\/post\/([a-zA-Z0-9_-]+)\/?$/);
      requireValue(['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'].includes(url.hostname) && match && match[1].toLowerCase() === dest.pathname.slice(1), '請貼上這個 Threads 帳號的實際貼文網址（/@帳號/post/貼文編號）。');
      url.hostname = 'www.threads.com';
    }
    url.search = ''; url.hash = ''; return url.href.replace(/\/$/, '');
  }
  function complete(state, taskId, value, now = new Date()) {
    const { post, task } = taskFor(state, taskId);
    requireValue(task.status === 'pending', '這個任務不在待發布狀態。');
    requireValue(!blocker(state, post, task), blocker(state, post, task));
    requireValue(!isDemo(state.cars.find(car => car.id === post.vehicleId)), '示範車只能試跑，不能記錄為真實發布。');
    const url = publishedUrl(task.target, value);
    requireValue(!deliveries(state).some(({ task: other }) => other.id !== task.id && other.postUrl === url), '這個貼文網址已記錄過，請勿重複計算。');
    Object.assign(task, { status: 'published', postUrl: url, publishedAt: new Date(now).toISOString() });
    if (post.deliveries.every(task => ['published', 'cancelled'].includes(task.status))) {
      post.status = '已發布'; post.publishedAt = task.publishedAt; post.externalPostUrl = url;
    }
    return task;
  }
  function rehearse(state, taskId) {
    const { post, task } = taskFor(state, taskId);
    requireValue(state.publishingDemo === true && isDemo(state.cars.find(car => car.id === post.vehicleId)), '只有獨立範例模式可試跑。');
    requireValue(task.status === 'pending' && !blocker(state, post, task), '請先審核並加入範例發布清單。');
    task.status = 'rehearsed';
  }
  function cancel(state, taskId) {
    const { task } = taskFor(state, taskId);
    requireValue(['pending', 'blocked'].includes(task.status), '已完成的發布紀錄會保留。'); task.status = 'cancelled';
  }
  return { targets, deliveries, isDemo, targetUrl, addTarget, removeTarget, prepare, photoIndexes, setPhotos, blocker, queue, reviewAndQueue, reconcile, taskFor, publishedUrl, complete, rehearse, cancel };
});
