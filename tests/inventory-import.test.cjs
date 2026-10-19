const { test } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../inventory-import.js');
const W = require('../broker-workflow.js');
const base = extra => ({ externalId: 'K-001', brand: 'Toyota', model: 'Altis', year: 2020, mileageKm: 58000, price: 458000, status: 'available', ...extra });
const state = () => ({ cars: [], leads: [{ id: 'L' }], posts: [], deals: [{ id: 'D' }] });
test('CSV parses UTF-8 BOM, Chinese headers, quoted commas/newlines and escaped quotes', () => {
  const text = '\uFEFF車源編號,品牌,車型,年份,里程公里,售價元,狀態,備註\r\nK-001,Toyota,Altis,2020,"58,000","458,000",available,"第一行,內容\n第二行""引號"""\r\n';
  const rows = I.parse(text, 'dealer.csv'), plan = I.preview([], rows, '凱爾');
  assert.equal(plan.errors.length, 0); assert.equal(plan.entries[0].vehicle.price, 458000);
  assert.equal(plan.entries[0].vehicle.notes, '第一行,內容\n第二行"引號"');
  assert.throws(() => I.parse('id,name\n1,"unclosed', 'bad.csv'), /引號/);
  assert.throws(() => I.parse('id,id\n1,2', 'bad.csv'), /重複/);
});
test('JSON and units are validated; no silent zero price, unknown status remains pending', () => {
  assert.throws(() => I.parse('{"cars":[]}', 'backup.json'), /整站備份/);
  for (const price of ['', null, false, '45.8萬', '4,58,000', -1, 0]) assert.throws(() => I.normalize(base({ price }), '凱爾'));
  assert.equal(I.normalize(base({ status: 'unknown' }), '凱爾').vehicle.status, '待確認');
  assert.throws(() => I.normalize(base({ images: ['javascript:alert(1)'] }), '凱爾'), /HTTPS/);
});
test('preview is non-mutating; upsert preserves ID, CRM and referrals, omitted vehicles and local notes', () => {
  const s = state(); s.cars.push({ ...I.normalize(base({ description: '本機備註', images: ['https://example.com/a.jpg'] }), '凱爾').vehicle, id: 'LOCAL-1' }, { id: 'KEEP', status: '可售' });
  const before = structuredClone(s);
  const plan = I.preview(s.cars, [base({ price: 420000 })], '凱爾');
  assert.deepEqual(s, before); assert.equal(plan.counts['更新'], 1);
  I.apply(s, plan, 'inventory.json');
  assert.equal(s.cars[0].id, 'LOCAL-1'); assert.equal(s.cars[0].price, 420000);
  assert.equal(s.cars[0].notes, '本機備註'); assert.equal(s.cars[0].images.length, 1);
  assert.deepEqual(s.cars[1], before.cars[1]); assert.deepEqual(s.leads, before.leads); assert.deepEqual(s.deals, before.deals);
  assert.equal(I.preview(s.cars, [base({ price: 420000 })], '凱爾').counts['不變'], 1);
});
test('duplicates, invalid rows and inventory changes prevent the entire import', () => {
  const s = state();
  const duplicate = I.preview([], [base(), base()], '凱爾');
  assert.equal(duplicate.errors.length, 1); assert.throws(() => I.apply(s, duplicate, 'file.json')); assert.equal(s.cars.length, 0);
  const invalid = I.preview([], [base(), base({ externalId: 'K-002', year: 'bad' })], '凱爾');
  assert.throws(() => I.apply(s, invalid, 'file.json')); assert.equal(s.cars.length, 0);
  const valid = I.preview([], [base()], '凱爾'); s.cars.push({ id: 'manual' });
  assert.throws(() => I.apply(s, valid, 'file.json'), /重新預覽/);
});
test('150 vehicles import idempotently; sold updates invalidate advertising without deleting history', () => {
  const s = state(), rows = Array.from({ length: 150 }, (_, i) => base({ externalId: 'K-' + i }));
  I.apply(s, I.preview(s.cars, rows, '凱爾'), '150.json'); assert.equal(s.cars.length, 150);
  assert.equal(I.preview(s.cars, rows, '凱爾').counts['不變'], 150);
  W.generate(s, ['Threads'], 1); W.approve(s, s.posts[0].id);
  I.apply(s, I.preview(s.cars, [base({ externalId: 'K-0', status: 'sold' })], '凱爾'), 'sold.json'); W.reconcile(s);
  assert.equal(s.cars.length, 150); assert.equal(s.posts[0].status, '待審核'); assert.equal(s.posts[0].approvedAt, undefined);
});
