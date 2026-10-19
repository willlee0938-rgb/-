const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('../broker-workflow.js');
const now = new Date('2026-10-19T04:00:00Z');
const car = (id, extra = {}) => ({ id, brand: 'Toyota', model: 'Altis', year: 2020, mileage: 50000, price: 450000, status: '可售', notes: '授權車源測試資料', ...extra });
const state = (cars = [car('CAR-1')]) => ({ cars, posts: [], deals: [], leads: [{ id: 'LEAD-1', name: '測試客戶', contact: 'test-contact', source: 'Threads', interest: '通勤', budget: 500000, stage: '需求確認' }] });
function approved(s, platforms = ['Threads']) { W.generate(s, platforms, 150); s.posts.forEach(p => W.approve(s, p.id, now)); }
const options = extra => ({ start: '2026-10-19T23:30:00+08:00', gapMinutes: 60, dailyLimit: 2, destinations: { Threads: 'sales-account', 'Facebook社團': '授權社團' }, ...extra });

test('drafts use confirmed fields, skip unavailable/incomplete cars and avoid duplicate active drafts', () => {
  const s = state([car('A'), car('B', { status: '已售出' }), car('C', { price: 0 }), car('D', { mileage: '' })]);
  assert.equal(W.generate(s, ['Threads', 'Facebook社團'], 5).created, 2);
  assert.equal(W.generate(s, ['Threads', 'Facebook社團'], 5).created, 0);
  assert.match(s.posts[0].content, /450,000/);
  assert.doesNotMatch(s.posts[0].content, /無事故|全額貸|保固|最低價/);
  assert.equal(s.posts[0].status, '待審核');
});
test('subsequent batches advance to cars without active drafts', () => {
  const s = state(Array.from({ length: 6 }, (_, i) => car('C' + i)));
  assert.equal(W.generate(s, ['Threads'], 3).created, 3);
  assert.equal(W.generate(s, ['Threads'], 3).created, 3);
  assert.equal(W.generate(s, ['Threads'], 3).created, 0);
});
test('150 authorized vehicles prepare 300 platform drafts without exceeding per-destination daily reminders', () => {
  const s = state(Array.from({ length: 150 }, (_, i) => car('C' + i)));
  approved(s, ['Threads', 'Facebook社團']);
  assert.equal(s.posts.length, 300);
  assert.equal(W.schedule(s, options({ dailyLimit: 3, gapMinutes: 240 }), now), 300);
  const counts = {};
  for (const post of s.posts) {
    const key = [post.platform, post.destination, W.taipeiDay(post.scheduledAt)].join('|');
    counts[key] = (counts[key] || 0) + 1;
  }
  assert.ok(Object.values(counts).every(n => n <= 3));
});
test('price changes revoke approval and schedule; stale copy cannot be reapproved until rebuilt', () => {
  const s = state(); approved(s); W.schedule(s, options(), now);
  s.cars[0].price = 420000;
  assert.equal(W.reconcile(s), true);
  assert.equal(s.posts[0].status, '待審核');
  assert.equal(s.posts[0].scheduledAt, undefined);
  assert.throws(() => W.approve(s, s.posts[0].id), /車價或車源/);
  W.rebuild(s, s.posts[0].id);
  assert.match(s.posts[0].content, /420,000/);
  W.approve(s, s.posts[0].id, now);
  assert.equal(s.posts[0].status, '已核准');
});
test('sold cars and edits through the existing post editor invalidate approval', () => {
  const s = state(); approved(s);
  s.posts[0].content += '\n新增說明';
  assert.equal(W.reconcile(s), true);
  assert.equal(s.posts[0].approvedAt, undefined);
  W.approve(s, s.posts[0].id, now);
  s.cars[0].status = '已售出'; W.reconcile(s);
  assert.equal(s.posts[0].status, '待審核');
  assert.throws(() => W.rebuild(s, s.posts[0].id), /可售/);
});
test('Taipei quotas, spacing and existing schedules apply per destination; time passing never publishes', () => {
  const s = state([car('A'), car('B'), car('C')]); approved(s);
  assert.equal(W.schedule(s, options({ gapMinutes: 30, dailyLimit: 1 }), now), 3);
  const times = s.posts.map(p => p.scheduledAt);
  assert.equal(new Set(times.map(W.taipeiDay)).size, 3);
  assert.deepEqual(times.map(t => new Date(t).toISOString().slice(0, 10)), ['2026-10-19', '2026-10-19', '2026-10-20']);
  W.reconcile(s); assert.ok(s.posts.every(p => p.status === '已排程' && p.deliveryMode === 'manual'));
  s.cars.push(car('D')); W.generate(s, ['Threads'], 150);
  W.approve(s, s.posts[0].id, now); W.schedule(s, options({ gapMinutes: 30, dailyLimit: 1 }), now);
  assert.equal(new Set(s.posts.map(p => W.taipeiDay(p.scheduledAt))).size, 4);
});
test('scheduling rejects missing approval evidence, stale inventory and missing destinations atomically', () => {
  const s = state([car('A'), car('B')]); approved(s, ['Threads', 'Facebook社團']);
  assert.throws(() => W.schedule(s, options({ destinations: { Threads: 'account' } }), now), /目的地/);
  assert.ok(s.posts.every(p => p.status === '已核准' && !p.scheduledAt));
  delete s.posts[0].approvedAt;
  assert.throws(() => W.schedule(s, options(), now), /核准紀錄/);
  W.approve(s, (s.posts[0].status = '待審核', s.posts[0].id), now);
  s.cars[0].price++;
  assert.throws(() => W.schedule(s, options(), now), /車價或車源/);
  assert.ok(s.posts.every(p => !p.scheduledAt));
});
test('real publication requires a matching platform HTTPS URL and never accepts demonstration inventory', () => {
  const s = state(); approved(s); const id = s.posts[0].id;
  for (const url of ['http://threads.net/@x/post/1', 'https://threads.net.evil.test/post/1', 'https://facebook.com/post/1', 'https://name:password@threads.net/post/1', 'https://threads.net/']) {
    assert.throws(() => W.markPublished(s, id, url, now));
  }
  W.markPublished(s, id, 'https://www.threads.com/@sales/post/123', now);
  assert.equal(s.posts[0].status, '已發布');
  assert.equal(s.posts[0].publishedAt, now.toISOString());
  s.cars[0].status = '已售出'; W.reconcile(s);
  assert.equal(s.posts[0].status, '已發布', 'history must remain intact');
  const demo = state([car('D', { notes: '示範資料' })]); approved(demo);
  assert.match(demo.posts[0].content, /示範資料/);
  assert.throws(() => W.markPublished(demo, demo.posts[0].id, 'https://threads.net/@sales/post/1'), /示範車源/);
});
test('referral requires consent and a vehicle/lead relation, prevents duplicates and snapshots the handoff', () => {
  const s = state(); const input = { leadId: 'LEAD-1', vehicleId: 'CAR-1', partnerRep: '車行窗口', commission: '', consent: false };
  assert.throws(() => W.refer(s, input, now), /同意/);
  assert.equal(s.deals.length, 0);
  const deal = W.refer(s, { ...input, consent: true }, now);
  assert.equal(deal.commission, null); assert.equal(deal.confirmedCommission, null);
  assert.equal(s.leads[0].stage, '已轉介');
  assert.throws(() => W.refer(s, { ...input, consent: true }, now), /已有轉介/);
  assert.match(W.handoff(deal), /凱爾車業/); assert.match(W.handoff(deal), /test-contact/);
  s.leads[0].contact = 'changed'; assert.match(W.handoff(deal), /test-contact/);
});
test('commission is only paid after confirmed sale and amount; multiple referrals preserve active lead stage', () => {
  const s = state([car('CAR-1'), car('CAR-2')]);
  const first = W.refer(s, { leadId: 'LEAD-1', vehicleId: 'CAR-1', partnerRep: '窗口', commission: 12000, consent: true }, now);
  W.refer(s, { leadId: 'LEAD-1', vehicleId: 'CAR-2', partnerRep: '窗口', consent: true }, now);
  assert.throws(() => W.outcome(s, first.id, { status: '已成交', paid: true, confirmedCommission: '' }, now), /確認成交/);
  assert.throws(() => W.outcome(s, first.id, { status: '已到店', paid: true, confirmedCommission: 10000 }, now));
  W.outcome(s, first.id, { status: '未成交', confirmedCommission: '', paid: false }, now);
  assert.equal(s.leads[0].stage, '已轉介');
  W.outcome(s, first.id, { status: '已成交', confirmedCommission: 10000, paid: true }, now);
  assert.equal(first.commission, 12000); assert.equal(first.confirmedCommission, 10000);
  assert.equal(first.commissionPaidAt, now.toISOString()); assert.equal(s.leads[0].stage, '已成交');
  const restored = JSON.parse(JSON.stringify(s)); assert.equal(restored.deals.find(d => d.id === first.id).confirmedCommission, 10000);
});
