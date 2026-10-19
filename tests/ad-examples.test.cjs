const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../ad-examples.js');
test('five distinct example vehicles each have two grounded, clearly marked advertisement versions', () => {
  assert.equal(E.vehicles.length, 5);
  assert.equal(new Set(E.vehicles.map(car => car.id)).size, 5);
  const versions = [];
  for (const car of E.vehicles) {
    assert.equal(car.isDemo, true); assert.match(car.notes, /非凱爾/);
    for (const platform of ['facebook', 'threads']) {
      const text = E.copyFor(car.id, platform); versions.push(text);
      assert.ok(text.startsWith(E.disclaimer)); assert.match(text, /非真實庫存/);
      assert.ok(text.includes(car.brand) && text.includes(car.model));
      assert.ok(text.includes(car.price.toLocaleString('zh-TW')));
      assert.ok(text.includes(car.mileage.toLocaleString('zh-TW')));
      assert.doesNotMatch(text, /無事故|無泡水|全額貸|保證過件|市場最低|原鈑件|一手車/);
    }
  }
  assert.equal(new Set(versions).size, 10);
  assert.throws(() => E.copyFor('missing', 'facebook'));
});
