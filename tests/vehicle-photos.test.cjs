const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../vehicle-photos.js');
const W = require('../broker-workflow.js');
const owner = '11111111-1111-4111-8111-111111111111';
test('photo uploads enforce supported images, size, batch and per-vehicle limits', () => {
  P.validateFiles([{ type: 'image/jpeg', size: 1024 }], 19);
  for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: 'image/jpeg', size: 0 }, { type: 'image/png', size: 5242881 }]) {
    assert.throws(() => P.validateFiles([file], 0));
  }
  assert.throws(() => P.validateFiles([{ type: 'image/png', size: 5 }], 20));
  assert.throws(() => P.validateFiles([], 0));
});
test('object keys use the authenticated owner and unique file names, never user-supplied filenames', () => {
  const first = P.objectPath(owner, 'CAR/../1', 'image/jpeg');
  assert.ok(first.startsWith(owner + '/CAR%2F..%2F1/'));
  assert.notEqual(first, P.objectPath(owner, 'CAR/../1', 'image/jpeg'));
  assert.equal(P.owned(first, owner), true);
  assert.equal(P.owned(first, '22222222-2222-4222-8222-222222222222'), false);
  assert.equal(P.owned(owner + '/../other/photo.jpg', owner), false);
});
test('cover ordering and last-photo removal retain stable car identity and never persist signed URLs', () => {
  const car = { id: 'CAR-1', image: 'https://example.com/a.jpg', images: [{ url: 'https://example.com/a.jpg' }, { storagePath: owner + '/CAR-1/b.jpg' }] };
  const cover = P.setCover(car, 1);
  assert.equal(cover.id, car.id); assert.equal(cover.image, '');
  assert.equal(cover.images[0].storagePath, owner + '/CAR-1/b.jpg');
  assert.equal(cover.images[0].type, 'cover');
  assert.equal(car.images[0].url, 'https://example.com/a.jpg', 'input is immutable');
  const remaining = P.remove(cover, 1).car;
  const removed = P.remove(remaining, 0).car;
  assert.equal(P.gallery(removed).length, 0); assert.equal(removed.image, '');
});
test('cloud-photo cover changes invalidate approved ads even when both legacy image fields are empty', () => {
  const car = { id: 'CAR-1', brand: 'Toyota', model: 'Altis', year: 2020, price: 450000, mileage: 50000, status: '可售', image: '', images: [{ storagePath: owner + '/a.jpg' }, { storagePath: owner + '/b.jpg' }] };
  const state = { cars: [car], posts: [] };
  W.generate(state, ['Threads']); W.approve(state, state.posts[0].id);
  state.cars[0] = P.setCover(car, 1); W.reconcile(state);
  assert.equal(state.posts[0].status, '待審核'); assert.equal(state.posts[0].approvedAt, undefined);
});
