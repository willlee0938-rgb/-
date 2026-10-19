(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DriveOSWorkflow = factory();
})(globalThis, function () {
  'use strict';
  const platforms = ['Facebook社團', 'Threads'];
  const money = n => 'NT$ ' + Number(n).toLocaleString('zh-TW');
  const id = prefix => prefix + '-' + globalThis.crypto.randomUUID();
  const taipeiDay = time => new Date(new Date(time).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const carSnapshot = car => JSON.stringify([car.id, car.brand, car.model, car.year, car.mileage, car.price, car.status, car.notes, car.image]);
  function requireValue(condition, message) { if (!condition) throw new Error(message); }
  function eligible(car) {
    return car && car.status === '可售' && String(car.brand || '').trim() && String(car.model || '').trim()
      && Number.isInteger(Number(car.year)) && Number(car.year) >= 1900
      && Number(car.year) <= new Date().getFullYear() + 1
      && Number.isFinite(Number(car.price)) && Number(car.price) > 0
      && car.mileage !== '' && car.mileage != null && Number.isFinite(Number(car.mileage)) && Number(car.mileage) >= 0;
  }
  function textFor(car, platform) {
    requireValue(eligible(car), '車源必須可售，並有完整車款、年份、里程與售價。');
    const demo = car.isDemo || /示範/.test(car.notes || '') ? '【示範資料，請勿對外刊登】\n' : '';
    const title = `${car.year} ${car.brand} ${car.model}｜${money(car.price)}`;
    const facts = `里程 ${Number(car.mileage).toLocaleString('zh-TW')} 公里\n詳細車況與實際售價可協助向車行確認。`;
    const cta = '想了解這台車，歡迎私訊你的預算、用途及方便賞車的時間。\n我協助遠端媒合，由凱爾車業安排現場賞車、說明與簽約。';
    return demo + (platform === 'Threads' ? `最近在看中古車嗎？\n${title}\n${facts}\n\n${cta}` : `${title}\n${facts}\n\n${cta}`);
  }
  function generate(state, selectedPlatforms, limit = 5) {
    requireValue(selectedPlatforms.length && selectedPlatforms.every(x => platforms.includes(x)), '請選擇支援的平台。');
    requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 150, '每批車數須為 1–150 台。');
    const cars = state.cars.filter(car => eligible(car) && selectedPlatforms.some(platform => !state.posts.some(p => p.workflow && p.vehicleId === car.id && p.platform === platform && !['已發布', '已取消'].includes(p.status)))).slice(0, limit);
    let created = 0;
    for (const car of cars) for (const platform of [...new Set(selectedPlatforms)]) {
      if (state.posts.some(p => p.workflow && p.vehicleId === car.id && p.platform === platform && !['已發布', '已取消'].includes(p.status))) continue;
      state.posts.unshift({ id: id('POST'), workflow: true, vehicleId: car.id, platform,
        title: `${car.year} ${car.brand} ${car.model}`, content: textFor(car, platform),
        status: '待審核', date: taipeiDay(new Date()), views: 0, inquiries: 0, snapshot: carSnapshot(car) });
      created++;
    }
    return { created, eligible: state.cars.filter(eligible).length };
  }
  function postFor(state, postId) {
    const post = state.posts.find(p => p.id === postId && p.workflow);
    requireValue(post, '找不到這筆工作流程文案。');
    return post;
  }
  function resetApproval(post) {
    for (const key of ['approvedAt', 'approvedContent', 'approvedPlatform', 'scheduledAt', 'destination']) delete post[key];
    post.status = '待審核';
  }
  function reason(state, post) {
    const car = state.cars.find(c => c.id === post.vehicleId);
    if (!eligible(car)) return '車源已下架、已售出或資料不完整。';
    if (post.snapshot !== carSnapshot(car)) return '車價或車源資料已變更，請依最新車源重建文案。';
    if (post.approvedAt && (post.approvedContent !== post.content || post.approvedPlatform !== post.platform)) return '文案或平台已修改，請重新審核。';
    return '';
  }
  function reconcile(state) {
    let changed = false;
    for (const post of state.posts.filter(p => p.workflow && !['已發布', '已取消'].includes(p.status))) {
      const blocker = reason(state, post);
      if (blocker) {
        if (post.blockedReason !== blocker || post.approvedAt || post.scheduledAt || post.status !== '待審核') {
          resetApproval(post); post.blockedReason = blocker; changed = true;
        }
      } else if (post.blockedReason) { delete post.blockedReason; changed = true; }
    }
    return changed;
  }
  function edit(state, postId, content) {
    const post = postFor(state, postId);
    requireValue(!['已發布', '已取消'].includes(post.status), '歷史文案不能修改，請另建草稿。');
    requireValue(String(content).trim(), '文案不能空白。');
    post.content = content.trim(); resetApproval(post);
  }
  function rebuild(state, postId) {
    const post = postFor(state, postId);
    requireValue(!['已發布', '已取消'].includes(post.status), '歷史文案不能重建。');
    const car = state.cars.find(c => c.id === post.vehicleId);
    post.content = textFor(car, post.platform); post.snapshot = carSnapshot(car);
    resetApproval(post); delete post.blockedReason;
  }
  function approve(state, postId, now = new Date()) {
    const post = postFor(state, postId);
    requireValue(post.status === '待審核', '只有待審核文案可以核准。');
    requireValue(!reason(state, post), reason(state, post));
    requireValue(platforms.includes(post.platform) && String(post.content).trim(), '請先確認平台與文案。');
    post.status = '已核准'; post.approvedAt = new Date(now).toISOString();
    post.approvedContent = post.content; post.approvedPlatform = post.platform;
  }
  function schedule(state, { start, gapMinutes, dailyLimit, destinations }, now = new Date()) {
    const first = new Date(start).getTime();
    requireValue(Number.isFinite(first) && first > new Date(now).getTime(), '開始時間須晚於現在。');
    requireValue(Number.isInteger(gapMinutes) && gapMinutes >= 30 && gapMinutes <= 1440, '間隔須為 30–1440 分鐘。');
    requireValue(Number.isInteger(dailyLimit) && dailyLimit >= 1 && dailyLimit <= 10, '每個目的地每日提醒上限須為 1–10 篇。');
    const posts = state.posts.filter(p => p.workflow && p.status === '已核准');
    requireValue(posts.length, '請先審核至少一篇文案。');
    // Validate the whole batch before changing any post.
    for (const post of posts) {
      requireValue(!reason(state, post), reason(state, post));
      requireValue(post.approvedAt && post.approvedContent === post.content && post.approvedPlatform === post.platform, '文案缺少有效核准紀錄。');
      requireValue(typeof destinations[post.platform] === 'string' && destinations[post.platform].trim(), `請填寫 ${post.platform} 的發布目的地。`);
    }
    const occupied = state.posts.filter(p => p.workflow && ['已排程', '已發布'].includes(p.status) && (p.scheduledAt || p.publishedAt));
    const slots = new Map();
    function bucket(platform, destination) {
      const key = JSON.stringify([platform, destination]);
      if (!slots.has(key)) slots.set(key, { times: [], counts: new Map(), next: first });
      return slots.get(key);
    }
    function reserve(group, time) {
      const day = taipeiDay(time);
      group.times.push(time); group.counts.set(day, (group.counts.get(day) || 0) + 1);
    }
    for (const post of occupied) reserve(bucket(post.platform, post.destination), new Date(post.publishedAt || post.scheduledAt).getTime());
    const planned = [];
    for (const post of posts) {
      const destination = destinations[post.platform].trim();
      const group = bucket(post.platform, destination);
      let candidate = group.next;
      let found = false;
      for (let attempt = 0; attempt < 100000; attempt++) {
        const day = taipeiDay(candidate);
        if ((group.counts.get(day) || 0) >= dailyLimit) {
          candidate = new Date(day + 'T00:00:00+08:00').getTime() + 86400000;
          continue;
        }
        const nearby = group.times.filter(time => Math.abs(time - candidate) < gapMinutes * 60000);
        if (!nearby.length) { found = true; break; }
        candidate = Math.max(...nearby) + gapMinutes * 60000;
      }
      requireValue(found, '現有排程過於密集，請調整間隔。');
      reserve(group, candidate); group.next = candidate + gapMinutes * 60000;
      planned.push({ ...post, destination, scheduledAt: new Date(candidate).toISOString() });
    }
    for (const plan of planned) Object.assign(postFor(state, plan.id), {
      destination: plan.destination, scheduledAt: plan.scheduledAt, status: '已排程', deliveryMode: 'manual'
    });
    return planned.length;
  }
  function markPublished(state, postId, postUrl, now = new Date()) {
    const post = postFor(state, postId);
    requireValue(['已核准', '已排程'].includes(post.status) && post.approvedAt, '請先核准文案。');
    requireValue(!reason(state, post), reason(state, post));
    const car = state.cars.find(c => c.id === post.vehicleId);
    requireValue(!car.isDemo && !/示範/.test(car.notes || ''), '示範車源不能記錄為真實發布，請先加入實際授權庫存。');
    let url; try { url = new URL(postUrl); } catch (_) { throw new Error('請填入實際貼文的 HTTPS 網址。'); }
    const hosts = post.platform === 'Threads' ? ['threads.net', 'threads.com'] : ['facebook.com', 'fb.com'];
    requireValue(url.protocol === 'https:' && !url.username && !url.password && url.pathname !== '/' && hosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h)), '請填入對應平台的實際 HTTPS 貼文網址。');
    post.status = '已發布'; post.publishedAt = new Date(now).toISOString(); post.externalPostUrl = url.href;
  }
  function cancel(state, postId) {
    const post = postFor(state, postId);
    requireValue(post.status !== '已發布', '已發布紀錄須保留。');
    post.status = '已取消'; delete post.scheduledAt;
  }
  function refer(state, input, now = new Date()) {
    const lead = state.leads.find(l => l.id === input.leadId);
    const car = state.cars.find(c => c.id === input.vehicleId);
    requireValue(lead && !['已成交', '未成交'].includes(lead.stage), '請選擇尚未結案的客戶。');
    requireValue(car && car.status === '可售', '請選擇仍可售的車源。');
    requireValue(String(input.partnerRep || '').trim(), '請填寫車行接待窗口。');
    requireValue(input.consent === true, '請先確認客戶同意將聯絡資料轉交車行。');
    requireValue(!state.deals.some(d => d.leadId === lead.id && d.vehicleId === car.id && !['未成交', '已取消'].includes(d.status)), '這位客戶與這台車已有轉介紀錄。');
    const commission = input.commission === '' || input.commission == null ? null : Number(input.commission);
    requireValue(commission === null || (Number.isFinite(commission) && commission >= 0), '預計佣金須為零或正數，也可留空。');
    requireValue(!input.appointmentAt || Number.isFinite(new Date(input.appointmentAt).getTime()), '賞車時間格式不正確。');
    const deal = { id: id('DEAL'), workflow: true, leadId: lead.id, vehicleId: car.id,
      customer: lead.name, contact: lead.contact, source: lead.source, interest: lead.interest, budget: lead.budget,
      car: `${car.year} ${car.brand} ${car.model}`, dealer: '凱爾車業', partnerRep: input.partnerRep.trim(),
      appointmentAt: input.appointmentAt || null, consentAt: new Date(now).toISOString(),
      date: taipeiDay(now), referredAt: new Date(now).toISOString(), status: '已轉介',
      commission, confirmedCommission: null, paid: '未入帳', notes: input.notes || '' };
    state.deals.unshift(deal); lead.stage = '已轉介'; return deal;
  }
  function handoff(deal) {
    const appointment = deal.appointmentAt ? new Date(deal.appointmentAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '待車行與客戶確認';
    return `【凱爾車業｜遠端客戶轉介】\n轉介編號：${deal.id}\n客戶：${deal.customer}\n聯絡方式：${deal.contact || '待補'}\n來源：${deal.source || '待補'}\n意向車款：${deal.car}\n預算：${deal.budget ? money(deal.budget) : '待確認'}\n需求：${deal.interest || '待確認'}\n接待窗口：${deal.partnerRep}\n賞車時間（台北）：${appointment}\n備註：${deal.notes || '無'}\n\n請車行接手聯繫、賞車、簽約及交車，並回報是否到店、成交結果及確認佣金。`;
  }
  function outcome(state, dealId, input, now = new Date()) {
    const deal = state.deals.find(d => d.id === dealId && d.workflow);
    requireValue(deal, '找不到轉介紀錄。');
    requireValue(['已轉介', '已到店', '已成交', '未成交'].includes(input.status), '請選擇有效的車行回報狀態。');
    const confirmed = input.confirmedCommission === '' || input.confirmedCommission == null ? null : Number(input.confirmedCommission);
    requireValue(confirmed === null || (Number.isFinite(confirmed) && confirmed >= 0), '確認佣金須為零或正數，也可留空。');
    requireValue(!input.paid || (input.status === '已成交' && confirmed !== null), '入帳前須由車行確認成交與佣金金額。');
    requireValue(input.status === '已成交' || confirmed === null, '確認佣金僅能記錄於已成交案件。');
    Object.assign(deal, { status: input.status, confirmedCommission: confirmed, paid: input.paid ? '已入帳' : '未入帳',
      commissionPaidAt: input.paid ? (deal.commissionPaidAt || new Date(now).toISOString()) : null,
      lastFeedbackAt: new Date(now).toISOString(), feedback: input.feedback || '' });
    const lead = state.leads.find(l => l.id === deal.leadId);
    if (lead) {
      const related = state.deals.filter(d => d.leadId === lead.id);
      lead.stage = related.some(d => d.status === '已成交') ? '已成交'
        : related.some(d => !['未成交', '已取消'].includes(d.status)) ? '已轉介' : '未成交';
    }
    return deal;
  }
  return { platforms, eligible, carSnapshot, textFor, generate, reason, reconcile, edit, rebuild, approve, schedule, markPublished, cancel, refer, handoff, outcome, taipeiDay };
});
