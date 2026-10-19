const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../publishing-workflow.js');
const W = require('../broker-workflow.js');
const now = new Date('2026-10-19T04:00:00Z');
function fixture() {
  const s = { cars: [{ id: 'CAR-A', brand: 'Toyota', model: 'Altis', year: 2020, mileage: 50000, price: 450000, status: '可售', images: [{ url: 'https://photos.example/a.jpg' }, { url: 'https://photos.example/b.jpg' }] }], settings: {}, posts: [], leads: [], deals: [] };
  P.addTarget(s, { name: '社團 A', platform: 'Facebook社團', url: 'https://m.facebook.com/groups/123/?ref=share' });
  P.addTarget(s, { name: '社團 B', platform: 'Facebook社團', url: 'https://www.facebook.com/groups/456/' });
  P.addTarget(s, { name: 'Threads', platform: 'Threads', url: 'https://www.threads.net/@TestAccount' });
  P.prepare(s, 'CAR-A'); return s;
}
function queue(s, ids = P.targets(s).filter(t => t.platform === 'Facebook社團').map(t => t.id), extra = {}) {
  const post = s.posts.find(p => p.platform === 'Facebook社團');
  return P.reviewAndQueue(s, post.id, { content: post.content, indexes: [1], targetIds: ids, ...extra }, now);
}
test('targets normalize platform URLs, reject lookalike hosts, scripts, invalid paths, credentials and duplicates', () => {
  const s = fixture();
  assert.equal(P.targets(s)[0].url, 'https://www.facebook.com/groups/123/');
  assert.equal(P.targets(s)[2].url, 'https://www.threads.com/@testaccount');
  for (const url of ['javascript:alert(1)', 'https://facebook.com.evil.test/groups/123/', 'https://user@facebook.com/groups/123/', 'https://facebook.com/groups/123/posts/999/', 'https://facebook.com:444/groups/123/']) assert.throws(() => P.addTarget(s, { name: 'bad', platform: 'Facebook社團', url }));
  assert.throws(() => P.addTarget(s, { name: 'duplicate', platform: 'Facebook社團', url: 'https://facebook.com/groups/123/' }), /已經存過/);
});
test('review queues each selected destination once, keeps selection and only completes with per-group post URLs', () => {
  const s = fixture(); assert.equal(queue(s), 2); assert.equal(queue(s), 0);
  let pairs = P.deliveries(s); assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0].task.photoIndexes, [1]);
  assert.throws(() => P.complete(s, pairs[0].task.id, 'https://facebook.com/groups/123/'), /實際貼文/);
  assert.throws(() => P.complete(s, pairs[0].task.id, 'https://facebook.com/groups/456/posts/7'), /實際貼文/);
  assert.throws(() => P.complete(s, pairs[0].task.id, 'https://facebook.com.evil.test/groups/123/posts/7'), /實際貼文/);
  P.complete(s, pairs[0].task.id, 'https://m.facebook.com/groups/123/posts/7/?ref=share', now);
  assert.equal(s.posts.find(p => p.platform === 'Facebook社團').status, '已核准');
  P.complete(s, pairs[1].task.id, 'https://www.facebook.com/groups/456/permalink/8/', now);
  assert.equal(s.posts.find(p => p.platform === 'Facebook社團').status, '已發布');
  assert.equal(pairs[0].task.postUrl, 'https://www.facebook.com/groups/123/posts/7');
});
test('invalid targets, photo indices and reminder times leave approval and tasks unchanged', () => {
  const s = fixture(), before = structuredClone(s);
  assert.throws(() => queue(s, []), /勾選/); assert.deepEqual(s, before);
  assert.throws(() => queue(s, [P.targets(s)[2].id]), /平台不符/); assert.deepEqual(s, before);
  assert.throws(() => queue(s, undefined, { indexes: [200] }), /照片/); assert.deepEqual(s, before);
  assert.throws(() => queue(s, undefined, { indexes: [] }), /至少選擇/); assert.deepEqual(s, before);
  assert.throws(() => queue(s, undefined, { remindAt: 'invalid' }), /發布時間/); assert.deepEqual(s, before);
  assert.equal(queue(s, undefined, { remindAt: '2026-10-20T12:00:00+08:00' }), 2);
  assert.equal(P.deliveries(s)[0].task.remindAt, '2026-10-20T04:00:00.000Z');
  P.reconcile(s); assert.ok(P.deliveries(s).every(({ task }) => task.status === 'pending'));
});
test('stale prices, sold inventory, copy and photo changes block tasks while preserving completed history', () => {
  const s = fixture(); queue(s); const pairs = P.deliveries(s);
  P.complete(s, pairs[0].task.id, 'https://facebook.com/groups/123/posts/7', now);
  s.cars[0].price = 420000; W.reconcile(s); P.reconcile(s);
  assert.equal(pairs[1].task.status, 'blocked'); assert.equal(pairs[0].task.status, 'published');
  assert.throws(() => P.complete(s, pairs[1].task.id, 'https://facebook.com/groups/456/posts/7'), /待發布/);
  const post = s.posts.find(p => p.platform === 'Facebook社團'); W.rebuild(s, post.id);
  assert.equal(queue(s), 1); assert.equal(P.deliveries(s).length, 2);
  const refreshed = P.deliveries(s)[1]; assert.equal(refreshed.task.status, 'pending');
  assert.match(refreshed.task.content, /420,000/); assert.match(P.deliveries(s)[0].task.content, /450,000/);
  s.posts.find(p => p.id === post.id).publishPhotoIndexes = [0]; W.reconcile(s); P.reconcile(s);
  assert.equal(refreshed.task.status, 'blocked');
  s.cars[0].status = '已售出'; W.reconcile(s); P.reconcile(s);
  assert.throws(() => queue(s), /下架|已售出/);
});
test('cancel and remove destination retain history; old broker cannot bypass delivery tracking', () => {
  const s = fixture(); queue(s); const pairs = P.deliveries(s);
  assert.throws(() => W.markPublished(s, pairs[0].post.id, 'https://facebook.com/groups/123/posts/1'), /逐站/);
  P.removeTarget(s, P.targets(s)[0].id); assert.equal(pairs[0].task.target.name, '社團 A');
  P.cancel(s, pairs[0].task.id); assert.equal(queue(s), 0);
  P.complete(s, pairs[1].task.id, 'https://facebook.com/groups/456/posts/9');
  assert.equal(s.posts.find(p => p.id === pairs[1].post.id).status, '已發布');
});
test('demo rehearsal is separate from real publication and preserves disclaimer', () => {
  const s = fixture(); s.cars[0].isDemo = true; s.publishingDemo = true; W.rebuild(s, s.posts.find(p => p.platform === 'Facebook社團').id);
  queue(s, undefined, { content: '測試文案' }); const pair = P.deliveries(s)[0];
  assert.match(pair.task.content, /^【示範/);
  assert.throws(() => P.complete(s, pair.task.id, 'https://facebook.com/groups/123/posts/7'), /示範/);
  P.rehearse(s, pair.task.id); assert.equal(pair.task.status, 'rehearsed'); assert.equal(pair.task.postUrl, undefined);
  const real = fixture(); queue(real); assert.throws(() => P.rehearse(real, P.deliveries(real)[0].task.id), /獨立範例/);
});
test('Threads evidence must belong to the selected account, and existing broker approvals can enter workspace', () => {
  const s = fixture(), post = s.posts.find(p => p.platform === 'Threads'); W.approve(s, post.id, now);
  P.reviewAndQueue(s, post.id, { content: post.content, indexes: [0], targetIds: [P.targets(s)[2].id] }, now);
  const pair = P.deliveries(s)[0];
  assert.throws(() => P.complete(s, pair.task.id, 'https://threads.com/@other/post/123'), /帳號/);
  P.complete(s, pair.task.id, 'https://threads.net/@TestAccount/post/ABC'); assert.equal(pair.post.status, '已發布');
});
